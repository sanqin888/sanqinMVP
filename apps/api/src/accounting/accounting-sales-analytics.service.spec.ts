import { AccountingFinancialProvider } from './accounting-contracts';
import { AccountingSalesAnalyticsService } from './accounting-sales-analytics.service';

const STORE = {
  storeStableId: '4750_Yonge_Street',
  storeName: 'SanQ',
  isActive: true,
  timezone: 'America/Toronto',
};

const saleJournal = {
  entryStableId: 'journal_sale_card',
  source: 'ORDER',
  sourceFactType: 'order.financial_sale.v1',
  sourceFactStableId: 'order_card',
  storeStableId: STORE.storeStableId,
  occurredAt: new Date('2026-06-10T16:00:00.000Z'),
  lines: [
    {
      debitCents: 1130,
      creditCents: 0,
      account: { accountStableId: 'account_clover_pending' },
    },
    {
      debitCents: 0,
      creditCents: 1000,
      account: { accountStableId: 'account_sales_revenue' },
    },
    {
      debitCents: 0,
      creditCents: 130,
      account: { accountStableId: 'account_hst_payable' },
    },
  ],
};

const changeJournal = {
  entryStableId: 'journal_change_card',
  source: 'ORDER',
  sourceFactType: 'order.financial_adjustment.v1',
  sourceFactStableId: 'change_card',
  storeStableId: STORE.storeStableId,
  occurredAt: new Date('2026-06-11T16:00:00.000Z'),
  lines: [
    {
      debitCents: 200,
      creditCents: 0,
      account: { accountStableId: 'account_sales_revenue' },
    },
    {
      debitCents: 26,
      creditCents: 0,
      account: { accountStableId: 'account_hst_payable' },
    },
    {
      debitCents: 0,
      creditCents: 226,
      account: { accountStableId: 'account_clover_pending' },
    },
  ],
};

const uberOriginalSale = {
  entryStableId: 'journal_uber_original',
  source: 'ORDER',
  sourceFactType: 'order.financial_sale.v1',
  sourceFactStableId: 'legacy_uber_order',
  storeStableId: STORE.storeStableId,
  occurredAt: new Date('2026-06-12T16:00:00.000Z'),
  lines: [
    {
      debitCents: 1000,
      creditCents: 0,
      account: { accountStableId: 'account_uber_pending' },
    },
    {
      debitCents: 0,
      creditCents: 1000,
      account: { accountStableId: 'account_sales_revenue' },
    },
  ],
};

const uberHistoricalReversal = {
  entryStableId: 'journal_uber_reversal',
  source: 'SYSTEM',
  sourceFactType: 'accounting.uber_pre_cutover_order_reversal.v1',
  sourceFactStableId: 'journal_uber_original',
  storeStableId: STORE.storeStableId,
  occurredAt: new Date('2026-06-30T20:00:00.000Z'),
  lines: [
    {
      debitCents: 1000,
      creditCents: 0,
      account: { accountStableId: 'account_sales_revenue' },
    },
    {
      debitCents: 0,
      creditCents: 1000,
      account: { accountStableId: 'account_uber_pending' },
    },
  ],
};

const uberProviderStatement = {
  entryStableId: 'journal_uber_statement',
  source: 'PLATFORM_STATEMENT',
  sourceFactType: 'accounting.provider_financial_document.v1',
  sourceFactStableId: 'provider_doc_uber_june',
  storeStableId: STORE.storeStableId,
  occurredAt: new Date('2026-07-01T03:59:59.999Z'),
  lines: [
    {
      debitCents: 900,
      creditCents: 0,
      account: { accountStableId: 'account_uber_pending' },
    },
    {
      debitCents: 100,
      creditCents: 0,
      account: { accountStableId: 'account_platform_commission_expense' },
    },
    {
      debitCents: 0,
      creditCents: 1000,
      account: { accountStableId: 'account_sales_revenue' },
    },
  ],
};

type JournalFindManyQueryCapture = {
  where?: {
    storeStableId?: string;
    occurredAt?: {
      gte?: Date;
      lt?: Date;
    };
  };
};

function makeService(options?: {
  journals?: unknown[];
  originalJournals?: unknown[];
  providerDocuments?: unknown[];
  attributionRows?: unknown[];
  coverageRows?: unknown[];
}) {
  const journalResponses: unknown[][] = [
    options?.journals ?? [
      saleJournal,
      changeJournal,
      uberOriginalSale,
      uberHistoricalReversal,
      uberProviderStatement,
    ],
    options?.originalJournals ?? [
      {
        entryStableId: 'journal_uber_original',
        source: 'ORDER',
        sourceFactType: 'order.financial_sale.v1',
        sourceFactStableId: 'legacy_uber_order',
      },
    ],
  ];
  const journalQueries: JournalFindManyQueryCapture[] = [];
  const journalFindMany = jest.fn(
    (query: JournalFindManyQueryCapture): Promise<unknown[]> => {
      journalQueries.push(query);
      return Promise.resolve(journalResponses.shift() ?? []);
    },
  );
  const providerFindMany = jest.fn().mockResolvedValue(
    options?.providerDocuments ?? [
      {
        documentStableId: 'provider_doc_uber_june',
        provider: AccountingFinancialProvider.UBER_EATS,
      },
    ],
  );
  const prisma = {
    accountingJournalEntry: { findMany: journalFindMany },
    accountingProviderFinancialDocument: { findMany: providerFindMany },
  };
  const period = {
    requireCanonicalFinancialPostingStartAt: jest
      .fn()
      .mockResolvedValue(new Date('2026-06-01T04:00:00.000Z')),
  };
  const settlementQuery = {
    readProviderFinancialCoverage: jest.fn().mockResolvedValue(
      options?.coverageRows ?? [
        {
          provider: AccountingFinancialProvider.UBER_EATS,
          financialHistoryRequiredFrom: new Date('2026-06-01T00:00:00.000Z'),
          financialCompleteThrough: new Date('2026-06-30T00:00:00.000Z'),
        },
        {
          provider: AccountingFinancialProvider.FANTUAN,
          financialHistoryRequiredFrom: new Date('2026-06-01T00:00:00.000Z'),
          financialCompleteThrough: null,
        },
      ],
    ),
  };
  const orderAttribution = {
    readBySourceFactStableIds: jest.fn().mockResolvedValue(
      options?.attributionRows ?? [
        {
          version: 1,
          sourceFactStableId: 'order_card',
          orderStableId: 'order_card',
          storeStableId: STORE.storeStableId,
          occurredAt: saleJournal.occurredAt,
          channel: 'in_store',
          primaryPaymentMethod: 'CARD',
          sourceEvidence: 'IMMUTABLE_SALE_SNAPSHOT',
          primaryPaymentMethodEvidence: 'IMMUTABLE_SALE_SNAPSHOT',
        },
        {
          version: 1,
          sourceFactStableId: 'change_card',
          orderStableId: 'order_card',
          storeStableId: STORE.storeStableId,
          occurredAt: changeJournal.occurredAt,
          channel: 'in_store',
          primaryPaymentMethod: 'CARD',
          sourceEvidence: 'IMMUTABLE_CHANGE_SNAPSHOT',
          primaryPaymentMethodEvidence: 'IMMUTABLE_SALE_SNAPSHOT',
        },
        {
          version: 1,
          sourceFactStableId: 'legacy_uber_order',
          orderStableId: 'legacy_uber_order',
          storeStableId: STORE.storeStableId,
          occurredAt: uberOriginalSale.occurredAt,
          channel: 'ubereats',
          primaryPaymentMethod: 'UBEREATS',
          sourceEvidence: 'LEGACY_CURRENT_ORDER',
          primaryPaymentMethodEvidence: 'LEGACY_CURRENT_ORDER',
        },
      ],
    ),
  };
  const storeConfig = {
    getConfiguredStoreSnapshot: jest.fn().mockResolvedValue(STORE),
  };

  return {
    service: new AccountingSalesAnalyticsService(
      prisma as never,
      period as never,
      settlementQuery as never,
      orderAttribution as never,
      storeConfig as never,
    ),
    journalFindMany,
    journalQueries,
    providerFindMany,
    settlementQuery,
    orderAttribution,
  };
}

describe('AccountingSalesAnalyticsService', () => {
  it('projects canonical Journal amounts with owner attribution and historical Uber replacement', async () => {
    const { service, orderAttribution } = makeService();

    const report = await service.report({
      from: '2026-06-01',
      to: '2026-06-30',
    });

    expect(report.summary).toMatchObject({
      grossSalesCents: 1800,
      outputTaxCents: 104,
      platformCommissionCents: 100,
      netSalesRevenueCents: 1800,
      contributionCents: 1700,
    });
    expect(
      report.byChannel.find((row) => row.key === 'in_store'),
    ).toMatchObject({
      key: 'in_store',
      summary: {
        grossSalesCents: 800,
        contributionCents: 800,
      },
    });
    expect(
      report.byChannel.find((row) => row.key === 'ubereats'),
    ).toMatchObject({
      key: 'ubereats',
      summary: {
        grossSalesCents: 1000,
        platformCommissionCents: 100,
        contributionCents: 900,
      },
    });
    expect(
      report.byPrimaryPaymentMethod.find((row) => row.key === 'CARD'),
    ).toMatchObject({
      key: 'CARD',
      summary: { grossSalesCents: 800 },
    });
    expect(
      report.byPrimaryPaymentMethod.find((row) => row.key === 'UBEREATS'),
    ).toMatchObject({
      key: 'UBEREATS',
      summary: { grossSalesCents: 1000 },
    });
    expect(report.tenderMix).toEqual(
      expect.arrayContaining([
        { tender: 'CLOVER_CARD', amountCents: 904 },
        { tender: 'UBER_EATS', amountCents: 900 },
      ]),
    );
    expect(report.bySource).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ key: 'ORDER_SALE', journalEntryCount: 2 }),
        expect.objectContaining({ key: 'ORDER_CHANGE', journalEntryCount: 1 }),
        expect.objectContaining({
          key: 'PROVIDER_STATEMENT',
          journalEntryCount: 1,
        }),
        expect.objectContaining({
          key: 'HISTORICAL_REPLACEMENT_REVERSAL',
          journalEntryCount: 1,
        }),
      ]),
    );
    expect(report.attribution).toEqual({
      immutableOrderAttributedJournalEntries: 2,
      legacyOrderAttributedJournalEntries: 2,
      missingOrderAttributedJournalEntries: 0,
      worstQuality: 'LEGACY_CURRENT_ORDER',
    });
    expect(report.providerCoverage).toEqual({
      overall: 'UNKNOWN',
      providers: [
        expect.objectContaining({
          provider: AccountingFinancialProvider.CLOVER,
          status: 'UNKNOWN',
        }),
        expect.objectContaining({
          provider: AccountingFinancialProvider.UBER_EATS,
          status: 'COMPLETE',
        }),
        expect.objectContaining({
          provider: AccountingFinancialProvider.FANTUAN,
          status: 'INCOMPLETE',
        }),
      ],
    });
    expect(orderAttribution.readBySourceFactStableIds).toHaveBeenCalledWith(
      expect.arrayContaining([
        'order_card',
        'change_card',
        'legacy_uber_order',
      ]),
    );
  });

  it('keeps canonical money visible in an UNATTRIBUTED bucket when Orders dimensions are missing', async () => {
    const { service } = makeService({
      journals: [saleJournal],
      originalJournals: [],
      providerDocuments: [],
      attributionRows: [],
      coverageRows: [],
    });

    const report = await service.report({
      from: '2026-06-01',
      to: '2026-06-30',
    });

    expect(report.summary.grossSalesCents).toBe(1000);
    expect(report.byChannel).toHaveLength(1);
    expect(report.byChannel[0]).toMatchObject({
      key: 'UNATTRIBUTED',
      summary: { grossSalesCents: 1000 },
    });
    expect(report.attribution).toEqual({
      immutableOrderAttributedJournalEntries: 0,
      legacyOrderAttributedJournalEntries: 0,
      missingOrderAttributedJournalEntries: 1,
      worstQuality: 'MISSING',
    });
  });

  it('fails closed when a provider Journal references a missing provider document', async () => {
    const { service } = makeService({
      journals: [uberProviderStatement],
      originalJournals: [],
      providerDocuments: [],
      attributionRows: [],
    });

    await expect(
      service.report({ from: '2026-06-01', to: '2026-06-30' }),
    ).rejects.toThrow(
      'Canonical Sales provider Journal references a missing provider document',
    );
  });

  it('fails closed when an Uber replacement reversal loses its original Journal anchor', async () => {
    const { service } = makeService({
      journals: [uberHistoricalReversal],
      originalJournals: [],
      providerDocuments: [],
      attributionRows: [],
    });

    await expect(
      service.report({ from: '2026-06-01', to: '2026-06-30' }),
    ).rejects.toThrow(
      'Canonical Uber replacement reversal references a missing original Journal',
    );
  });

  it('fails closed when a canonical Sales source fact is attached to the wrong Journal owner', async () => {
    const { service } = makeService({
      journals: [
        {
          ...saleJournal,
          source: 'MANUAL',
        },
      ],
      originalJournals: [],
      providerDocuments: [],
    });

    await expect(
      service.report({ from: '2026-06-01', to: '2026-06-30' }),
    ).rejects.toThrow(
      'Sales Journal source authority mismatch: journal_sale_card',
    );
  });

  it('clamps the requested range to accountingStartDate and uses Journal occurredAt bounds', async () => {
    const { service, journalQueries } = makeService({
      journals: [],
      originalJournals: [],
      providerDocuments: [],
      attributionRows: [],
      coverageRows: [],
    });

    const report = await service.report({
      from: '2026-05-01',
      to: '2026-06-02',
    });

    expect(report.accountingStartDate).toBe('2026-06-01');
    expect(report.from).toBe('2026-06-01');
    expect(report.to).toBe('2026-06-02');
    expect(journalQueries[0]?.where?.storeStableId).toBe(STORE.storeStableId);
    expect(journalQueries[0]?.where?.occurredAt).toEqual({
      gte: new Date('2026-06-01T04:00:00.000Z'),
      lt: new Date('2026-06-03T04:00:00.000Z'),
    });
  });

  it('rejects reversed or excessively large date ranges', async () => {
    const { service } = makeService({
      journals: [],
      originalJournals: [],
      providerDocuments: [],
      attributionRows: [],
      coverageRows: [],
    });

    await expect(
      service.report({ from: '2026-06-10', to: '2026-06-01' }),
    ).rejects.toThrow('to must be on or after from');
    await expect(
      service.report({ from: '2026-06-01', to: '2027-07-01' }),
    ).rejects.toThrow('Sales report range cannot exceed 370 days');
  });
});
