import {
  ConflictException,
  Inject,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import {
  BRAND_STORE_CONFIG_READER,
  type BrandStoreConfigReaderPort,
} from '../store/public-api';
import {
  AccountingAccountClass,
  AccountingAccountType,
} from './accounting-contracts';
import { ACCOUNTING_DB, type AccountingDb } from './accounting-db';
import {
  ACCOUNTING_EXTERNAL_SALE_LINE_REVENUE_ACCOUNT_STABLE_IDS,
  ACCOUNTING_EXTERNAL_SALE_NEGATIVE_ADJUSTMENT_ACCOUNT_STABLE_IDS,
  ACCOUNTING_EXTERNAL_SALE_POSITIVE_ADJUSTMENT_ACCOUNT_STABLE_IDS,
  ACCOUNTING_EXTERNAL_SALE_TAX_ACCOUNT_STABLE_ID,
  ACCOUNTING_EXTERNAL_SALE_TAX_CODES,
} from './accounting-external-sales-journal-authority';
import type {
  AccountingExternalSaleAccountOptionV1,
  AccountingExternalSaleDetailV1,
  AccountingExternalSaleFormOptionsV1,
  AccountingExternalSaleListItemV1,
  AccountingExternalSaleSettlementListItemV1,
  AccountingExternalSaleSettlementsListV1,
  AccountingExternalSalesListV1,
} from './accounting-external-sales-query.contract';
import {
  ACCOUNTING_EXTERNAL_SALE_SETTLEMENT_EXPENSE_ACCOUNT_STABLE_IDS,
  ACCOUNTING_EXTERNAL_SALE_SETTLEMENT_HST_RECOVERABLE_ACCOUNT_STABLE_ID,
} from './accounting-external-sales-settlement-journal-authority';
import {
  AccountingExternalSalesQueryPolicyError,
  accountingExternalSalesQueryDateOnly,
  addAccountingExternalSalesQueryCents,
  projectAccountingExternalSaleReceivableCents,
  projectAccountingExternalSaleSettlementAppliedCents,
  resolveAccountingExternalSaleReversalState,
  resolveAccountingExternalSaleSettlementComponentRole,
  type AccountingExternalSalesQueryJournalIdentityV1,
  type AccountingExternalSalesQueryReversalAnchorV1,
} from './accounting-external-sales-query.policy';
import {
  ACCOUNTING_EXTERNAL_SALE_QUERY_SELECT as SALE_QUERY_SELECT,
  ACCOUNTING_EXTERNAL_SALE_SETTLEMENT_QUERY_SELECT as SETTLEMENT_QUERY_SELECT,
  type AccountingExternalSaleQueryRow as SaleQueryRow,
  type AccountingExternalSaleSettlementQueryRow as SettlementQueryRow,
} from './accounting-external-sales-query.persistence';

type JournalAmountLine = {
  debitCents: number;
  creditCents: number;
  account: { accountStableId: string };
};

type SaleJournalRow = AccountingExternalSalesQueryJournalIdentityV1 & {
  lines: JournalAmountLine[];
};

type SettlementJournalRow = AccountingExternalSalesQueryJournalIdentityV1 & {
  lines: JournalAmountLine[];
};

const runQueryPolicy = <T>(work: () => T): T => {
  try {
    return work();
  } catch (error) {
    if (error instanceof AccountingExternalSalesQueryPolicyError) {
      throw new ConflictException(error.message);
    }
    throw error;
  }
};

@Injectable()
export class AccountingExternalSalesQueryService {
  constructor(
    @Inject(ACCOUNTING_DB) private readonly prisma: AccountingDb,
    @Inject(BRAND_STORE_CONFIG_READER)
    private readonly storeConfig: BrandStoreConfigReaderPort,
  ) {}

  async listSales(limitRaw?: string): Promise<AccountingExternalSalesListV1> {
    const store = await this.storeConfig.getConfiguredStoreSnapshot();
    const limit = this.normalizeLimit(limitRaw);
    const rows = await this.prisma.accountingExternalSale.findMany({
      where: { storeStableId: store.storeStableId },
      orderBy: [{ occurredOn: 'desc' }, { createdAt: 'desc' }],
      take: limit,
      select: SALE_QUERY_SELECT,
    });
    const settlementRows = rows.flatMap((row) =>
      row.settlementAllocations.map(({ settlement }) => settlement),
    );
    const [saleJournalById, settlementJournalById, reversalJournalById] =
      await Promise.all([
        this.readSaleJournals(rows),
        this.readSettlementJournals(settlementRows),
        this.readReversalJournals([...rows, ...settlementRows]),
      ]);
    return {
      version: 1,
      sales: rows.map((row) =>
        this.toSaleListItem(
          row,
          saleJournalById.get(row.journalEntryStableId ?? ''),
          settlementJournalById,
          reversalJournalById,
        ),
      ),
    };
  }

  async getSale(
    externalSaleStableIdRaw: string,
  ): Promise<AccountingExternalSaleDetailV1> {
    const externalSaleStableId = externalSaleStableIdRaw.trim();
    if (!externalSaleStableId) throw new NotFoundException('External Sale not found');
    const store = await this.storeConfig.getConfiguredStoreSnapshot();
    const row = await this.prisma.accountingExternalSale.findUnique({
      where: { externalSaleStableId },
      select: SALE_QUERY_SELECT,
    });
    if (!row || row.storeStableId !== store.storeStableId) {
      throw new NotFoundException('External Sale not found');
    }
    const settlementRows = row.settlementAllocations.map(
      ({ settlement }) => settlement,
    );
    const [saleJournalById, settlementJournalById, reversalJournalById] =
      await Promise.all([
        this.readSaleJournals([row]),
        this.readSettlementJournals(settlementRows),
        this.readReversalJournals([row, ...settlementRows]),
      ]);
    const base = this.toSaleListItem(
      row,
      saleJournalById.get(row.journalEntryStableId ?? ''),
      settlementJournalById,
      reversalJournalById,
    );
    return {
      ...base,
      periodStartOn: accountingExternalSalesQueryDateOnly(row.periodStartOn),
      periodEndOn: accountingExternalSalesQueryDateOnly(row.periodEndOn),
      note: row.note,
      createdByActorRef: row.createdByActorRef,
      createdAt: row.createdAt.toISOString(),
      lines: row.lines.map((line) => ({
        lineStableId: line.lineStableId,
        description: line.description,
        productReference: line.productReference,
        quantity: line.quantity.toFixed(),
        unit: line.unit,
        unitPriceCents: line.unitPriceCents,
        lineAmountCents: line.lineAmountCents,
        revenueAccountStableId: line.revenueAccount.accountStableId,
        sortOrder: line.sortOrder,
      })),
      adjustments: row.adjustments.map((adjustment) => ({
        adjustmentStableId: adjustment.adjustmentStableId,
        label: adjustment.label,
        amountCents: adjustment.amountCents,
        revenueAccountStableId: adjustment.revenueAccount.accountStableId,
        sortOrder: adjustment.sortOrder,
      })),
      taxes: row.taxes.map((tax) => ({
        taxStableId: tax.taxStableId,
        taxCode: tax.taxCode,
        label: tax.label,
        rateBasisPoints: tax.rateBasisPoints,
        amountCents: tax.amountCents,
        liabilityAccountStableId: tax.liabilityAccount.accountStableId,
        sortOrder: tax.sortOrder,
      })),
      settlements: settlementRows.map((settlement) =>
        this.toSettlementListItem(
          settlement,
          settlementJournalById.get(settlement.journalEntryStableId ?? ''),
          reversalJournalById,
        ),
      ),
    };
  }

  async listSettlements(
    limitRaw?: string,
  ): Promise<AccountingExternalSaleSettlementsListV1> {
    const store = await this.storeConfig.getConfiguredStoreSnapshot();
    const limit = this.normalizeLimit(limitRaw);
    const rows = await this.prisma.accountingExternalSaleSettlement.findMany({
      where: { storeStableId: store.storeStableId },
      orderBy: [{ settlementOn: 'desc' }, { createdAt: 'desc' }],
      take: limit,
      select: SETTLEMENT_QUERY_SELECT,
    });
    const [journalById, reversalJournalById] = await Promise.all([
      this.readSettlementJournals(rows),
      this.readReversalJournals(rows),
    ]);
    return {
      version: 1,
      settlements: rows.map((row) =>
        this.toSettlementListItem(
          row,
          journalById.get(row.journalEntryStableId ?? ''),
          reversalJournalById,
        ),
      ),
    };
  }

  async formOptions(): Promise<AccountingExternalSaleFormOptionsV1> {
    const store = await this.storeConfig.getConfiguredStoreSnapshot();
    const fixedStableIds = [
      ...ACCOUNTING_EXTERNAL_SALE_LINE_REVENUE_ACCOUNT_STABLE_IDS,
      ...ACCOUNTING_EXTERNAL_SALE_POSITIVE_ADJUSTMENT_ACCOUNT_STABLE_IDS,
      ...ACCOUNTING_EXTERNAL_SALE_NEGATIVE_ADJUSTMENT_ACCOUNT_STABLE_IDS,
      ACCOUNTING_EXTERNAL_SALE_TAX_ACCOUNT_STABLE_ID,
      ...ACCOUNTING_EXTERNAL_SALE_SETTLEMENT_EXPENSE_ACCOUNT_STABLE_IDS,
      ACCOUNTING_EXTERNAL_SALE_SETTLEMENT_HST_RECOVERABLE_ACCOUNT_STABLE_ID,
    ];
    const [accounts, classificationRows] = await Promise.all([
      this.prisma.accountingAccount.findMany({
        where: {
          isActive: true,
          currency: 'CAD',
          OR: [
            { accountStableId: { in: fixedStableIds } },
            {
              accountClass: AccountingAccountClass.ASSET,
              type: {
                in: [AccountingAccountType.BANK, AccountingAccountType.CASH],
              },
            },
          ],
        },
        select: {
          accountStableId: true,
          name: true,
          accountClass: true,
          type: true,
        },
        orderBy: { name: 'asc' },
      }),
      this.prisma.accountingExternalSale.findMany({
        where: { storeStableId: store.storeStableId },
        distinct: ['classificationStableId'],
        select: { classificationStableId: true },
        orderBy: { classificationStableId: 'asc' },
      }),
    ]);
    const byStableId = new Map(
      accounts.map((account) => [account.accountStableId, account] as const),
    );
    const options = (
      stableIds: readonly string[],
      accountClass: string,
    ): AccountingExternalSaleAccountOptionV1[] =>
      stableIds.flatMap((accountStableId) => {
        const account = byStableId.get(accountStableId);
        if (
          !account ||
          account.accountClass !== accountClass ||
          account.type !== null
        ) {
          return [];
        }
        return [{ accountStableId, name: account.name }];
      });
    const taxAccount = byStableId.get(
      ACCOUNTING_EXTERNAL_SALE_TAX_ACCOUNT_STABLE_ID,
    );
    const taxOptions =
      taxAccount &&
      taxAccount.accountClass === AccountingAccountClass.LIABILITY &&
      taxAccount.type === null
        ? ACCOUNTING_EXTERNAL_SALE_TAX_CODES.map((taxCode) => ({
            taxCode,
            label: taxCode === 'HST' ? 'HST' : 'Zero-rated',
            liabilityAccountStableId:
              ACCOUNTING_EXTERNAL_SALE_TAX_ACCOUNT_STABLE_ID,
          }))
        : [];
    const hstRecoverable = byStableId.get(
      ACCOUNTING_EXTERNAL_SALE_SETTLEMENT_HST_RECOVERABLE_ACCOUNT_STABLE_ID,
    );
    return {
      version: 1,
      store: {
        storeStableId: store.storeStableId,
        storeName: store.storeName,
        timezone: store.timezone,
      },
      classificationSuggestions: classificationRows.map(
        (row) => row.classificationStableId,
      ),
      sale: {
        lineRevenueAccounts: options(
          ACCOUNTING_EXTERNAL_SALE_LINE_REVENUE_ACCOUNT_STABLE_IDS,
          AccountingAccountClass.REVENUE,
        ),
        positiveAdjustmentAccounts: options(
          ACCOUNTING_EXTERNAL_SALE_POSITIVE_ADJUSTMENT_ACCOUNT_STABLE_IDS,
          AccountingAccountClass.REVENUE,
        ),
        negativeAdjustmentAccounts: options(
          ACCOUNTING_EXTERNAL_SALE_NEGATIVE_ADJUSTMENT_ACCOUNT_STABLE_IDS,
          AccountingAccountClass.REVENUE,
        ),
        taxOptions,
      },
      settlement: {
        collectionAccounts: accounts
          .filter(
            (account) =>
              account.accountClass === AccountingAccountClass.ASSET &&
              (account.type === AccountingAccountType.BANK ||
                account.type === AccountingAccountType.CASH),
          )
          .map((account) => ({
            accountStableId: account.accountStableId,
            name: account.name,
          })),
        expenseAccounts: options(
          ACCOUNTING_EXTERNAL_SALE_SETTLEMENT_EXPENSE_ACCOUNT_STABLE_IDS,
          AccountingAccountClass.EXPENSE,
        ),
        hstRecoverableAccount:
          hstRecoverable &&
          hstRecoverable.accountClass === AccountingAccountClass.ASSET &&
          hstRecoverable.type === null
            ? {
                accountStableId: hstRecoverable.accountStableId,
                name: hstRecoverable.name,
              }
            : null,
      },
    };
  }

  private normalizeLimit(raw?: string): number {
    const parsed = Number.parseInt(raw ?? '100', 10);
    return Number.isFinite(parsed) ? Math.min(200, Math.max(1, parsed)) : 100;
  }

  private async readSaleJournals(
    rows: SaleQueryRow[],
  ): Promise<Map<string, SaleJournalRow>> {
    const ids = rows.flatMap((row) =>
      row.journalEntryStableId ? [row.journalEntryStableId] : [],
    );
    if (ids.length === 0) return new Map();
    const journals = await this.prisma.accountingJournalEntry.findMany({
      where: { entryStableId: { in: ids } },
      select: {
        entryStableId: true,
        source: true,
        sourceFactType: true,
        sourceFactStableId: true,
        sourceFactVersion: true,
        storeStableId: true,
        currency: true,
        deletedAt: true,
        lines: {
          select: {
            debitCents: true,
            creditCents: true,
            account: { select: { accountStableId: true } },
          },
        },
      },
    });
    return new Map(
      journals.map((journal) => [journal.entryStableId, journal] as const),
    );
  }

  private async readSettlementJournals(
    rows: SettlementQueryRow[],
  ): Promise<Map<string, SettlementJournalRow>> {
    const ids = rows.flatMap((row) =>
      row.journalEntryStableId ? [row.journalEntryStableId] : [],
    );
    if (ids.length === 0) return new Map();
    const journals = await this.prisma.accountingJournalEntry.findMany({
      where: { entryStableId: { in: ids } },
      select: {
        entryStableId: true,
        source: true,
        sourceFactType: true,
        sourceFactStableId: true,
        sourceFactVersion: true,
        storeStableId: true,
        currency: true,
        deletedAt: true,
        lines: {
          select: {
            debitCents: true,
            creditCents: true,
            account: { select: { accountStableId: true } },
          },
        },
      },
    });
    return new Map(
      journals.map((journal) => [journal.entryStableId, journal] as const),
    );
  }

  private async readReversalJournals(
    rows: AccountingExternalSalesQueryReversalAnchorV1[],
  ): Promise<Map<string, AccountingExternalSalesQueryJournalIdentityV1>> {
    const ids = rows.flatMap((row) =>
      row.reversalJournalEntryStableId
        ? [row.reversalJournalEntryStableId]
        : [],
    );
    if (ids.length === 0) return new Map();
    const journals = await this.prisma.accountingJournalEntry.findMany({
      where: { entryStableId: { in: ids } },
      select: {
        entryStableId: true,
        source: true,
        sourceFactType: true,
        sourceFactStableId: true,
        sourceFactVersion: true,
        storeStableId: true,
        currency: true,
        deletedAt: true,
      },
    });
    return new Map(
      journals.map((journal) => [journal.entryStableId, journal] as const),
    );
  }

  private toSaleListItem(
    row: SaleQueryRow,
    journal: SaleJournalRow | undefined,
    settlementJournalById: Map<string, SettlementJournalRow>,
    reversalJournalById: Map<string, AccountingExternalSalesQueryJournalIdentityV1>,
  ): AccountingExternalSaleListItemV1 {
    const totalReceivableCents = runQueryPolicy(() =>
      projectAccountingExternalSaleReceivableCents({
        externalSaleStableId: row.externalSaleStableId,
        storeStableId: row.storeStableId,
        currency: row.currency,
        journalEntryStableId: row.journalEntryStableId,
        journal: journal
          ? {
              ...journal,
              lines: journal.lines.map((line) => ({
                accountStableId: line.account.accountStableId,
                debitCents: line.debitCents,
                creditCents: line.creditCents,
              })),
            }
          : undefined,
      }),
    );

    const saleReversalState = runQueryPolicy(() =>
      resolveAccountingExternalSaleReversalState({
        target: 'SALE',
        anchor: row,
        journal: reversalJournalById.get(
          row.reversalJournalEntryStableId ?? '',
        ),
      }),
    );
    let settledCents = 0;
    for (const allocation of row.settlementAllocations) {
      const settlement = allocation.settlement;
      const settlementJournal = settlementJournalById.get(
        settlement.journalEntryStableId ?? '',
      );
      runQueryPolicy(() =>
        projectAccountingExternalSaleSettlementAppliedCents({
          settlementStableId: settlement.settlementStableId,
          storeStableId: settlement.storeStableId,
          currency: settlement.currency,
          journalEntryStableId: settlement.journalEntryStableId,
          allocationAmountsCents: settlement.allocations.map(
            (item) => item.amountCents,
          ),
          journal: settlementJournal
            ? {
                ...settlementJournal,
                lines: settlementJournal.lines.map((line) => ({
                  accountStableId: line.account.accountStableId,
                  debitCents: line.debitCents,
                  creditCents: line.creditCents,
                })),
              }
            : undefined,
        }),
      );
      if (
        settlement.storeStableId !== row.storeStableId ||
        settlement.counterpartyName !== row.counterpartyName
      ) {
        throw new ConflictException(
          `External Sale settlement ownership is inconsistent: ${settlement.settlementStableId}`,
        );
      }
      const settlementReversalState = runQueryPolicy(() =>
        resolveAccountingExternalSaleReversalState({
          target: 'SETTLEMENT',
          anchor: settlement,
          journal: reversalJournalById.get(
            settlement.reversalJournalEntryStableId ?? '',
          ),
        }),
      );
      if (settlementReversalState === 'REVERSED') continue;
      if (saleReversalState === 'REVERSED') {
        throw new ConflictException(
          `Reversed External Sale retains a live Settlement: ${row.externalSaleStableId}`,
        );
      }
      const matchingAllocation = settlement.allocations.find(
        (item) => item.externalSale.externalSaleStableId === row.externalSaleStableId,
      );
      if (!matchingAllocation) {
        throw new ConflictException(
          `External Sale settlement allocation is missing: ${settlement.settlementStableId}`,
        );
      }
      settledCents = runQueryPolicy(() =>
        addAccountingExternalSalesQueryCents(
          settledCents,
          matchingAllocation.amountCents,
          'settledCents',
        ),
      );
    }
    if (settledCents > totalReceivableCents) {
      throw new ConflictException(
        `External Sale settled amount exceeds receivable: ${row.externalSaleStableId}`,
      );
    }
    const outstandingCents =
      saleReversalState === 'REVERSED'
        ? 0
        : totalReceivableCents - settledCents;
    const status =
      saleReversalState === 'REVERSED'
        ? 'REVERSED'
        : outstandingCents === 0
          ? 'SETTLED'
          : settledCents > 0
            ? 'PARTIALLY_SETTLED'
            : 'OPEN';

    return {
      externalSaleStableId: row.externalSaleStableId,
      storeStableId: row.storeStableId,
      classificationStableId: row.classificationStableId,
      granularity: row.granularity,
      occurredOn: accountingExternalSalesQueryDateOnly(row.occurredOn) as string,
      counterpartyName: row.counterpartyName,
      reference: row.reference,
      currency: 'CAD',
      journalEntryStableId: row.journalEntryStableId,
      replacementForExternalSaleStableId:
        row.replacementForExternalSale?.externalSaleStableId ?? null,
      replacedByExternalSaleStableId:
        row.replacedByExternalSale?.externalSaleStableId ?? null,
      reversalStableId: row.reversalStableId,
      reversalJournalEntryStableId: row.reversalJournalEntryStableId,
      reversedAt: row.reversedAt?.toISOString() ?? null,
      totalReceivableCents,
      settledCents,
      outstandingCents,
      status,
    };
  }

  private toSettlementListItem(
    row: SettlementQueryRow,
    journal: SettlementJournalRow | undefined,
    reversalJournalById: Map<string, AccountingExternalSalesQueryJournalIdentityV1>,
  ): AccountingExternalSaleSettlementListItemV1 {
    const appliedReceivableCents = runQueryPolicy(() =>
      projectAccountingExternalSaleSettlementAppliedCents({
        settlementStableId: row.settlementStableId,
        storeStableId: row.storeStableId,
        currency: row.currency,
        journalEntryStableId: row.journalEntryStableId,
        allocationAmountsCents: row.allocations.map(
          (allocation) => allocation.amountCents,
        ),
        journal: journal
          ? {
              ...journal,
              lines: journal.lines.map((line) => ({
                accountStableId: line.account.accountStableId,
                debitCents: line.debitCents,
                creditCents: line.creditCents,
              })),
            }
          : undefined,
      }),
    );
    runQueryPolicy(() =>
      resolveAccountingExternalSaleReversalState({
        target: 'SETTLEMENT',
        anchor: row,
        journal: reversalJournalById.get(
          row.reversalJournalEntryStableId ?? '',
        ),
      }),
    );
    return {
      settlementStableId: row.settlementStableId,
      storeStableId: row.storeStableId,
      settlementOn: accountingExternalSalesQueryDateOnly(row.settlementOn) as string,
      counterpartyName: row.counterpartyName,
      reference: row.reference,
      currency: 'CAD',
      journalEntryStableId: row.journalEntryStableId,
      replacementForSettlementStableId:
        row.replacementForSettlement?.settlementStableId ?? null,
      replacedBySettlementStableId:
        row.replacedBySettlement?.settlementStableId ?? null,
      reversalStableId: row.reversalStableId,
      reversalJournalEntryStableId: row.reversalJournalEntryStableId,
      reversedAt: row.reversedAt?.toISOString() ?? null,
      note: row.note,
      appliedReceivableCents,
      allocations: row.allocations.map((allocation) => ({
        externalSaleStableId: allocation.externalSale.externalSaleStableId,
        amountCents: allocation.amountCents,
      })),
      components: row.components.map((component) => ({
        accountStableId: component.account.accountStableId,
        role: runQueryPolicy(() =>
          resolveAccountingExternalSaleSettlementComponentRole({
            accountStableId: component.account.accountStableId,
            accountClass: component.account.accountClass,
            accountType: component.account.type,
          }),
        ),
        amountCents: component.amountCents,
        label: component.label,
      })),
    };
  }
}
