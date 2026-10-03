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
      account: { accountStableId: 'account_commission_expense' },
    },
    {
      debitCents: 0,
      creditCents: 1000,
      account: { accountStableId: 'account_sales_revenue' },
    },
  ],
};

const externalSaleJournal = {
  entryStableId: 'journal_external_sale',
  source: 'EXTERNAL_SALE',
  sourceFactType: 'accounting.external_sale.v1',
  sourceFactStableId: 'extsale_original',
  storeStableId: STORE.storeStableId,
  occurredAt: new Date('2026-06-20T04:00:00.000Z'),
  lines: [
    {
      debitCents: 1243,
      creditCents: 0,
      account: { accountStableId: 'account_accounts_receivable' },
    },
    {
      debitCents: 100,
      creditCents: 0,
      account: { accountStableId: 'account_sales_discounts' },
    },
    {
      debitCents: 0,
      creditCents: 1000,
      account: { accountStableId: 'account_sales_revenue' },
    },
    {
      debitCents: 0,
      creditCents: 200,
      account: { accountStableId: 'account_delivery_revenue' },
    },
    {
      debitCents: 0,
      creditCents: 143,
      account: { accountStableId: 'account_hst_payable' },
    },
  ],
};

const externalSaleReversalJournal = {
  entryStableId: 'journal_external_sale_reversal',
  source: 'EXTERNAL_SALE',
  sourceFactType: 'accounting.external_sale_reversal.v1',
  sourceFactStableId: 'extsalereversal_original',
  storeStableId: STORE.storeStableId,
  occurredAt: externalSaleJournal.occurredAt,
  lines: externalSaleJournal.lines.map((line) => ({
    debitCents: line.creditCents,
    creditCents: line.debitCents,
    account: line.account,
  })),
};

const externalReplacementJournal = {
  entryStableId: 'journal_external_replacement',
  source: 'EXTERNAL_SALE',
  sourceFactType: 'accounting.external_sale.v1',
  sourceFactStableId: 'extsale_replacement',
  storeStableId: STORE.storeStableId,
  occurredAt: new Date('2026-06-21T04:00:00.000Z'),
  lines: [
    {
      debitCents: 1356,
      creditCents: 0,
      account: { accountStableId: 'account_accounts_receivable' },
    },
    {
      debitCents: 0,
      creditCents: 1200,
      account: { accountStableId: 'account_sales_revenue' },
    },
    {
      debitCents: 0,
      creditCents: 156,
      account: { accountStableId: 'account_hst_payable' },
    },
  ],
};

const externalSaleRows = [
  {
    externalSaleStableId: 'extsale_original',
    storeStableId: STORE.storeStableId,
    classificationStableId: 'external_wholesale',
    journalEntryStableId: externalSaleJournal.entryStableId,
    reversalStableId: externalSaleReversalJournal.sourceFactStableId,
    reversalJournalEntryStableId: externalSaleReversalJournal.entryStableId,
  },
  {
    externalSaleStableId: 'extsale_replacement',
    storeStableId: STORE.storeStableId,
    classificationStableId: 'external_group_buy',
    journalEntryStableId: externalReplacementJournal.entryStableId,
    reversalStableId: null,
    reversalJournalEntryStableId: null,
  },
];

type JournalFindManyQueryCapture = {
  where?: {
    storeStableId?: string;
    sourceFactType?: { in?: string[] };
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
  externalSales?: unknown[];
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
  const externalSaleFindMany = jest
    .fn()
    .mockResolvedValue(options?.externalSales ?? []);
  const prisma = {
    accountingJournalEntry: { findMany: journalFindMany },
    accountingProviderFinancialDocument: { findMany: providerFindMany },
    accountingExternalSale: { findMany: externalSaleFindMany },
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
    externalSaleFindMany,
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

  it('projects ordinary External Sale money from Journal with explicit external attribution', async () => {
    const { service, externalSaleFindMany, orderAttribution } = makeService({
      journals: [externalSaleJournal],
      originalJournals: [],
      providerDocuments: [],
      externalSales: [externalSaleRows[0]],
      attributionRows: [],
      coverageRows: [],
    });

    const report = await service.report({
      from: '2026-06-01',
      to: '2026-06-30',
    });

    expect(report.summary).toMatchObject({
      grossSalesCents: 1000,
      discountsCents: 100,
      netFoodSalesCents: 900,
      deliveryRevenueCents: 200,
      netSalesRevenueCents: 1100,
      outputTaxCents: 143,
      platformCommissionCents: 0,
      contributionCents: 1100,
    });
    const externalChannel = report.byChannel.find(
      (row) => row.key === 'external',
    );
    expect(externalChannel).toMatchObject({
      key: 'external',
      journalEntryCount: 1,
    });
    expect(externalChannel?.summary).toMatchObject({ grossSalesCents: 1000 });

    const notApplicablePayment = report.byPrimaryPaymentMethod.find(
      (row) => row.key === 'NOT_APPLICABLE',
    );
    expect(notApplicablePayment).toMatchObject({
      key: 'NOT_APPLICABLE',
      journalEntryCount: 1,
    });
    expect(notApplicablePayment?.summary).toMatchObject({
      grossSalesCents: 1000,
    });

    const wholesale = report.byExternalClassification.find(
      (row) => row.key === 'external_wholesale',
    );
    expect(wholesale).toMatchObject({
      key: 'external_wholesale',
      journalEntryCount: 1,
    });
    expect(wholesale?.summary).toMatchObject({
      grossSalesCents: 1000,
      discountsCents: 100,
      deliveryRevenueCents: 200,
    });
    expect(report.bySource).toEqual([
      expect.objectContaining({ key: 'EXTERNAL_SALE', journalEntryCount: 1 }),
    ]);
    expect(report.tenderMix).toEqual([]);
    expect(report.attribution).toEqual({
      immutableOrderAttributedJournalEntries: 0,
      legacyOrderAttributedJournalEntries: 0,
      missingOrderAttributedJournalEntries: 0,
      worstQuality: null,
    });
    expect(externalSaleFindMany).toHaveBeenCalledTimes(1);
    expect(orderAttribution.readBySourceFactStableIds).toHaveBeenCalledWith([]);
  });

  it('nets External Sale reversal plus replacement and keeps provider commission provider-specific', async () => {
    const { service } = makeService({
      journals: [
        externalSaleJournal,
        externalSaleReversalJournal,
        externalReplacementJournal,
        uberProviderStatement,
      ],
      originalJournals: [],
      externalSales: externalSaleRows,
      attributionRows: [],
    });

    const report = await service.report({
      from: '2026-06-01',
      to: '2026-06-30',
    });

    expect(report.summary).toMatchObject({
      grossSalesCents: 2200,
      discountsCents: 0,
      deliveryRevenueCents: 0,
      netSalesRevenueCents: 2200,
      outputTaxCents: 156,
      platformCommissionCents: 100,
      contributionCents: 2100,
    });
    expect(
      report.byChannel.find((row) => row.key === 'external'),
    ).toMatchObject({
      journalEntryCount: 3,
      summary: {
        grossSalesCents: 1200,
        platformCommissionCents: 0,
        contributionCents: 1200,
      },
    });
    expect(
      report.byChannel.find((row) => row.key === 'ubereats'),
    ).toMatchObject({
      journalEntryCount: 1,
      summary: {
        grossSalesCents: 1000,
        platformCommissionCents: 100,
        contributionCents: 900,
      },
    });
    expect(
      report.byPrimaryPaymentMethod.find(
        (row) => row.key === 'NOT_APPLICABLE',
      ),
    ).toMatchObject({
      journalEntryCount: 3,
      summary: {
        grossSalesCents: 1200,
        platformCommissionCents: 0,
      },
    });

    const wholesale = report.byExternalClassification.find(
      (row) => row.key === 'external_wholesale',
    );
    expect(wholesale).toMatchObject({
      key: 'external_wholesale',
      journalEntryCount: 2,
    });
    expect(wholesale?.summary).toMatchObject({
      grossSalesCents: 0,
      discountsCents: 0,
      deliveryRevenueCents: 0,
      outputTaxCents: 0,
      contributionCents: 0,
    });

    const groupBuy = report.byExternalClassification.find(
      (row) => row.key === 'external_group_buy',
    );
    expect(groupBuy).toMatchObject({
      key: 'external_group_buy',
      journalEntryCount: 1,
    });
    expect(groupBuy?.summary).toMatchObject({
      grossSalesCents: 1200,
      contributionCents: 1200,
    });

    expect(report.bySource).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ key: 'EXTERNAL_SALE', journalEntryCount: 2 }),
        expect.objectContaining({
          key: 'EXTERNAL_SALE_REVERSAL',
          journalEntryCount: 1,
        }),
      ]),
    );
    const providerStatement = report.bySource.find(
      (row) => row.key === 'PROVIDER_STATEMENT',
    );
    expect(providerStatement).toMatchObject({
      key: 'PROVIDER_STATEMENT',
      journalEntryCount: 1,
    });
    expect(providerStatement?.summary).toMatchObject({
      platformCommissionCents: 100,
    });
    expect(report.tenderMix).toEqual([
      { tender: 'UBER_EATS', amountCents: 900 },
    ]);
  });

  it('fails closed when an External Sales Journal loses its source fact or Journal anchor', async () => {
    const missing = makeService({
      journals: [externalSaleJournal],
      originalJournals: [],
      providerDocuments: [],
      externalSales: [],
      attributionRows: [],
    });
    await expect(
      missing.service.report({ from: '2026-06-01', to: '2026-06-30' }),
    ).rejects.toThrow(
      'Canonical External Sale Journal references a missing source fact',
    );

    const mismatched = makeService({
      journals: [externalSaleJournal],
      originalJournals: [],
      providerDocuments: [],
      externalSales: [
        {
          ...externalSaleRows[0],
          journalEntryStableId: 'journal_wrong_anchor',
        },
      ],
      attributionRows: [],
    });
    await expect(
      mismatched.service.report({ from: '2026-06-01', to: '2026-06-30' }),
    ).rejects.toThrow(
      'Canonical External Sale Journal source-fact anchor mismatch',
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
    expect(journalQueries[0]?.where?.sourceFactType?.in).toEqual(
      expect.arrayContaining([
        'accounting.external_sale.v1',
        'accounting.external_sale_reversal.v1',
      ]),
    );
    expect(journalQueries[0]?.where?.sourceFactType?.in).not.toContain(
      'accounting.external_sale_settlement.v1',
    );
    expect(journalQueries[0]?.where?.sourceFactType?.in).not.toContain(
      'accounting.external_sale_settlement_reversal.v1',
    );
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
