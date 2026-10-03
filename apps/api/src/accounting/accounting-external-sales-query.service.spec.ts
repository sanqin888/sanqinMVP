import { ConflictException } from '@nestjs/common';
import { Prisma } from '@prisma/client';

import {
  AccountingAccountClass,
  AccountingAccountType,
  AccountingJournalSource,
} from './accounting-contracts';
import {
  ACCOUNTING_EXTERNAL_SALE_REVERSAL_SOURCE_FACT_TYPE,
  ACCOUNTING_EXTERNAL_SALE_SETTLEMENT_REVERSAL_SOURCE_FACT_TYPE,
  ACCOUNTING_EXTERNAL_SALE_SETTLEMENT_SOURCE_FACT_TYPE,
  ACCOUNTING_EXTERNAL_SALE_SOURCE_FACT_TYPE,
} from './accounting-external-sales.contract';
import { AccountingExternalSalesQueryService } from './accounting-external-sales-query.service';

const STORE = {
  storeStableId: '4750_Yonge_Street',
  storeName: 'SanQ Roujiamo',
  timezone: 'America/Toronto',
};

const settlementRow = (overrides: Record<string, unknown> = {}) => ({
  settlementStableId: 'extsettlement_live',
  storeStableId: STORE.storeStableId,
  settlementOn: new Date('2026-06-20T00:00:00.000Z'),
  counterpartyName: 'Supermarket A',
  reference: 'deposit-1',
  currency: 'CAD',
  note: 'bank deposit',
  journalEntryStableId: 'journal_settlement_live',
  reversalStableId: null,
  reversalFactHash: null,
  reversalJournalEntryStableId: null,
  reversedAt: null,
  reversedByActorRef: null,
  replacementForSettlement: null,
  replacedBySettlement: null,
  allocations: [
    {
      amountCents: 500,
      externalSale: { externalSaleStableId: 'extsale_1' },
    },
  ],
  components: [
    {
      amountCents: 500,
      label: 'Collection',
      account: {
        accountStableId: 'account_bank',
        accountClass: AccountingAccountClass.ASSET,
        type: AccountingAccountType.BANK,
      },
    },
  ],
  ...overrides,
});

const saleRow = (
  settlementAllocations: Array<{
    settlement: ReturnType<typeof settlementRow>;
  }>,
  overrides: Record<string, unknown> = {},
) => ({
  externalSaleStableId: 'extsale_1',
  storeStableId: STORE.storeStableId,
  classificationStableId: 'external_wholesale',
  granularity: 'TRANSACTION',
  occurredOn: new Date('2026-06-15T00:00:00.000Z'),
  periodStartOn: null,
  periodEndOn: null,
  counterpartyName: 'Supermarket A',
  reference: 'invoice-1',
  currency: 'CAD',
  journalEntryStableId: 'journal_sale_1',
  reversalStableId: null,
  reversalFactHash: null,
  reversalJournalEntryStableId: null,
  reversedAt: null,
  reversedByActorRef: null,
  note: null,
  createdByActorRef: 'user_accountant',
  createdAt: new Date('2026-06-15T12:00:00.000Z'),
  replacementForExternalSale: null,
  replacedByExternalSale: null,
  lines: [
    {
      lineStableId: 'line_1',
      description: 'Wholesale order',
      productReference: null,
      quantity: new Prisma.Decimal('10'),
      unit: 'case',
      unitPriceCents: 100,
      lineAmountCents: 1000,
      sortOrder: 0,
      revenueAccount: { accountStableId: 'account_sales_revenue' },
    },
  ],
  adjustments: [],
  taxes: [
    {
      taxStableId: 'tax_1',
      taxCode: 'HST',
      label: 'HST',
      rateBasisPoints: 1300,
      amountCents: 130,
      sortOrder: 0,
      liabilityAccount: { accountStableId: 'account_hst_payable' },
    },
  ],
  settlementAllocations,
  ...overrides,
});

const saleJournal = {
  entryStableId: 'journal_sale_1',
  source: AccountingJournalSource.EXTERNAL_SALE,
  sourceFactType: ACCOUNTING_EXTERNAL_SALE_SOURCE_FACT_TYPE,
  sourceFactStableId: 'extsale_1',
  sourceFactVersion: 1,
  storeStableId: STORE.storeStableId,
  currency: 'CAD',
  deletedAt: null,
  lines: [
    {
      debitCents: 1300,
      creditCents: 0,
      account: { accountStableId: 'account_accounts_receivable' },
    },
    {
      debitCents: 0,
      creditCents: 1300,
      account: { accountStableId: 'account_sales_revenue' },
    },
  ],
};

const reversalJournal = (
  reversalStableId: string,
  entryStableId: string,
  sourceFactType:
    | typeof ACCOUNTING_EXTERNAL_SALE_REVERSAL_SOURCE_FACT_TYPE
    | typeof ACCOUNTING_EXTERNAL_SALE_SETTLEMENT_REVERSAL_SOURCE_FACT_TYPE,
) => ({
  entryStableId,
  source: AccountingJournalSource.EXTERNAL_SALE,
  sourceFactType,
  sourceFactStableId: reversalStableId,
  sourceFactVersion: 1,
  storeStableId: STORE.storeStableId,
  currency: 'CAD',
  deletedAt: null,
});

const settlementJournal = (
  settlementStableId: string,
  entryStableId: string,
  appliedReceivableCents: number,
) => ({
  entryStableId,
  source: AccountingJournalSource.EXTERNAL_SALE,
  sourceFactType: ACCOUNTING_EXTERNAL_SALE_SETTLEMENT_SOURCE_FACT_TYPE,
  sourceFactStableId: settlementStableId,
  sourceFactVersion: 1,
  storeStableId: STORE.storeStableId,
  currency: 'CAD',
  deletedAt: null,
  lines: [
    {
      debitCents: 0,
      creditCents: appliedReceivableCents,
      account: { accountStableId: 'account_accounts_receivable' },
    },
  ],
});

function makeService(input: {
  sales: unknown[];
  settlements?: unknown[];
  settlementJournals?: unknown[];
  reversalJournals?: unknown[];
}) {
  const journalFindMany = jest
    .fn()
    .mockImplementation(
      (query: { where?: { entryStableId?: { in?: string[] } } }) => {
        const ids = query.where?.entryStableId?.in ?? [];
        if (ids.includes(saleJournal.entryStableId)) {
          return Promise.resolve([saleJournal]);
        }
        return Promise.resolve(
          [
            ...(input.settlementJournals ?? []),
            ...(input.reversalJournals ?? []),
          ].filter((journal) => {
            if (
              typeof journal !== 'object' ||
              journal === null ||
              !('entryStableId' in journal)
            ) {
              return false;
            }
            return ids.includes(String(journal.entryStableId));
          }),
        );
      },
    );
  const prisma = {
    accountingExternalSale: {
      findMany: jest.fn().mockResolvedValue(input.sales),
      findUnique: jest.fn().mockResolvedValue(input.sales[0] ?? null),
    },
    accountingExternalSaleSettlement: {
      findMany: jest.fn().mockResolvedValue(input.settlements ?? []),
    },
    accountingJournalEntry: { findMany: journalFindMany },
    accountingAccount: { findMany: jest.fn().mockResolvedValue([]) },
  };
  const store = {
    getConfiguredStoreSnapshot: jest.fn().mockResolvedValue(STORE),
  };
  return {
    service: new AccountingExternalSalesQueryService(
      prisma as never,
      store as never,
    ),
    prisma,
    journalFindMany,
  };
}

describe('AccountingExternalSalesQueryService', () => {
  it('derives outstanding AR from the canonical Sale Journal plus live settlements only', async () => {
    const live = settlementRow();
    const reversed = settlementRow({
      settlementStableId: 'extsettlement_reversed',
      journalEntryStableId: 'journal_settlement_reversed',
      reversalStableId: 'extsettlementreversal_1',
      reversalFactHash: 'settlement-reversal-hash',
      reversalJournalEntryStableId: 'journal_settlement_reversal_1',
      reversedAt: new Date('2026-06-22T12:00:00.000Z'),
      reversedByActorRef: 'user_accountant',
      allocations: [
        {
          amountCents: 200,
          externalSale: { externalSaleStableId: 'extsale_1' },
        },
      ],
    });
    const { service } = makeService({
      sales: [saleRow([{ settlement: live }, { settlement: reversed }])],
      settlementJournals: [
        settlementJournal(
          live.settlementStableId,
          live.journalEntryStableId,
          500,
        ),
        settlementJournal(
          reversed.settlementStableId,
          reversed.journalEntryStableId,
          200,
        ),
      ],
      reversalJournals: [
        reversalJournal(
          reversed.reversalStableId as string,
          reversed.reversalJournalEntryStableId as string,
          ACCOUNTING_EXTERNAL_SALE_SETTLEMENT_REVERSAL_SOURCE_FACT_TYPE,
        ),
      ],
    });

    const result = await service.listSales();

    expect(result.sales).toHaveLength(1);
    expect(result.sales[0]).toMatchObject({
      externalSaleStableId: 'extsale_1',
      totalReceivableCents: 1300,
      settledCents: 500,
      outstandingCents: 800,
      status: 'PARTIALLY_SETTLED',
    });
  });

  it('projects Settlement history from canonical Journal AR and exposes read-only component roles', async () => {
    const settlement = settlementRow();
    const { service } = makeService({
      sales: [],
      settlements: [settlement],
      settlementJournals: [
        settlementJournal(
          settlement.settlementStableId,
          settlement.journalEntryStableId,
          500,
        ),
      ],
    });

    const result = await service.listSettlements();

    expect(result.settlements).toHaveLength(1);
    expect(result.settlements[0]).toMatchObject({
      settlementStableId: 'extsettlement_live',
      note: 'bank deposit',
      appliedReceivableCents: 500,
      components: [
        {
          accountStableId: 'account_bank',
          role: 'COLLECTION',
          amountCents: 500,
          label: 'Collection',
        },
      ],
    });
  });

  it('fails closed when Settlement allocations disagree with the canonical Journal AR credit', async () => {
    const settlement = settlementRow();
    const { service } = makeService({
      sales: [],
      settlements: [settlement],
      settlementJournals: [
        settlementJournal(
          settlement.settlementStableId,
          settlement.journalEntryStableId,
          400,
        ),
      ],
    });

    await expect(service.listSettlements()).rejects.toThrow(
      'External Sale settlement allocation total does not match canonical Journal',
    );
  });

  it('reports a reversed Sale as REVERSED with zero outstanding receivable', async () => {
    const reversedSale = saleRow([], {
      reversalStableId: 'extsalereversal_1',
      reversalFactHash: 'sale-reversal-hash',
      reversalJournalEntryStableId: 'journal_sale_reversal_1',
      reversedAt: new Date('2026-06-25T12:00:00.000Z'),
      reversedByActorRef: 'user_accountant',
    });
    const { service } = makeService({
      sales: [reversedSale],
      reversalJournals: [
        reversalJournal(
          reversedSale.reversalStableId as string,
          reversedSale.reversalJournalEntryStableId as string,
          ACCOUNTING_EXTERNAL_SALE_REVERSAL_SOURCE_FACT_TYPE,
        ),
      ],
    });

    const result = await service.listSales();

    expect(result.sales[0]).toMatchObject({
      totalReceivableCents: 1300,
      settledCents: 0,
      outstandingCents: 0,
      status: 'REVERSED',
    });
  });

  it('fails closed when a reversal marker loses its canonical reversal Journal anchor', async () => {
    const reversedSale = saleRow([], {
      reversalStableId: 'extsalereversal_1',
      reversalFactHash: 'sale-reversal-hash',
      reversalJournalEntryStableId: 'journal_sale_reversal_1',
      reversedAt: new Date('2026-06-25T12:00:00.000Z'),
      reversedByActorRef: 'user_accountant',
    });
    const { service } = makeService({
      sales: [reversedSale],
      reversalJournals: [
        reversalJournal(
          reversedSale.reversalStableId as string,
          reversedSale.reversalJournalEntryStableId as string,
          ACCOUNTING_EXTERNAL_SALE_SETTLEMENT_REVERSAL_SOURCE_FACT_TYPE,
        ),
      ],
    });

    await expect(service.listSales()).rejects.toThrow(
      'External Sale reversal Journal anchor is invalid',
    );
  });

  it('fails closed when a live Settlement loses its canonical Journal anchor', async () => {
    const live = settlementRow();
    const { service } = makeService({
      sales: [saleRow([{ settlement: live }])],
      settlementJournals: [],
    });

    await expect(service.listSales()).rejects.toThrow(
      'External Sale settlement Journal anchor is invalid',
    );
  });

  it('fails closed when the Sale Journal source identity is not canonical', async () => {
    const journalFindMany = jest.fn().mockResolvedValue([
      {
        ...saleJournal,
        source: AccountingJournalSource.MANUAL,
      },
    ]);
    const prisma = {
      accountingExternalSale: {
        findMany: jest.fn().mockResolvedValue([saleRow([])]),
      },
      accountingJournalEntry: { findMany: journalFindMany },
    };
    const store = {
      getConfiguredStoreSnapshot: jest.fn().mockResolvedValue(STORE),
    };
    const service = new AccountingExternalSalesQueryService(
      prisma as never,
      store as never,
    );

    await expect(service.listSales()).rejects.toBeInstanceOf(ConflictException);
  });

  it('exposes only Accounting-authorized form account choices and no default collection account', async () => {
    const accounts = [
      {
        accountStableId: 'account_sales_revenue',
        name: 'Sales',
        accountClass: AccountingAccountClass.REVENUE,
        type: null,
      },
      {
        accountStableId: 'account_other_operating_revenue',
        name: 'Other operating revenue',
        accountClass: AccountingAccountClass.REVENUE,
        type: null,
      },
      {
        accountStableId: 'account_delivery_revenue',
        name: 'Delivery revenue',
        accountClass: AccountingAccountClass.REVENUE,
        type: null,
      },
      {
        accountStableId: 'account_sales_discounts',
        name: 'Sales discounts',
        accountClass: AccountingAccountClass.REVENUE,
        type: null,
      },
      {
        accountStableId: 'account_hst_payable',
        name: 'HST payable',
        accountClass: AccountingAccountClass.LIABILITY,
        type: null,
      },
      {
        accountStableId: 'account_commission_expense',
        name: 'Commission expense',
        accountClass: AccountingAccountClass.EXPENSE,
        type: null,
      },
      {
        accountStableId: 'account_hst_recoverable',
        name: 'HST recoverable',
        accountClass: AccountingAccountClass.ASSET,
        type: null,
      },
      {
        accountStableId: 'account_bank',
        name: 'Bank',
        accountClass: AccountingAccountClass.ASSET,
        type: AccountingAccountType.BANK,
      },
      {
        accountStableId: 'account_cash',
        name: 'Cash',
        accountClass: AccountingAccountClass.ASSET,
        type: AccountingAccountType.CASH,
      },
      {
        accountStableId: 'account_platform_wallet',
        name: 'Wallet',
        accountClass: AccountingAccountClass.ASSET,
        type: AccountingAccountType.PLATFORM_WALLET,
      },
    ];
    const prisma = {
      accountingAccount: {
        findMany: jest.fn().mockResolvedValue(accounts),
      },
      accountingExternalSale: {
        findMany: jest
          .fn()
          .mockResolvedValue([
            { classificationStableId: 'external_wholesale' },
          ]),
      },
    };
    const store = {
      getConfiguredStoreSnapshot: jest.fn().mockResolvedValue(STORE),
    };
    const service = new AccountingExternalSalesQueryService(
      prisma as never,
      store as never,
    );

    const options = await service.formOptions();

    expect(options.store).toEqual(STORE);
    expect(options.classificationSuggestions).toEqual(['external_wholesale']);
    expect(
      options.sale.lineRevenueAccounts.map((row) => row.accountStableId),
    ).toEqual(['account_sales_revenue', 'account_other_operating_revenue']);
    expect(
      options.settlement.collectionAccounts.map((row) => row.accountStableId),
    ).toEqual(['account_bank', 'account_cash']);
    expect(
      options.settlement.collectionAccounts.some(
        (row) => row.accountStableId === 'account_platform_wallet',
      ),
    ).toBe(false);
    expect(options.settlement.hstRecoverableAccount?.accountStableId).toBe(
      'account_hst_recoverable',
    );
  });
});
