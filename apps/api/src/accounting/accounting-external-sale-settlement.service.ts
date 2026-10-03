import {
  BadRequestException,
  ConflictException,
  Inject,
  Injectable,
} from '@nestjs/common';
import { Prisma } from '@prisma/client';

import { runSerializableAccountingWrite } from './accounting-atomic-write';
import { writeAccountingAuditLog } from './accounting-audit-writer';
import { AccountingJournalSource } from './accounting-contracts';
import { ACCOUNTING_DB, type AccountingDb } from './accounting-db';
import {
  ACCOUNTING_EXTERNAL_SALE_AR_ACCOUNT_STABLE_ID,
  ACCOUNTING_EXTERNAL_SALE_SETTLEMENT_REVERSAL_SOURCE_FACT_TYPE,
  ACCOUNTING_EXTERNAL_SALE_SETTLEMENT_SOURCE_FACT_TYPE,
  ACCOUNTING_EXTERNAL_SALE_SOURCE_FACT_TYPE,
  type AccountingExternalSaleSettlementFactV1,
  type CreateAccountingExternalSaleSettlementInputV1,
} from './accounting-external-sales.contract';
import {
  buildExternalSaleSettlementWritePlan,
  calculateExternalSaleJournalReceivableCents,
  type ExternalSaleSettlementAccountFactV1,
  type ExternalSaleSettlementReceivableSnapshotV1,
} from './accounting-external-sales-settlement-journal-authority';
import {
  hashAccountingExternalSaleSettlementFact,
  normalizeAccountingExternalSaleSettlement,
} from './accounting-external-sales.policy';
import { AccountingJournalService } from './accounting-journal.service';
import { AccountingJournalPolicyError } from './accounting-journal-policy';
import { AccountingPeriodService } from './accounting-period.service';

const SETTLEMENT_ATTEMPTS = 2;

const SETTLEMENT_VIEW_SELECT = {
  settlementStableId: true,
  idempotencyKey: true,
  storeStableId: true,
  settlementOn: true,
  counterpartyName: true,
  reference: true,
  currency: true,
  factHash: true,
  journalEntryStableId: true,
  reversalStableId: true,
  reversalJournalEntryStableId: true,
  reversedAt: true,
  note: true,
  createdByActorRef: true,
  createdAt: true,
  replacementForSettlement: {
    select: { settlementStableId: true },
  },
  allocations: {
    orderBy: { sortOrder: 'asc' as const },
    select: {
      allocationStableId: true,
      amountCents: true,
      sortOrder: true,
      externalSale: {
        select: { externalSaleStableId: true },
      },
    },
  },
  components: {
    orderBy: { sortOrder: 'asc' as const },
    select: {
      componentStableId: true,
      amountCents: true,
      label: true,
      sortOrder: true,
      account: {
        select: { accountStableId: true },
      },
    },
  },
} satisfies Prisma.AccountingExternalSaleSettlementSelect;

type SettlementViewRow = Prisma.AccountingExternalSaleSettlementGetPayload<{
  select: typeof SETTLEMENT_VIEW_SELECT;
}>;

const RECEIVABLE_SALE_SELECT = {
  id: true,
  externalSaleStableId: true,
  storeStableId: true,
  occurredOn: true,
  counterpartyName: true,
  currency: true,
  factHash: true,
  journalEntryStableId: true,
  reversalStableId: true,
  reversedAt: true,
  settlementAllocations: {
    select: {
      amountCents: true,
      settlement: {
        select: {
          settlementStableId: true,
          journalEntryStableId: true,
          reversalStableId: true,
          reversedAt: true,
        },
      },
    },
  },
} satisfies Prisma.AccountingExternalSaleSelect;

type ReceivableSaleRow = Prisma.AccountingExternalSaleGetPayload<{
  select: typeof RECEIVABLE_SALE_SELECT;
}>;

type SaleJournalAuthorityRow = {
  entryStableId: string;
  source: string;
  sourceFactType: string | null;
  sourceFactStableId: string | null;
  deletedAt: Date | null;
  lines: Array<{
    debitCents: number;
    creditCents: number;
    account: { accountStableId: string };
  }>;
};

export type AccountingExternalSaleSettlementViewV1 = {
  version: 1;
  settlementStableId: string;
  storeStableId: string;
  settlementOn: string;
  counterpartyName: string;
  reference: string | null;
  currency: 'CAD';
  factHash: string;
  journalEntryStableId: string;
  replacementForSettlementStableId: string | null;
  reversalStableId: string | null;
  reversalJournalEntryStableId: string | null;
  reversedAt: string | null;
  note: string | null;
  createdByActorRef: string;
  createdAt: string;
  appliedReceivableCents: number;
  allocations: Array<{
    allocationStableId: string;
    externalSaleStableId: string;
    amountCents: number;
    sortOrder: number;
  }>;
  components: Array<{
    componentStableId: string;
    accountStableId: string;
    amountCents: number;
    label: string;
    sortOrder: number;
  }>;
};

const isUniqueConstraintError = (error: unknown): boolean =>
  typeof error === 'object' &&
  error !== null &&
  'code' in error &&
  (error as { code?: unknown }).code === 'P2002';

const dateForDb = (value: string): Date => new Date(`${value}T00:00:00.000Z`);

const dateOnly = (value: Date): string => value.toISOString().slice(0, 10);

const safeAdd = (left: number, right: number, field: string): number => {
  const total = left + right;
  if (!Number.isSafeInteger(total)) {
    throw new ConflictException(`${field} exceeds safe integer range`);
  }
  return total;
};

@Injectable()
export class AccountingExternalSaleSettlementService {
  constructor(
    @Inject(ACCOUNTING_DB) private readonly prisma: AccountingDb,
    private readonly journal: AccountingJournalService,
    private readonly period: AccountingPeriodService,
  ) {}

  async createSettlement(
    input: CreateAccountingExternalSaleSettlementInputV1,
    actorRef: string,
  ): Promise<AccountingExternalSaleSettlementViewV1> {
    if (!input || typeof input !== 'object') {
      throw new BadRequestException(
        'External Sale settlement request body is required',
      );
    }

    let fact: AccountingExternalSaleSettlementFactV1;
    try {
      fact = normalizeAccountingExternalSaleSettlement(input);
    } catch (error) {
      if (error instanceof AccountingJournalPolicyError) {
        throw new BadRequestException(error.message);
      }
      throw error;
    }
    let lastError: unknown;
    for (let attempt = 0; attempt < SETTLEMENT_ATTEMPTS; attempt += 1) {
      try {
        return await this.createSettlementOnce(fact, actorRef);
      } catch (error) {
        lastError = error;
        if (!isUniqueConstraintError(error)) throw error;
      }
    }
    if (lastError instanceof Error) throw lastError;
    throw new ConflictException('External Sale settlement retry exhausted');
  }

  private async createSettlementOnce(
    fact: AccountingExternalSaleSettlementFactV1,
    actorRef: string,
  ): Promise<AccountingExternalSaleSettlementViewV1> {
    const businessTimezone = await this.period.getBusinessTimezone();
    const factHash = hashAccountingExternalSaleSettlementFact(fact);

    return runSerializableAccountingWrite(this.prisma, async (tx) => {
      const existing = await tx.accountingExternalSaleSettlement.findUnique({
        where: { settlementStableId: fact.settlementStableId },
        select: SETTLEMENT_VIEW_SELECT,
      });
      if (existing) {
        if (
          existing.idempotencyKey !==
          `external-sale-settlement:${fact.settlementStableId}:v1`
        ) {
          throw new ConflictException(
            'External Sale settlement source-fact idempotency key is inconsistent',
          );
        }
        if (existing.factHash !== factHash) {
          throw new ConflictException(
            'External Sale settlement stable ID is already bound to different facts',
          );
        }
        if (
          existing.reversedAt ||
          existing.reversalStableId ||
          existing.reversalJournalEntryStableId
        ) {
          throw new ConflictException(
            'External Sale settlement has been reversed and cannot be replayed as active',
          );
        }
        if (existing.journalEntryStableId) {
          await this.assertExistingJournalAnchor(
            existing.settlementStableId,
            existing.journalEntryStableId,
            tx,
          );
          return this.toView(existing);
        }
        throw new ConflictException(
          'External Sale settlement exists without a canonical Journal anchor; review is required',
        );
      }

      const replacementForSettlementDbId =
        await this.resolveReplacementForSettlement(fact, tx);

      const allocationStableIds = fact.allocations.map(
        (allocation) => allocation.externalSaleStableId,
      );
      const sales = await tx.accountingExternalSale.findMany({
        where: { externalSaleStableId: { in: allocationStableIds } },
        select: RECEIVABLE_SALE_SELECT,
      });
      const saleByStableId = new Map(
        sales.map((sale) => [sale.externalSaleStableId, sale] as const),
      );
      if (saleByStableId.size !== fact.allocations.length) {
        const missing = allocationStableIds.filter(
          (stableId) => !saleByStableId.has(stableId),
        );
        throw new ConflictException(
          `External Sale settlement references missing sale(s): ${missing.join(', ')}`,
        );
      }

      const saleJournalStableIds = sales.flatMap((sale) =>
        sale.journalEntryStableId ? [sale.journalEntryStableId] : [],
      );
      const saleJournals = await tx.accountingJournalEntry.findMany({
        where: { entryStableId: { in: saleJournalStableIds } },
        select: {
          entryStableId: true,
          source: true,
          sourceFactType: true,
          sourceFactStableId: true,
          deletedAt: true,
          lines: {
            orderBy: { lineNo: 'asc' },
            select: {
              debitCents: true,
              creditCents: true,
              account: {
                select: { accountStableId: true },
              },
            },
          },
        },
      });
      const saleJournalByStableId = new Map(
        saleJournals.map(
          (journal) => [journal.entryStableId, journal] as const,
        ),
      );

      const snapshots = fact.allocations.map((allocation) => {
        const sale = saleByStableId.get(allocation.externalSaleStableId);
        return this.buildReceivableSnapshot(
          fact,
          allocation.externalSaleStableId,
          allocation.amountCents,
          sale,
          sale?.journalEntryStableId
            ? saleJournalByStableId.get(sale.journalEntryStableId)
            : undefined,
        );
      });

      const requiredAccountStableIds = [
        ...new Set([
          ACCOUNTING_EXTERNAL_SALE_AR_ACCOUNT_STABLE_ID,
          ...fact.components.map((component) => component.accountStableId),
        ]),
      ].sort();
      const accountRows = await tx.accountingAccount.findMany({
        where: { accountStableId: { in: requiredAccountStableIds } },
        select: {
          id: true,
          accountStableId: true,
          accountClass: true,
          type: true,
          currency: true,
          isActive: true,
        },
      });
      const accountFacts: ExternalSaleSettlementAccountFactV1[] =
        accountRows.map((account) => ({
          accountStableId: account.accountStableId,
          accountClass: account.accountClass,
          accountType: account.type,
          currency: account.currency,
          isActive: account.isActive,
        }));

      let plan: ReturnType<typeof buildExternalSaleSettlementWritePlan>;
      try {
        plan = buildExternalSaleSettlementWritePlan({
          fact,
          businessTimezone,
          accountFacts,
          receivableSnapshots: snapshots,
        });
      } catch (error) {
        if (error instanceof AccountingJournalPolicyError) {
          throw new BadRequestException(error.message);
        }
        throw error;
      }

      const accountDbIdByStableId = new Map(
        accountRows.map((account) => [account.accountStableId, account.id]),
      );
      const accountDbId = (accountStableId: string): string => {
        const id = accountDbIdByStableId.get(accountStableId);
        if (!id) {
          throw new ConflictException(
            `External Sale settlement account disappeared before persistence: ${accountStableId}`,
          );
        }
        return id;
      };
      const saleDbId = (externalSaleStableId: string): string => {
        const id = saleByStableId.get(externalSaleStableId)?.id;
        if (!id) {
          throw new ConflictException(
            `External Sale disappeared before settlement persistence: ${externalSaleStableId}`,
          );
        }
        return id;
      };

      const settlement =
        existing ??
        (await tx.accountingExternalSaleSettlement.create({
          data: {
            settlementStableId: fact.settlementStableId,
            idempotencyKey: `external-sale-settlement:${fact.settlementStableId}:v1`,
            storeStableId: fact.storeStableId,
            settlementOn: dateForDb(fact.settlementOn),
            counterpartyName: fact.counterpartyName,
            reference: fact.reference,
            currency: fact.currency,
            factHash,
            note: fact.note,
            createdByActorRef: actorRef,
            ...(replacementForSettlementDbId
              ? {
                  replacementForSettlement: {
                    connect: { id: replacementForSettlementDbId },
                  },
                }
              : {}),
            allocations: {
              create: fact.allocations.map((allocation) => ({
                allocationStableId: allocation.allocationStableId,
                amountCents: allocation.amountCents,
                sortOrder: allocation.sortOrder,
                externalSale: {
                  connect: { id: saleDbId(allocation.externalSaleStableId) },
                },
              })),
            },
            components: {
              create: fact.components.map((component) => ({
                componentStableId: component.componentStableId,
                amountCents: component.amountCents,
                label: component.label,
                sortOrder: component.sortOrder,
                account: {
                  connect: { id: accountDbId(component.accountStableId) },
                },
              })),
            },
          },
          select: SETTLEMENT_VIEW_SELECT,
        }));

      const journal =
        await this.journal.createExternalSaleSettlementJournalInTx(
          plan.journal,
          actorRef,
          plan.authority,
          tx,
        );

      const anchored = await tx.accountingExternalSaleSettlement.update({
        where: { settlementStableId: settlement.settlementStableId },
        data: { journalEntryStableId: journal.entryStableId },
        select: SETTLEMENT_VIEW_SELECT,
      });
      const after = this.toView(anchored);

      await writeAccountingAuditLog(tx, {
        action: 'EXTERNAL_SALE_SETTLEMENT_POST',
        entityType: 'ACCOUNTING_EXTERNAL_SALE_SETTLEMENT',
        entityId: anchored.settlementStableId,
        operatorActorRef: actorRef,
        beforeJson: null,
        afterJson: after as unknown as Prisma.InputJsonValue,
      });
      return after;
    });
  }

  private async resolveReplacementForSettlement(
    fact: AccountingExternalSaleSettlementFactV1,
    tx: Prisma.TransactionClient,
  ): Promise<string | null> {
    if (!fact.replacementForSettlementStableId) return null;
    if (fact.replacementForSettlementStableId === fact.settlementStableId) {
      throw new ConflictException(
        'External Sale settlement cannot replace itself',
      );
    }

    const predecessor =
      await tx.accountingExternalSaleSettlement.findUnique({
        where: {
          settlementStableId: fact.replacementForSettlementStableId,
        },
        select: {
          id: true,
          storeStableId: true,
          currency: true,
          reversalStableId: true,
          reversalFactHash: true,
          reversalJournalEntryStableId: true,
          reversedAt: true,
          replacedBySettlement: {
            select: { settlementStableId: true },
          },
        },
      });
    if (!predecessor) {
      throw new ConflictException(
        'External Sale settlement replacement predecessor does not exist',
      );
    }
    if (
      predecessor.storeStableId !== fact.storeStableId ||
      predecessor.currency !== 'CAD'
    ) {
      throw new ConflictException(
        'External Sale settlement replacement must preserve Store and CAD currency',
      );
    }
    if (
      !predecessor.reversalStableId ||
      !predecessor.reversalFactHash ||
      !predecessor.reversalJournalEntryStableId ||
      !predecessor.reversedAt
    ) {
      throw new ConflictException(
        'External Sale settlement replacement predecessor must be fully reversed first',
      );
    }
    if (predecessor.replacedBySettlement) {
      throw new ConflictException(
        `External Sale settlement replacement predecessor is already replaced by ${predecessor.replacedBySettlement.settlementStableId}`,
      );
    }

    const reversalJournal = await tx.accountingJournalEntry.findUnique({
      where: {
        entryStableId: predecessor.reversalJournalEntryStableId,
      },
      select: {
        source: true,
        sourceFactType: true,
        sourceFactStableId: true,
        deletedAt: true,
      },
    });
    if (
      !reversalJournal ||
      reversalJournal.deletedAt ||
      reversalJournal.source !== AccountingJournalSource.EXTERNAL_SALE ||
      reversalJournal.sourceFactType !==
        ACCOUNTING_EXTERNAL_SALE_SETTLEMENT_REVERSAL_SOURCE_FACT_TYPE ||
      reversalJournal.sourceFactStableId !== predecessor.reversalStableId
    ) {
      throw new ConflictException(
        'External Sale settlement replacement predecessor reversal Journal is missing or inconsistent',
      );
    }
    return predecessor.id;
  }

  private buildReceivableSnapshot(
    fact: AccountingExternalSaleSettlementFactV1,
    externalSaleStableId: string,
    allocationCents: number,
    sale: ReceivableSaleRow | undefined,
    saleJournal: SaleJournalAuthorityRow | undefined,
  ): ExternalSaleSettlementReceivableSnapshotV1 {
    if (!sale) {
      throw new ConflictException(
        `External Sale settlement references missing sale: ${externalSaleStableId}`,
      );
    }
    if (
      sale.reversedAt ||
      sale.reversalStableId ||
      !sale.journalEntryStableId ||
      !saleJournal ||
      saleJournal.deletedAt ||
      saleJournal.source !== AccountingJournalSource.EXTERNAL_SALE ||
      saleJournal.sourceFactType !==
        ACCOUNTING_EXTERNAL_SALE_SOURCE_FACT_TYPE ||
      saleJournal.sourceFactStableId !== externalSaleStableId
    ) {
      throw new ConflictException(
        `External Sale is not an active recognized receivable: ${externalSaleStableId}`,
      );
    }
    if (
      sale.storeStableId !== fact.storeStableId ||
      sale.counterpartyName !== fact.counterpartyName ||
      sale.currency !== 'CAD'
    ) {
      throw new BadRequestException(
        `External Sale settlement allocation does not match store/counterparty/currency: ${externalSaleStableId}`,
      );
    }
    const saleOccurredOn = dateOnly(sale.occurredOn);
    if (saleOccurredOn > fact.settlementOn) {
      throw new BadRequestException(
        `External Sale settlement date precedes the sale: ${externalSaleStableId}`,
      );
    }

    let totalReceivableCents: number;
    try {
      totalReceivableCents = calculateExternalSaleJournalReceivableCents(
        saleJournal.lines.map((line) => ({
          accountStableId: line.account.accountStableId,
          debitCents: line.debitCents,
          creditCents: line.creditCents,
        })),
      );
    } catch (error) {
      if (error instanceof AccountingJournalPolicyError) {
        throw new ConflictException(error.message);
      }
      throw error;
    }

    let settledBeforeCents = 0;
    for (const previous of sale.settlementAllocations) {
      if (
        previous.settlement.reversedAt ||
        previous.settlement.reversalStableId
      ) {
        continue;
      }
      if (!previous.settlement.journalEntryStableId) {
        throw new ConflictException(
          `External Sale has an unanchored settlement allocation: ${externalSaleStableId}`,
        );
      }
      settledBeforeCents = safeAdd(
        settledBeforeCents,
        previous.amountCents,
        'settledBeforeCents',
      );
    }
    if (settledBeforeCents > totalReceivableCents) {
      throw new ConflictException(
        `External Sale settled amount exceeds its receivable: ${externalSaleStableId}`,
      );
    }
    const outstandingBeforeCents = totalReceivableCents - settledBeforeCents;
    if (allocationCents > outstandingBeforeCents) {
      throw new ConflictException(
        `External Sale settlement allocation exceeds outstanding receivable: ${externalSaleStableId}`,
      );
    }

    return {
      externalSaleStableId,
      saleOccurredOn,
      storeStableId: sale.storeStableId,
      counterpartyName: sale.counterpartyName,
      currency: 'CAD',
      saleFactHash: sale.factHash,
      saleJournalEntryStableId: sale.journalEntryStableId,
      totalReceivableCents,
      settledBeforeCents,
      outstandingBeforeCents,
    };
  }

  private async assertExistingJournalAnchor(
    settlementStableId: string,
    journalEntryStableId: string,
    tx: Prisma.TransactionClient,
  ): Promise<void> {
    const journal = await tx.accountingJournalEntry.findUnique({
      where: { entryStableId: journalEntryStableId },
      select: {
        source: true,
        sourceFactType: true,
        sourceFactStableId: true,
        deletedAt: true,
      },
    });
    if (
      !journal ||
      journal.deletedAt ||
      journal.source !== AccountingJournalSource.EXTERNAL_SALE ||
      journal.sourceFactType !==
        ACCOUNTING_EXTERNAL_SALE_SETTLEMENT_SOURCE_FACT_TYPE ||
      journal.sourceFactStableId !== settlementStableId
    ) {
      throw new ConflictException(
        'External Sale settlement Journal anchor is missing or inconsistent',
      );
    }
  }

  private toView(
    row: SettlementViewRow,
  ): AccountingExternalSaleSettlementViewV1 {
    if (row.currency !== 'CAD') {
      throw new ConflictException(
        'Persisted External Sale settlement currency is not supported by v1',
      );
    }
    if (!row.journalEntryStableId) {
      throw new ConflictException(
        'External Sale settlement is not anchored to a canonical Journal',
      );
    }

    const fact: AccountingExternalSaleSettlementFactV1 = {
      version: 1,
      settlementStableId: row.settlementStableId,
      storeStableId: row.storeStableId,
      settlementOn: dateOnly(row.settlementOn),
      counterpartyName: row.counterpartyName,
      reference: row.reference,
      currency: 'CAD',
      replacementForSettlementStableId:
        row.replacementForSettlement?.settlementStableId ?? null,
      allocations: row.allocations.map((allocation) => ({
        allocationStableId: allocation.allocationStableId,
        externalSaleStableId: allocation.externalSale.externalSaleStableId,
        amountCents: allocation.amountCents,
        sortOrder: allocation.sortOrder,
      })),
      components: row.components.map((component) => ({
        componentStableId: component.componentStableId,
        accountStableId: component.account.accountStableId,
        amountCents: component.amountCents,
        label: component.label,
        sortOrder: component.sortOrder,
      })),
      note: row.note,
    };
    const factHash = hashAccountingExternalSaleSettlementFact(fact);
    if (
      row.idempotencyKey !==
        `external-sale-settlement:${row.settlementStableId}:v1` ||
      factHash !== row.factHash
    ) {
      throw new ConflictException(
        'Persisted External Sale settlement facts do not match the frozen authority',
      );
    }

    let appliedReceivableCents = 0;
    for (const allocation of fact.allocations) {
      appliedReceivableCents = safeAdd(
        appliedReceivableCents,
        allocation.amountCents,
        'appliedReceivableCents',
      );
    }

    return {
      ...fact,
      factHash: row.factHash,
      journalEntryStableId: row.journalEntryStableId,
      reversalStableId: row.reversalStableId,
      reversalJournalEntryStableId: row.reversalJournalEntryStableId,
      reversedAt: row.reversedAt?.toISOString() ?? null,
      createdByActorRef: row.createdByActorRef,
      createdAt: row.createdAt.toISOString(),
      appliedReceivableCents,
    };
  }
}
