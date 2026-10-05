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
import {
  AccountingJournalEntryKind,
  AccountingJournalSource,
} from './accounting-contracts';
import { ACCOUNTING_DB, type AccountingDb } from './accounting-db';
import {
  ACCOUNTING_OPENING_RECEIVABLE_REVERSAL_SOURCE_FACT_TYPE,
  ACCOUNTING_OPENING_RECEIVABLE_SOURCE_FACT_TYPE,
  type ReverseAccountingOpeningReceivableInputV1,
} from './accounting-opening-receivable.contract';
import {
  ACCOUNTING_OPENING_RECEIVABLE_SETTLEMENT_REVERSAL_SOURCE_FACT_TYPE,
  ACCOUNTING_OPENING_RECEIVABLE_SETTLEMENT_SOURCE_FACT_TYPE,
  type AccountingOpeningReceivableReversalTargetV1,
  type AccountingOpeningReceivableReversalViewV1,
} from './accounting-opening-receivable-settlement.contract';
import {
  buildAccountingOpeningReceivableReversalStableId,
  buildAccountingOpeningReceivableReversalWritePlan,
  type AccountingOpeningReceivableOriginalJournalV1,
  type AccountingOpeningReceivableReversalFactV1,
} from './accounting-opening-receivable-reversal-journal-authority';
import {
  calculateOpeningReceivableCanonicalAmountCents,
  calculateOpeningReceivableSettlementAppliedCents,
} from './accounting-opening-receivable-settlement-journal-authority';
import { AccountingJournalService } from './accounting-journal.service';
import { AccountingJournalPolicyError } from './accounting-journal-policy';

const REVERSAL_ATTEMPTS = 2;
const MAX_REASON_LENGTH = 500;

type OriginalJournalRow = {
  entryStableId: string;
  kind: string;
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

const isUniqueConstraintError = (error: unknown): boolean =>
  typeof error === 'object' &&
  error !== null &&
  'code' in error &&
  (error as { code?: unknown }).code === 'P2002';

const requireReason = (
  input: ReverseAccountingOpeningReceivableInputV1,
): string => {
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
export class AccountingOpeningReceivableReversalService {
  constructor(
    @Inject(ACCOUNTING_DB) private readonly prisma: AccountingDb,
    private readonly journal: AccountingJournalService,
  ) {}

  async reverseOpeningReceivable(
    openingReceivableStableIdRaw: string,
    input: ReverseAccountingOpeningReceivableInputV1,
    actorRef: string,
  ): Promise<AccountingOpeningReceivableReversalViewV1> {
    const targetStableId = this.requireStableId(
      openingReceivableStableIdRaw,
      'openingReceivableStableId',
    );
    const reason = requireReason(input);
    return this.withUniqueRetry(() =>
      this.reverseOpeningReceivableOnce(targetStableId, reason, actorRef),
    );
  }

  async reverseSettlement(
    settlementStableIdRaw: string,
    input: ReverseAccountingOpeningReceivableInputV1,
    actorRef: string,
  ): Promise<AccountingOpeningReceivableReversalViewV1> {
    const targetStableId = this.requireStableId(
      settlementStableIdRaw,
      'settlementStableId',
    );
    const reason = requireReason(input);
    return this.withUniqueRetry(() =>
      this.reverseSettlementOnce(targetStableId, reason, actorRef),
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
    throw new ConflictException('Opening Receivable reversal retry exhausted');
  }

  private async reverseOpeningReceivableOnce(
    targetStableId: string,
    reason: string,
    actorRef: string,
  ): Promise<AccountingOpeningReceivableReversalViewV1> {
    return runSerializableAccountingWrite(this.prisma, async (tx) => {
      const opening = await tx.accountingOpeningReceivable.findUnique({
        where: { openingReceivableStableId: targetStableId },
        select: {
          id: true,
          openingReceivableStableId: true,
          storeStableId: true,
          currency: true,
          factHash: true,
          journalEntryStableId: true,
          reversalStableId: true,
          reversalFactHash: true,
          reversalJournalEntryStableId: true,
          reversedAt: true,
          reversedByActorRef: true,
          replacedByOpeningReceivable: {
            select: { openingReceivableStableId: true },
          },
          settlements: {
            select: {
              settlementStableId: true,
              journalEntryStableId: true,
              reversalStableId: true,
              reversalFactHash: true,
              reversalJournalEntryStableId: true,
              reversedAt: true,
              reversedByActorRef: true,
              collectionAccount: {
                select: { accountStableId: true },
              },
            },
          },
        },
      });
      if (!opening) throw new NotFoundException('Opening Receivable not found');
      if (!opening.journalEntryStableId) {
        throw new ConflictException(
          'Opening Receivable is missing its canonical Journal anchor',
        );
      }
      if (
        opening.replacedByOpeningReceivable &&
        !opening.reversalStableId &&
        !opening.reversalFactHash &&
        !opening.reversalJournalEntryStableId &&
        !opening.reversedAt
      ) {
        throw new ConflictException(
          'Opening Receivable already has a replacement and cannot start a new reversal',
        );
      }

      await this.assertNoLiveSettlements(opening.settlements, tx);

      const originalJournal = await this.readOriginalJournal(
        opening.journalEntryStableId,
        'OPENING_RECEIVABLE',
        opening.openingReceivableStableId,
        null,
        tx,
      );
      const plan = this.buildPlan({
        target: 'OPENING_RECEIVABLE',
        targetStableId: opening.openingReceivableStableId,
        originalFactHash: opening.factHash,
        originalJournalEntryStableId: opening.journalEntryStableId,
        reversalReason: reason,
        originalJournal,
      });

      if (
        opening.reversalStableId ||
        opening.reversalFactHash ||
        opening.reversalJournalEntryStableId ||
        opening.reversedAt ||
        opening.reversedByActorRef
      ) {
        this.assertReplayEvidence(
          opening,
          plan.authority.fact.reversalStableId,
          plan.authority.reversalFactHash,
          'Opening Receivable',
        );
        const journal =
          await this.journal.createOpeningReceivableReversalJournalInTx(
            plan.journal,
            actorRef,
            plan.authority,
            tx,
          );
        if (journal.entryStableId !== opening.reversalJournalEntryStableId) {
          throw new ConflictException(
            'Opening Receivable reversal is bound to a different reversal Journal',
          );
        }
        return this.toView({
          target: 'OPENING_RECEIVABLE',
          targetStableId: opening.openingReceivableStableId,
          reversalStableId: plan.authority.fact.reversalStableId,
          reversalJournalEntryStableId: journal.entryStableId,
          reversalFactHash: plan.authority.reversalFactHash,
          reversalReason: reason,
          reversedAt: opening.reversedAt as Date,
          reversedByActorRef: opening.reversedByActorRef as string,
        });
      }

      const reversedAt = new Date();
      await tx.accountingOpeningReceivable.update({
        where: { id: opening.id },
        data: {
          reversalStableId: plan.authority.fact.reversalStableId,
          reversalFactHash: plan.authority.reversalFactHash,
          reversedAt,
          reversedByActorRef: actorRef,
        },
      });
      const reversalJournal =
        await this.journal.createOpeningReceivableReversalJournalInTx(
          plan.journal,
          actorRef,
          plan.authority,
          tx,
        );
      const anchored = await tx.accountingOpeningReceivable.update({
        where: { id: opening.id },
        data: {
          reversalJournalEntryStableId: reversalJournal.entryStableId,
        },
        select: {
          openingReceivableStableId: true,
          reversalStableId: true,
          reversalFactHash: true,
          reversalJournalEntryStableId: true,
          reversedAt: true,
          reversedByActorRef: true,
        },
      });
      const after = this.toView({
        target: 'OPENING_RECEIVABLE',
        targetStableId: anchored.openingReceivableStableId,
        reversalStableId: anchored.reversalStableId as string,
        reversalJournalEntryStableId:
          anchored.reversalJournalEntryStableId as string,
        reversalFactHash: anchored.reversalFactHash as string,
        reversalReason: reason,
        reversedAt: anchored.reversedAt as Date,
        reversedByActorRef: anchored.reversedByActorRef as string,
      });
      await writeAccountingAuditLog(tx, {
        action: 'OPENING_RECEIVABLE_REVERSE',
        entityType: 'ACCOUNTING_OPENING_RECEIVABLE',
        entityId: targetStableId,
        operatorActorRef: actorRef,
        beforeJson: {
          openingReceivableStableId: opening.openingReceivableStableId,
          journalEntryStableId: opening.journalEntryStableId,
          reversalStableId: null,
          reversalJournalEntryStableId: null,
        } as Prisma.InputJsonValue,
        afterJson: after as unknown as Prisma.InputJsonValue,
      });
      return after;
    });
  }

  private async reverseSettlementOnce(
    targetStableId: string,
    reason: string,
    actorRef: string,
  ): Promise<AccountingOpeningReceivableReversalViewV1> {
    return runSerializableAccountingWrite(this.prisma, async (tx) => {
      const settlement =
        await tx.accountingOpeningReceivableSettlement.findUnique({
          where: { settlementStableId: targetStableId },
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
            collectionAccount: {
              select: { accountStableId: true },
            },
          },
        });
      if (!settlement) {
        throw new NotFoundException('Opening Receivable settlement not found');
      }
      if (!settlement.journalEntryStableId) {
        throw new ConflictException(
          'Opening Receivable settlement is missing its canonical Journal anchor',
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
          'Opening Receivable settlement already has a replacement and cannot start a new reversal',
        );
      }

      const originalJournal = await this.readOriginalJournal(
        settlement.journalEntryStableId,
        'SETTLEMENT',
        settlement.settlementStableId,
        settlement.collectionAccount.accountStableId,
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
        settlement.reversalJournalEntryStableId ||
        settlement.reversedAt ||
        settlement.reversedByActorRef
      ) {
        this.assertReplayEvidence(
          settlement,
          plan.authority.fact.reversalStableId,
          plan.authority.reversalFactHash,
          'Opening Receivable settlement',
        );
        const journal =
          await this.journal.createOpeningReceivableReversalJournalInTx(
            plan.journal,
            actorRef,
            plan.authority,
            tx,
          );
        if (journal.entryStableId !== settlement.reversalJournalEntryStableId) {
          throw new ConflictException(
            'Opening Receivable settlement reversal is bound to a different reversal Journal',
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
      await tx.accountingOpeningReceivableSettlement.update({
        where: { id: settlement.id },
        data: {
          reversalStableId: plan.authority.fact.reversalStableId,
          reversalFactHash: plan.authority.reversalFactHash,
          reversedAt,
          reversedByActorRef: actorRef,
        },
      });
      const reversalJournal =
        await this.journal.createOpeningReceivableReversalJournalInTx(
          plan.journal,
          actorRef,
          plan.authority,
          tx,
        );
      const anchored = await tx.accountingOpeningReceivableSettlement.update({
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
        action: 'OPENING_RECEIVABLE_SETTLEMENT_REVERSE',
        entityType: 'ACCOUNTING_OPENING_RECEIVABLE_SETTLEMENT',
        entityId: targetStableId,
        operatorActorRef: actorRef,
        beforeJson: {
          settlementStableId: settlement.settlementStableId,
          journalEntryStableId: settlement.journalEntryStableId,
          reversalStableId: null,
          reversalJournalEntryStableId: null,
        } as Prisma.InputJsonValue,
        afterJson: after as unknown as Prisma.InputJsonValue,
      });
      return after;
    });
  }

  private buildPlan(input: {
    target: AccountingOpeningReceivableReversalTargetV1;
    targetStableId: string;
    originalFactHash: string;
    originalJournalEntryStableId: string;
    reversalReason: string;
    originalJournal: AccountingOpeningReceivableOriginalJournalV1;
  }) {
    const fact: AccountingOpeningReceivableReversalFactV1 = {
      version: 1,
      target: input.target,
      targetStableId: input.targetStableId,
      originalFactHash: input.originalFactHash,
      originalJournalEntryStableId: input.originalJournalEntryStableId,
      reversalStableId: buildAccountingOpeningReceivableReversalStableId(
        input.target,
        input.targetStableId,
      ),
      reversalReason: input.reversalReason,
    };
    try {
      return buildAccountingOpeningReceivableReversalWritePlan({
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
    target: AccountingOpeningReceivableReversalTargetV1,
    targetStableId: string,
    collectionAccountStableId: string | null,
    tx: Prisma.TransactionClient,
  ): Promise<AccountingOpeningReceivableOriginalJournalV1> {
    const row = await tx.accountingJournalEntry.findUnique({
      where: { entryStableId },
      select: {
        entryStableId: true,
        kind: true,
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
      target === 'OPENING_RECEIVABLE'
        ? ACCOUNTING_OPENING_RECEIVABLE_SOURCE_FACT_TYPE
        : ACCOUNTING_OPENING_RECEIVABLE_SETTLEMENT_SOURCE_FACT_TYPE;
    const expectedKind =
      target === 'OPENING_RECEIVABLE'
        ? AccountingJournalEntryKind.OPENING_BALANCE
        : AccountingJournalEntryKind.STANDARD;
    if (
      !row ||
      row.deletedAt ||
      row.kind !== expectedKind ||
      row.source !== AccountingJournalSource.MANUAL ||
      row.sourceFactType !== expectedFactType ||
      row.sourceFactStableId !== targetStableId ||
      row.sourceFactVersion !== 1 ||
      !row.storeStableId ||
      row.currency !== 'CAD'
    ) {
      throw new ConflictException(
        'Opening Receivable reversal original Journal anchor is missing or inconsistent',
      );
    }

    try {
      const amount =
        target === 'OPENING_RECEIVABLE'
          ? calculateOpeningReceivableCanonicalAmountCents(
              row.lines.map((line) => ({
                accountStableId: line.account.accountStableId,
                debitCents: line.debitCents,
                creditCents: line.creditCents,
              })),
            )
          : calculateOpeningReceivableSettlementAppliedCents(
              row.lines.map((line) => ({
                accountStableId: line.account.accountStableId,
                debitCents: line.debitCents,
                creditCents: line.creditCents,
              })),
              collectionAccountStableId as string,
            );
      if (amount <= 0) {
        throw new ConflictException(
          'Opening Receivable reversal original Journal has no positive authority amount',
        );
      }
    } catch (error) {
      if (error instanceof AccountingJournalPolicyError) {
        throw new ConflictException(error.message);
      }
      throw error;
    }

    return this.toOriginalJournal(row as OriginalJournalRow);
  }

  private toOriginalJournal(
    row: OriginalJournalRow,
  ): AccountingOpeningReceivableOriginalJournalV1 {
    return {
      entryStableId: row.entryStableId,
      source: AccountingJournalSource.MANUAL,
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
    settlements: Array<{
      settlementStableId: string;
      journalEntryStableId: string | null;
      reversalStableId: string | null;
      reversalFactHash: string | null;
      reversalJournalEntryStableId: string | null;
      reversedAt: Date | null;
      reversedByActorRef: string | null;
      collectionAccount: { accountStableId: string };
    }>,
    tx: Prisma.TransactionClient,
  ): Promise<void> {
    for (const settlement of settlements) {
      const reversalFields = [
        settlement.reversalStableId,
        settlement.reversalFactHash,
        settlement.reversalJournalEntryStableId,
        settlement.reversedAt,
        settlement.reversedByActorRef,
      ];
      const hasAny = reversalFields.some((value) => value !== null);
      const hasAll = reversalFields.every((value) => value !== null);
      if (!hasAny) {
        throw new ConflictException(
          `Opening Receivable has active settlement ${settlement.settlementStableId}; reverse settlement first`,
        );
      }
      if (!hasAll || !settlement.journalEntryStableId) {
        throw new ConflictException(
          `Opening Receivable settlement ${settlement.settlementStableId} has partial reversal evidence`,
        );
      }

      const [original, reversal] = await Promise.all([
        tx.accountingJournalEntry.findUnique({
          where: { entryStableId: settlement.journalEntryStableId as string },
          select: {
            kind: true,
            source: true,
            sourceFactType: true,
            sourceFactStableId: true,
            sourceFactVersion: true,
            storeStableId: true,
            currency: true,
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
        }),
        tx.accountingJournalEntry.findUnique({
          where: {
            entryStableId: settlement.reversalJournalEntryStableId as string,
          },
          select: {
            kind: true,
            source: true,
            sourceFactType: true,
            sourceFactStableId: true,
            sourceFactVersion: true,
            storeStableId: true,
            currency: true,
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
        }),
      ]);
      if (
        !original ||
        original.deletedAt ||
        original.kind !== AccountingJournalEntryKind.STANDARD ||
        original.source !== AccountingJournalSource.MANUAL ||
        original.sourceFactType !==
          ACCOUNTING_OPENING_RECEIVABLE_SETTLEMENT_SOURCE_FACT_TYPE ||
        original.sourceFactStableId !== settlement.settlementStableId ||
        original.sourceFactVersion !== 1 ||
        !reversal ||
        reversal.deletedAt ||
        reversal.kind !== AccountingJournalEntryKind.ADJUSTMENT ||
        reversal.source !== AccountingJournalSource.MANUAL ||
        reversal.sourceFactType !==
          ACCOUNTING_OPENING_RECEIVABLE_SETTLEMENT_REVERSAL_SOURCE_FACT_TYPE ||
        reversal.sourceFactStableId !== settlement.reversalStableId ||
        reversal.sourceFactVersion !== 1 ||
        reversal.storeStableId !== original.storeStableId ||
        reversal.currency !== original.currency ||
        reversal.lines.length !== original.lines.length
      ) {
        throw new ConflictException(
          `Opening Receivable settlement reversal Journal is missing or inconsistent: ${settlement.settlementStableId}`,
        );
      }
      for (let index = 0; index < original.lines.length; index += 1) {
        const sourceLine = original.lines[index];
        const reversalLine = reversal.lines[index];
        if (
          !sourceLine ||
          !reversalLine ||
          sourceLine.lineNo !== reversalLine.lineNo ||
          sourceLine.account.accountStableId !==
            reversalLine.account.accountStableId ||
          (sourceLine.category?.categoryStableId ?? null) !==
            (reversalLine.category?.categoryStableId ?? null) ||
          sourceLine.memo !== reversalLine.memo ||
          sourceLine.debitCents !== reversalLine.creditCents ||
          sourceLine.creditCents !== reversalLine.debitCents
        ) {
          throw new ConflictException(
            `Opening Receivable settlement reversal is not an exact inverse: ${settlement.settlementStableId}`,
          );
        }
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
    target: AccountingOpeningReceivableReversalTargetV1;
    targetStableId: string;
    reversalStableId: string;
    reversalJournalEntryStableId: string;
    reversalFactHash: string;
    reversalReason: string;
    reversedAt: Date;
    reversedByActorRef: string;
  }): AccountingOpeningReceivableReversalViewV1 {
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
