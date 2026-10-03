import {
  BadRequestException,
  ConflictException,
  Inject,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Prisma } from '@prisma/client';

import { runSerializableAccountingWrite } from './accounting-atomic-write';
import { writeAccountingAuditLog } from './accounting-audit-writer';
import { AccountingJournalSource } from './accounting-contracts';
import { ACCOUNTING_DB, type AccountingDb } from './accounting-db';
import {
  ACCOUNTING_EXTERNAL_SALE_SETTLEMENT_REVERSAL_SOURCE_FACT_TYPE,
  ACCOUNTING_EXTERNAL_SALE_SETTLEMENT_SOURCE_FACT_TYPE,
  ACCOUNTING_EXTERNAL_SALE_SOURCE_FACT_TYPE,
  type ReverseAccountingExternalSaleInputV1,
} from './accounting-external-sales.contract';
import {
  buildAccountingExternalSaleReversalStableId,
  buildAccountingExternalSaleReversalWritePlan,
  type AccountingExternalSaleOriginalJournalV1,
  type AccountingExternalSaleReversalFactV1,
  type AccountingExternalSaleReversalTargetV1,
} from './accounting-external-sales-reversal-journal-authority';
import { AccountingJournalService } from './accounting-journal.service';
import { AccountingJournalPolicyError } from './accounting-journal-policy';

const REVERSAL_ATTEMPTS = 2;
const MAX_REASON_LENGTH = 500;

type OriginalJournalRow = {
  entryStableId: string;
  source: string;
  sourceFactType: string | null;
  sourceFactStableId: string | null;
  sourceFactVersion: number | null;
  storeStableId: string | null;
  occurredAt: Date;
  currency: string;
  memo: string | null;
  deletedAt: Date | null;
  lines: Array<{
    lineNo: number;
    debitCents: number;
    creditCents: number;
    memo: string | null;
    account: { accountStableId: string };
    category: { categoryStableId: string } | null;
  }>;
};

export type AccountingExternalSaleReversalViewV1 = {
  version: 1;
  target: AccountingExternalSaleReversalTargetV1;
  targetStableId: string;
  reversalStableId: string;
  reversalJournalEntryStableId: string;
  reversalFactHash: string;
  reversalReason: string;
  reversedAt: string;
  reversedByActorRef: string;
};

const isUniqueConstraintError = (error: unknown): boolean =>
  typeof error === 'object' &&
  error !== null &&
  'code' in error &&
  (error as { code?: unknown }).code === 'P2002';

const requireReason = (input: ReverseAccountingExternalSaleInputV1): string => {
  if (!input || typeof input !== 'object' || typeof input.reason !== 'string') {
    throw new BadRequestException('reversal reason is required');
  }
  const reason = input.reason.trim();
  if (!reason) throw new BadRequestException('reversal reason is required');
  if (reason.length > MAX_REASON_LENGTH) {
    throw new BadRequestException(
      `reversal reason must not exceed ${MAX_REASON_LENGTH} characters`,
    );
  }
  return reason;
};

@Injectable()
export class AccountingExternalSaleReversalService {
  constructor(
    @Inject(ACCOUNTING_DB) private readonly prisma: AccountingDb,
    private readonly journal: AccountingJournalService,
  ) {}

  async reverseSale(
    externalSaleStableIdRaw: string,
    input: ReverseAccountingExternalSaleInputV1,
    actorRef: string,
  ): Promise<AccountingExternalSaleReversalViewV1> {
    const externalSaleStableId = this.requireStableId(
      externalSaleStableIdRaw,
      'externalSaleStableId',
    );
    const reason = requireReason(input);
    return this.withUniqueRetry(() =>
      this.reverseSaleOnce(externalSaleStableId, reason, actorRef),
    );
  }

  async reverseSettlement(
    settlementStableIdRaw: string,
    input: ReverseAccountingExternalSaleInputV1,
    actorRef: string,
  ): Promise<AccountingExternalSaleReversalViewV1> {
    const settlementStableId = this.requireStableId(
      settlementStableIdRaw,
      'settlementStableId',
    );
    const reason = requireReason(input);
    return this.withUniqueRetry(() =>
      this.reverseSettlementOnce(settlementStableId, reason, actorRef),
    );
  }

  private async withUniqueRetry<T>(work: () => Promise<T>): Promise<T> {
    let lastError: unknown;
    for (let attempt = 0; attempt < REVERSAL_ATTEMPTS; attempt += 1) {
      try {
        return await work();
      } catch (error) {
        lastError = error;
        if (!isUniqueConstraintError(error)) throw error;
      }
    }
    if (lastError instanceof Error) throw lastError;
    throw new ConflictException('External Sale reversal retry exhausted');
  }

  private async reverseSaleOnce(
    externalSaleStableId: string,
    reason: string,
    actorRef: string,
  ): Promise<AccountingExternalSaleReversalViewV1> {
    return runSerializableAccountingWrite(this.prisma, async (tx) => {
      const sale = await tx.accountingExternalSale.findUnique({
        where: { externalSaleStableId },
        select: {
          id: true,
          externalSaleStableId: true,
          storeStableId: true,
          currency: true,
          factHash: true,
          journalEntryStableId: true,
          reversalStableId: true,
          reversalFactHash: true,
          reversalJournalEntryStableId: true,
          reversedAt: true,
          reversedByActorRef: true,
          replacedByExternalSale: {
            select: { externalSaleStableId: true },
          },
          settlementAllocations: {
            select: {
              settlement: {
                select: {
                  settlementStableId: true,
                  journalEntryStableId: true,
                  reversalStableId: true,
                  reversalFactHash: true,
                  reversalJournalEntryStableId: true,
                  reversedAt: true,
                },
              },
            },
          },
        },
      });
      if (!sale) throw new NotFoundException('External Sale not found');
      if (!sale.journalEntryStableId) {
        throw new ConflictException(
          'External Sale is missing its canonical Journal anchor',
        );
      }
      if (
        sale.replacedByExternalSale &&
        !sale.reversalStableId &&
        !sale.reversalFactHash &&
        !sale.reversalJournalEntryStableId &&
        !sale.reversedAt
      ) {
        throw new ConflictException(
          'External Sale already has a replacement and cannot start a new reversal',
        );
      }

      await this.assertNoLiveSettlements(sale.settlementAllocations, tx);

      const originalJournal = await this.readOriginalJournal(
        sale.journalEntryStableId,
        'SALE',
        sale.externalSaleStableId,
        tx,
      );
      const plan = this.buildPlan({
        target: 'SALE',
        targetStableId: sale.externalSaleStableId,
        originalFactHash: sale.factHash,
        originalJournalEntryStableId: sale.journalEntryStableId,
        reversalReason: reason,
        originalJournal,
      });

      if (sale.reversalStableId || sale.reversalFactHash || sale.reversedAt) {
        this.assertReplayEvidence(
          {
            reversalStableId: sale.reversalStableId,
            reversalFactHash: sale.reversalFactHash,
            reversalJournalEntryStableId: sale.reversalJournalEntryStableId,
            reversedAt: sale.reversedAt,
            reversedByActorRef: sale.reversedByActorRef,
          },
          plan.authority.fact.reversalStableId,
          plan.authority.reversalFactHash,
          'External Sale',
        );
        const journal =
          await this.journal.createExternalSaleReversalJournalInTx(
            plan.journal,
            actorRef,
            plan.authority,
            tx,
          );
        if (journal.entryStableId !== sale.reversalJournalEntryStableId) {
          throw new ConflictException(
            'External Sale reversal is bound to a different reversal Journal',
          );
        }
        return this.toView({
          target: 'SALE',
          targetStableId: sale.externalSaleStableId,
          reversalStableId: plan.authority.fact.reversalStableId,
          reversalJournalEntryStableId: journal.entryStableId,
          reversalFactHash: plan.authority.reversalFactHash,
          reversalReason: reason,
          reversedAt: sale.reversedAt as Date,
          reversedByActorRef: sale.reversedByActorRef as string,
        });
      }

      const reversedAt = new Date();
      await tx.accountingExternalSale.update({
        where: { id: sale.id },
        data: {
          reversalStableId: plan.authority.fact.reversalStableId,
          reversalFactHash: plan.authority.reversalFactHash,
          reversedAt,
          reversedByActorRef: actorRef,
        },
        select: {
          externalSaleStableId: true,
          reversalStableId: true,
          reversalFactHash: true,
          reversedAt: true,
          reversedByActorRef: true,
        },
      });

      const reversalJournal =
        await this.journal.createExternalSaleReversalJournalInTx(
          plan.journal,
          actorRef,
          plan.authority,
          tx,
        );
      const anchored = await tx.accountingExternalSale.update({
        where: { id: sale.id },
        data: {
          reversalJournalEntryStableId: reversalJournal.entryStableId,
        },
        select: {
          externalSaleStableId: true,
          reversalStableId: true,
          reversalFactHash: true,
          reversalJournalEntryStableId: true,
          reversedAt: true,
          reversedByActorRef: true,
        },
      });
      const after = this.toView({
        target: 'SALE',
        targetStableId: anchored.externalSaleStableId,
        reversalStableId: anchored.reversalStableId as string,
        reversalJournalEntryStableId:
          anchored.reversalJournalEntryStableId as string,
        reversalFactHash: anchored.reversalFactHash as string,
        reversalReason: reason,
        reversedAt: anchored.reversedAt as Date,
        reversedByActorRef: anchored.reversedByActorRef as string,
      });
      await writeAccountingAuditLog(tx, {
        action: 'EXTERNAL_SALE_REVERSE',
        entityType: 'ACCOUNTING_EXTERNAL_SALE',
        entityId: externalSaleStableId,
        operatorActorRef: actorRef,
        beforeJson: {
          externalSaleStableId: sale.externalSaleStableId,
          journalEntryStableId: sale.journalEntryStableId,
          reversalStableId: sale.reversalStableId,
          reversalFactHash: sale.reversalFactHash,
          reversalJournalEntryStableId: sale.reversalJournalEntryStableId,
          reversedAt: sale.reversedAt?.toISOString() ?? null,
          reversedByActorRef: sale.reversedByActorRef,
          replacedByExternalSaleStableId:
            sale.replacedByExternalSale?.externalSaleStableId ?? null,
        } as Prisma.InputJsonValue,
        afterJson: after as unknown as Prisma.InputJsonValue,
      });
      return after;
    });
  }

  private async reverseSettlementOnce(
    settlementStableId: string,
    reason: string,
    actorRef: string,
  ): Promise<AccountingExternalSaleReversalViewV1> {
    return runSerializableAccountingWrite(this.prisma, async (tx) => {
      const settlement = await tx.accountingExternalSaleSettlement.findUnique({
        where: { settlementStableId },
        select: {
          id: true,
          settlementStableId: true,
          storeStableId: true,
          currency: true,
          factHash: true,
          journalEntryStableId: true,
          reversalStableId: true,
          reversalFactHash: true,
          reversalJournalEntryStableId: true,
          reversedAt: true,
          reversedByActorRef: true,
          replacedBySettlement: {
            select: { settlementStableId: true },
          },
        },
      });
      if (!settlement) {
        throw new NotFoundException('External Sale settlement not found');
      }
      if (!settlement.journalEntryStableId) {
        throw new ConflictException(
          'External Sale settlement is missing its canonical Journal anchor',
        );
      }
      if (
        settlement.replacedBySettlement &&
        !settlement.reversalStableId &&
        !settlement.reversalFactHash &&
        !settlement.reversalJournalEntryStableId &&
        !settlement.reversedAt
      ) {
        throw new ConflictException(
          'External Sale settlement already has a replacement and cannot start a new reversal',
        );
      }

      const originalJournal = await this.readOriginalJournal(
        settlement.journalEntryStableId,
        'SETTLEMENT',
        settlement.settlementStableId,
        tx,
      );
      const plan = this.buildPlan({
        target: 'SETTLEMENT',
        targetStableId: settlement.settlementStableId,
        originalFactHash: settlement.factHash,
        originalJournalEntryStableId: settlement.journalEntryStableId,
        reversalReason: reason,
        originalJournal,
      });

      if (
        settlement.reversalStableId ||
        settlement.reversalFactHash ||
        settlement.reversedAt
      ) {
        this.assertReplayEvidence(
          {
            reversalStableId: settlement.reversalStableId,
            reversalFactHash: settlement.reversalFactHash,
            reversalJournalEntryStableId:
              settlement.reversalJournalEntryStableId,
            reversedAt: settlement.reversedAt,
            reversedByActorRef: settlement.reversedByActorRef,
          },
          plan.authority.fact.reversalStableId,
          plan.authority.reversalFactHash,
          'External Sale settlement',
        );
        const journal =
          await this.journal.createExternalSaleReversalJournalInTx(
            plan.journal,
            actorRef,
            plan.authority,
            tx,
          );
        if (journal.entryStableId !== settlement.reversalJournalEntryStableId) {
          throw new ConflictException(
            'External Sale settlement reversal is bound to a different reversal Journal',
          );
        }
        return this.toView({
          target: 'SETTLEMENT',
          targetStableId: settlement.settlementStableId,
          reversalStableId: plan.authority.fact.reversalStableId,
          reversalJournalEntryStableId: journal.entryStableId,
          reversalFactHash: plan.authority.reversalFactHash,
          reversalReason: reason,
          reversedAt: settlement.reversedAt as Date,
          reversedByActorRef: settlement.reversedByActorRef as string,
        });
      }

      const reversedAt = new Date();
      await tx.accountingExternalSaleSettlement.update({
        where: { id: settlement.id },
        data: {
          reversalStableId: plan.authority.fact.reversalStableId,
          reversalFactHash: plan.authority.reversalFactHash,
          reversedAt,
          reversedByActorRef: actorRef,
        },
        select: {
          settlementStableId: true,
          reversalStableId: true,
          reversalFactHash: true,
          reversedAt: true,
          reversedByActorRef: true,
        },
      });

      const reversalJournal =
        await this.journal.createExternalSaleReversalJournalInTx(
          plan.journal,
          actorRef,
          plan.authority,
          tx,
        );
      const anchored = await tx.accountingExternalSaleSettlement.update({
        where: { id: settlement.id },
        data: {
          reversalJournalEntryStableId: reversalJournal.entryStableId,
        },
        select: {
          settlementStableId: true,
          reversalStableId: true,
          reversalFactHash: true,
          reversalJournalEntryStableId: true,
          reversedAt: true,
          reversedByActorRef: true,
        },
      });
      const after = this.toView({
        target: 'SETTLEMENT',
        targetStableId: anchored.settlementStableId,
        reversalStableId: anchored.reversalStableId as string,
        reversalJournalEntryStableId:
          anchored.reversalJournalEntryStableId as string,
        reversalFactHash: anchored.reversalFactHash as string,
        reversalReason: reason,
        reversedAt: anchored.reversedAt as Date,
        reversedByActorRef: anchored.reversedByActorRef as string,
      });
      await writeAccountingAuditLog(tx, {
        action: 'EXTERNAL_SALE_SETTLEMENT_REVERSE',
        entityType: 'ACCOUNTING_EXTERNAL_SALE_SETTLEMENT',
        entityId: settlementStableId,
        operatorActorRef: actorRef,
        beforeJson: {
          settlementStableId: settlement.settlementStableId,
          journalEntryStableId: settlement.journalEntryStableId,
          reversalStableId: settlement.reversalStableId,
          reversalFactHash: settlement.reversalFactHash,
          reversalJournalEntryStableId:
            settlement.reversalJournalEntryStableId,
          reversedAt: settlement.reversedAt?.toISOString() ?? null,
          reversedByActorRef: settlement.reversedByActorRef,
          replacedBySettlementStableId:
            settlement.replacedBySettlement?.settlementStableId ?? null,
        } as Prisma.InputJsonValue,
        afterJson: after as unknown as Prisma.InputJsonValue,
      });
      return after;
    });
  }

  private buildPlan(input: {
    target: AccountingExternalSaleReversalTargetV1;
    targetStableId: string;
    originalFactHash: string;
    originalJournalEntryStableId: string;
    reversalReason: string;
    originalJournal: AccountingExternalSaleOriginalJournalV1;
  }) {
    const fact: AccountingExternalSaleReversalFactV1 = {
      version: 1,
      target: input.target,
      targetStableId: input.targetStableId,
      originalFactHash: input.originalFactHash,
      originalJournalEntryStableId: input.originalJournalEntryStableId,
      reversalStableId: buildAccountingExternalSaleReversalStableId(
        input.target,
        input.targetStableId,
      ),
      reversalReason: input.reversalReason,
    };
    try {
      return buildAccountingExternalSaleReversalWritePlan({
        fact,
        originalJournal: input.originalJournal,
      });
    } catch (error) {
      if (error instanceof AccountingJournalPolicyError) {
        throw new ConflictException(error.message);
      }
      throw error;
    }
  }

  private async readOriginalJournal(
    entryStableId: string,
    target: AccountingExternalSaleReversalTargetV1,
    targetStableId: string,
    tx: Prisma.TransactionClient,
  ): Promise<AccountingExternalSaleOriginalJournalV1> {
    const row = await tx.accountingJournalEntry.findUnique({
      where: { entryStableId },
      select: {
        entryStableId: true,
        source: true,
        sourceFactType: true,
        sourceFactStableId: true,
        sourceFactVersion: true,
        storeStableId: true,
        occurredAt: true,
        currency: true,
        memo: true,
        deletedAt: true,
        lines: {
          orderBy: { lineNo: 'asc' },
          select: {
            lineNo: true,
            debitCents: true,
            creditCents: true,
            memo: true,
            account: { select: { accountStableId: true } },
            category: { select: { categoryStableId: true } },
          },
        },
      },
    });
    const expectedFactType =
      target === 'SALE'
        ? ACCOUNTING_EXTERNAL_SALE_SOURCE_FACT_TYPE
        : ACCOUNTING_EXTERNAL_SALE_SETTLEMENT_SOURCE_FACT_TYPE;
    if (
      !row ||
      row.deletedAt ||
      row.source !== AccountingJournalSource.EXTERNAL_SALE ||
      row.sourceFactType !== expectedFactType ||
      row.sourceFactStableId !== targetStableId ||
      row.sourceFactVersion !== 1 ||
      !row.storeStableId ||
      row.currency !== 'CAD'
    ) {
      throw new ConflictException(
        'External Sale reversal original Journal anchor is missing or inconsistent',
      );
    }
    return this.toOriginalJournal(row as OriginalJournalRow);
  }

  private toOriginalJournal(
    row: OriginalJournalRow,
  ): AccountingExternalSaleOriginalJournalV1 {
    return {
      entryStableId: row.entryStableId,
      source: AccountingJournalSource.EXTERNAL_SALE,
      sourceFactType: row.sourceFactType as string,
      sourceFactStableId: row.sourceFactStableId as string,
      sourceFactVersion: row.sourceFactVersion as number,
      storeStableId: row.storeStableId as string,
      occurredAt: row.occurredAt.toISOString(),
      currency: 'CAD',
      memo: row.memo,
      lines: row.lines.map((line) => ({
        lineNo: line.lineNo,
        accountStableId: line.account.accountStableId,
        categoryStableId: line.category?.categoryStableId ?? null,
        debitCents: line.debitCents,
        creditCents: line.creditCents,
        memo: line.memo,
      })),
    };
  }

  private async assertNoLiveSettlements(
    allocations: Array<{
      settlement: {
        settlementStableId: string;
        journalEntryStableId: string | null;
        reversalStableId: string | null;
        reversalFactHash: string | null;
        reversalJournalEntryStableId: string | null;
        reversedAt: Date | null;
      };
    }>,
    tx: Prisma.TransactionClient,
  ): Promise<void> {
    const reversalJournalStableIds: string[] = [];
    for (const allocation of allocations) {
      const settlement = allocation.settlement;
      if (
        !settlement.reversalStableId &&
        !settlement.reversalFactHash &&
        !settlement.reversalJournalEntryStableId &&
        !settlement.reversedAt
      ) {
        throw new ConflictException(
          `External Sale has active settlement ${settlement.settlementStableId}; reverse settlement first`,
        );
      }
      if (
        !settlement.reversalStableId ||
        !settlement.reversalFactHash ||
        !settlement.reversalJournalEntryStableId ||
        !settlement.reversedAt
      ) {
        throw new ConflictException(
          `External Sale settlement ${settlement.settlementStableId} has partial reversal evidence`,
        );
      }
      reversalJournalStableIds.push(
        settlement.reversalJournalEntryStableId,
      );
    }
    if (reversalJournalStableIds.length === 0) return;

    const journals = await tx.accountingJournalEntry.findMany({
      where: { entryStableId: { in: reversalJournalStableIds } },
      select: {
        entryStableId: true,
        source: true,
        sourceFactType: true,
        sourceFactStableId: true,
        deletedAt: true,
      },
    });
    const byStableId = new Map(
      journals.map((journal) => [journal.entryStableId, journal] as const),
    );
    for (const allocation of allocations) {
      const settlement = allocation.settlement;
      const journal = byStableId.get(
        settlement.reversalJournalEntryStableId as string,
      );
      if (
        !journal ||
        journal.deletedAt ||
        journal.source !== AccountingJournalSource.EXTERNAL_SALE ||
        journal.sourceFactType !==
          ACCOUNTING_EXTERNAL_SALE_SETTLEMENT_REVERSAL_SOURCE_FACT_TYPE ||
        journal.sourceFactStableId !== settlement.reversalStableId
      ) {
        throw new ConflictException(
          `External Sale settlement reversal Journal is missing or inconsistent: ${settlement.settlementStableId}`,
        );
      }
    }
  }

  private assertReplayEvidence(
    evidence: {
      reversalStableId: string | null;
      reversalFactHash: string | null;
      reversalJournalEntryStableId: string | null;
      reversedAt: Date | null;
      reversedByActorRef: string | null;
    },
    expectedStableId: string,
    expectedFactHash: string,
    label: string,
  ): void {
    if (
      !evidence.reversalStableId ||
      !evidence.reversalFactHash ||
      !evidence.reversalJournalEntryStableId ||
      !evidence.reversedAt ||
      !evidence.reversedByActorRef
    ) {
      throw new ConflictException(`${label} contains partial reversal evidence`);
    }
    if (
      evidence.reversalStableId !== expectedStableId ||
      evidence.reversalFactHash !== expectedFactHash
    ) {
      throw new ConflictException(
        `${label} is already reversed with different frozen reversal facts`,
      );
    }
  }

  private toView(input: {
    target: AccountingExternalSaleReversalTargetV1;
    targetStableId: string;
    reversalStableId: string;
    reversalJournalEntryStableId: string;
    reversalFactHash: string;
    reversalReason: string;
    reversedAt: Date;
    reversedByActorRef: string;
  }): AccountingExternalSaleReversalViewV1 {
    return {
      version: 1,
      target: input.target,
      targetStableId: input.targetStableId,
      reversalStableId: input.reversalStableId,
      reversalJournalEntryStableId: input.reversalJournalEntryStableId,
      reversalFactHash: input.reversalFactHash,
      reversalReason: input.reversalReason,
      reversedAt: input.reversedAt.toISOString(),
      reversedByActorRef: input.reversedByActorRef,
    };
  }

  private requireStableId(raw: string, field: string): string {
    const value = typeof raw === 'string' ? raw.trim() : '';
    if (!value) throw new BadRequestException(`${field} is required`);
    if (value.length > 250) {
      throw new BadRequestException(`${field} is too long`);
    }
    return value;
  }
}
