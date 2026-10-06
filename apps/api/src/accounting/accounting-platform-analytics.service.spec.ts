import {
  AccountingFinancialComponent,
  AccountingFinancialDocumentType,
  AccountingFinancialPostingTreatment,
  AccountingFinancialProvider,
  AccountingFinancialTaxRole,
  AccountingInboxMaterializedEntityType,
  AccountingInboxStatus,
  AccountingProviderFinancialCorrectionReason,
} from './accounting-contracts';
import { AccountingPlatformAnalyticsService } from './accounting-platform-analytics.service';

const STORE = {
  storeStableId: '4750_Yonge_Street',
  storeName: 'SanQ',
  isActive: true,
  timezone: 'America/Toronto',
};

const monthEnd = (month: string): string => {
  const year = Number(month.slice(0, 4));
  const monthNumber = Number(month.slice(5, 7));
  return new Date(Date.UTC(year, monthNumber, 0)).toISOString().slice(0, 10);
};

type TestLine = {
  lineStableId: string;
  lineNo: number;
  rawCode: string | null;
  rawName: string;
  component: AccountingFinancialComponent;
  postingTreatment: AccountingFinancialPostingTreatment;
  taxRole: AccountingFinancialTaxRole;
  amountCents: number;
  occurredAt: Date | null;
};

const line = (
  lineStableId: string,
  rawName: string,
  component: AccountingFinancialComponent,
  amountCents: number,
  taxRole: AccountingFinancialTaxRole = AccountingFinancialTaxRole.NONE,
): TestLine => ({
  lineStableId,
  lineNo: Number(lineStableId.match(/\d+$/)?.[0] ?? '1'),
  rawCode: null,
  rawName,
  component,
  postingTreatment: AccountingFinancialPostingTreatment.POSTABLE,
  taxRole,
  amountCents,
  occurredAt: null,
});

const sumNamedLines = (lines: TestLine[], rawNames: readonly string[]) => {
  const names = new Set(rawNames.map((name) => name.toLowerCase()));
  return lines.reduce(
    (sum, candidate) =>
      names.has(candidate.rawName.toLowerCase())
        ? sum + candidate.amountCents
        : sum,
    0,
  );
};

const withUberControlTotals = (
  inputLines: TestLine[],
  controlSalesCents?: number,
): TestLine[] => {
  const lines = [...inputLines];
  const appendControl = (
    rawName: string,
    componentRawNames: readonly string[],
    amountOverride?: number,
  ) => {
    lines.push({
      lineStableId: `control_${lines.length + 1}`,
      lineNo: lines.length + 1,
      rawCode: null,
      rawName,
      component: AccountingFinancialComponent.CONTROL_TOTAL,
      postingTreatment: AccountingFinancialPostingTreatment.CONTROL_TOTAL,
      taxRole: AccountingFinancialTaxRole.NONE,
      amountCents: amountOverride ?? sumNamedLines(lines, componentRawNames),
      occurredAt: null,
    });
  };

  const earningsNames = [
    'Sales',
    'Tax on Sales',
    'Tips',
    'Container Fees',
    'Tax on Container Fees',
    'Other Earnings',
    'Tax on Other Earnings',
  ] as const;
  const rawEarnings = sumNamedLines(lines, earningsNames);
  const sourceSales = sumNamedLines(lines, ['Sales']);
  const earnings =
    controlSalesCents === undefined
      ? rawEarnings
      : rawEarnings - sourceSales + controlSalesCents;
  appendControl('Total Earnings', earningsNames, earnings);
  appendControl('Total Uber Fees', [
    'Marketplace Fees',
    'Tax on Marketplace Fees',
    'Other Charges',
    'Tax On Other Charges',
  ]);
  appendControl('Total Marketing Spends', [
    'Offers On Items',
    'Provider Subsidy',
    'Marketing Adjustment',
    'Other Offer Charges',
    'Tax on offer spends',
    'Ad Spends',
    'Ad Credits',
    'Tax on Net Ad Spends',
  ]);
  appendControl('Total Amendments', [
    'Net Chargeback Amount',
    'Net Tax On Chargeback',
    'Marketplace Facilitator Tax',
    'Adjustments',
    'Tax On Adjustments',
  ]);
  appendControl('Net Total', [
    'Total Earnings',
    'Total Uber Fees',
    'Total Marketing Spends',
    'Total Amendments',
  ]);
  return lines;
};

const statement = (input: {
  provider: AccountingFinancialProvider;
  month: string;
  lines: TestLine[];
  revision?: number;
  businessIdentityKey?: string;
  status?: AccountingInboxStatus;
  uberControlSalesCents?: number;
  corrections?: Array<{
    sourceLineStableId: string;
    effectiveAmountCents?: number;
    effectiveComponent?: AccountingFinancialComponent;
    effectiveTaxRole?: AccountingFinancialTaxRole;
  }>;
}) => {
  const revision = input.revision ?? 1;
  const documentStableId = `doc_${input.provider}_${input.month}_r${revision}`;
  const status = input.status ?? AccountingInboxStatus.CONFIRMED;
  const sourceLines =
    input.provider === AccountingFinancialProvider.UBER_EATS
      ? withUberControlTotals(input.lines, input.uberControlSalesCents)
      : input.lines;
  return {
    documentStableId,
    provider: input.provider,
    documentType: AccountingFinancialDocumentType.STATEMENT,
    businessIdentityKey:
      input.businessIdentityKey ?? `${input.provider}:${input.month}`,
    revision,
    supersedesDocumentId: null,
    storeStableId: STORE.storeStableId,
    providerDocumentRef: `${input.provider}:${input.month}`,
    periodStart: new Date(`${input.month}-01T00:00:00.000Z`),
    periodEnd: new Date(`${monthEnd(input.month)}T00:00:00.000Z`),
    settledAt: null,
    payoutAt: null,
    currency: 'CAD',
    rawMetadata: null,
    artifact: {
      inboxItem: {
        inboxItemStableId: `inbox_${documentStableId}`,
        status,
        materializedEntityType:
          AccountingInboxMaterializedEntityType.PROVIDER_FINANCIAL_DOCUMENT,
        materializedEntityStableId: documentStableId,
        reviewedAt:
          status === AccountingInboxStatus.CONFIRMED
            ? new Date('2026-09-15T12:00:00.000Z')
            : null,
        reviewedByUserStableId:
          status === AccountingInboxStatus.CONFIRMED ? 'user_admin_1' : null,
        version: revision,
      },
    },
    lines: sourceLines,
    reviewRevisions:
      input.corrections && input.corrections.length > 0
        ? [
            {
              reviewRevisionStableId: `review_${documentStableId}`,
              revision: 1,
              reviewHash: 'a'.repeat(64),
              confirmedAt: new Date('2026-09-15T12:00:00.000Z'),
              confirmedByUserStableId: 'user_admin_1',
              effectiveSnapshotParserName: null,
              effectiveSnapshotParserVersion: null,
              effectiveSnapshotParseRun: null,
              effectiveLines: [],
              corrections: input.corrections.map((correction) => {
                const source = sourceLines.find(
                  (candidate) =>
                    candidate.lineStableId === correction.sourceLineStableId,
                );
                if (!source) throw new Error('missing test source line');
                const semanticClassification =
                  correction.effectiveComponent !== undefined ||
                  correction.effectiveTaxRole !== undefined;
                return {
                  sourceLineStableId: source.lineStableId,
                  reason: semanticClassification
                    ? AccountingProviderFinancialCorrectionReason.SEMANTIC_CLASSIFICATION
                    : AccountingProviderFinancialCorrectionReason.EXTRACTION_CORRECTION,
                  note: semanticClassification
                    ? 'Payment Details confirms the provider summary classification'
                    : null,
                  effectiveRawCode: source.rawCode,
                  effectiveRawName: source.rawName,
                  effectiveComponent:
                    correction.effectiveComponent ?? source.component,
                  effectivePostingTreatment: source.postingTreatment,
                  effectiveTaxRole:
                    correction.effectiveTaxRole ?? source.taxRole,
                  effectiveAmountCents:
                    correction.effectiveAmountCents ?? source.amountCents,
                };
              }),
            },
          ]
        : [],
  };
};

function makeService(documents: unknown[]) {
  const settlementQuery = {
    readProviderSettlementDocuments: jest.fn().mockResolvedValue(documents),
  };
  const storeConfig = {
    getStoreSnapshot: jest.fn().mockResolvedValue(STORE),
    getConfiguredStoreSnapshot: jest.fn().mockResolvedValue(STORE),
  };
  return {
    service: new AccountingPlatformAnalyticsService(
      settlementQuery as never,
      storeConfig as never,
    ),
    settlementQuery,
    storeConfig,
  };
}

describe('AccountingPlatformAnalyticsService', () => {
  it('projects the latest confirmed month plus two prior calendar months with ex-tax platform costs', async () => {
    const uberAugust = statement({
      provider: AccountingFinancialProvider.UBER_EATS,
      month: '2026-08',
      lines: [
        line(
          'uber_aug_1',
          'Sales',
          AccountingFinancialComponent.SALES,
          100_000,
        ),
        line(
          'uber_aug_2',
          'Tax on Sales',
          AccountingFinancialComponent.SALES_TAX,
          13_000,
          AccountingFinancialTaxRole.SALES_TAX,
        ),
        line(
          'uber_aug_3',
          'Marketplace Fees',
          AccountingFinancialComponent.COMMISSION,
          -20_000,
        ),
        line(
          'uber_aug_4',
          'Tax on Marketplace Fees',
          AccountingFinancialComponent.COMMISSION_TAX,
          -2_600,
          AccountingFinancialTaxRole.INPUT_TAX,
        ),
        line(
          'uber_aug_5',
          'Offers On Items',
          AccountingFinancialComponent.PROMOTION,
          -10_000,
        ),
        line(
          'uber_aug_6',
          'Ad Credits',
          AccountingFinancialComponent.ADVERTISING_CREDIT,
          1_000,
        ),
      ],
    });
    const uberJuly = statement({
      provider: AccountingFinancialProvider.UBER_EATS,
      month: '2026-07',
      lines: [
        line('uber_jul_1', 'Sales', AccountingFinancialComponent.SALES, 80_000),
        line(
          'uber_jul_2',
          'Marketplace Fees',
          AccountingFinancialComponent.COMMISSION,
          -16_000,
        ),
      ],
    });
    const uberJune = statement({
      provider: AccountingFinancialProvider.UBER_EATS,
      month: '2026-06',
      lines: [
        line('uber_jun_1', 'Sales', AccountingFinancialComponent.SALES, 70_000),
        line(
          'uber_jun_2',
          'Marketplace Fees',
          AccountingFinancialComponent.COMMISSION,
          -14_000,
        ),
      ],
    });
    const fantuanMonths = ['2026-08', '2026-07', '2026-06'].map(
      (month, index) =>
        statement({
          provider: AccountingFinancialProvider.FANTUAN,
          month,
          lines: [
            line(
              `fantuan_${index}_1`,
              'Sales',
              AccountingFinancialComponent.SALES,
              120_000 - index * 10_000,
            ),
            line(
              `fantuan_${index}_2`,
              'Commission',
              AccountingFinancialComponent.COMMISSION,
              -30_000,
            ),
            line(
              `fantuan_${index}_3`,
              'Fantuan Subsidy for Promotion events',
              AccountingFinancialComponent.SUBSIDY,
              5_000,
            ),
          ],
        }),
    );
    const { service } = makeService([
      uberJuly,
      ...fantuanMonths,
      uberJune,
      uberAugust,
    ]);

    const report = await service.report({ storeStableId: STORE.storeStableId });

    expect(report.storeStableId).toBe(STORE.storeStableId);
    expect(report.timezone).toBe(STORE.timezone);
    const uber = report.providers.find(
      (provider) => provider.provider === AccountingFinancialProvider.UBER_EATS,
    );
    expect(uber).toEqual(
      expect.objectContaining({
        latestMonth: '2026-08',
        coverage: 'COMPLETE',
      }),
    );
    expect(uber?.periods.map((period) => period.month)).toEqual([
      '2026-08',
      '2026-07',
      '2026-06',
    ]);

    const august = uber?.periods[0];
    expect(august?.status).toBe('AVAILABLE');
    if (august?.status !== 'AVAILABLE') throw new Error('expected August');
    expect(august.salesCents).toBe(100_000);
    expect(august.commission).toEqual(
      expect.objectContaining({
        rawNames: ['Marketplace Fees'],
        costImpactCents: 20_000,
        shareOfSalesBps: 2_000,
      }),
    );
    expect(august.fees).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          rawName: 'Offers On Items',
          costImpactCents: 10_000,
          shareOfSalesBps: 1_000,
          kind: 'CHARGE',
        }),
        expect.objectContaining({
          rawName: 'Ad Credits',
          costImpactCents: -1_000,
          shareOfSalesBps: -100,
          kind: 'CREDIT',
        }),
      ]),
    );
    expect(august.fees.map((fee) => fee.rawName)).not.toContain(
      'Tax on Marketplace Fees',
    );
    expect(august.totalPlatformCostExTaxCents).toBe(29_000);
    expect(august.totalPlatformCostShareOfSalesBps).toBe(2_900);

    const fantuan = report.providers.find(
      (provider) => provider.provider === AccountingFinancialProvider.FANTUAN,
    );
    const fantuanAugust = fantuan?.periods[0];
    expect(fantuanAugust?.status).toBe('AVAILABLE');
    if (fantuanAugust?.status !== 'AVAILABLE') {
      throw new Error('expected Fantuan August');
    }
    expect(
      fantuanAugust.fees.find(
        (fee) => fee.rawName === 'Fantuan Subsidy for Promotion events',
      ),
    ).toEqual(
      expect.objectContaining({
        costImpactCents: -5_000,
        kind: 'CREDIT',
      }),
    );
  });

  it('uses confirmed human-review corrections instead of raw parser amounts', async () => {
    const august = statement({
      provider: AccountingFinancialProvider.UBER_EATS,
      month: '2026-08',
      lines: [
        line(
          'corrected_1',
          'Sales',
          AccountingFinancialComponent.SALES,
          90_000,
        ),
        line(
          'corrected_2',
          'Marketplace Fees',
          AccountingFinancialComponent.COMMISSION,
          -24_000,
        ),
      ],
      uberControlSalesCents: 120_000,
      corrections: [
        {
          sourceLineStableId: 'corrected_1',
          effectiveAmountCents: 120_000,
        },
      ],
    });
    const { service } = makeService([august]);

    const report = await service.report({ storeStableId: STORE.storeStableId });
    const period = report.providers[0]?.periods[0];
    expect(period?.status).toBe('AVAILABLE');
    if (period?.status !== 'AVAILABLE') throw new Error('expected period');
    expect(period.salesCents).toBe(120_000);
    expect(period.commission.shareOfSalesBps).toBe(2_000);
  });

  it('marks Uber months incomplete while non-zero Other Earnings still lacks semantic review', async () => {
    const september = statement({
      provider: AccountingFinancialProvider.UBER_EATS,
      month: '2026-09',
      lines: [
        line(
          'uber_sep_1',
          'Sales',
          AccountingFinancialComponent.SALES,
          378_508,
        ),
        line(
          'uber_sep_2',
          'Tax on Sales',
          AccountingFinancialComponent.SALES_TAX,
          49_216,
          AccountingFinancialTaxRole.SALES_TAX,
        ),
        line(
          'uber_sep_3',
          'Other Earnings',
          AccountingFinancialComponent.OTHER,
          -300,
        ),
        line(
          'uber_sep_4',
          'Tax on Other Earnings',
          AccountingFinancialComponent.OTHER,
          -39,
          AccountingFinancialTaxRole.SALES_TAX,
        ),
      ],
    });
    const { service } = makeService([september]);

    const report = await service.report({ storeStableId: STORE.storeStableId });
    const uber = report.providers.find(
      (provider) => provider.provider === AccountingFinancialProvider.UBER_EATS,
    );
    const period = uber?.periods[0];

    expect(period?.status).toBe('INCOMPLETE');
    if (period?.status !== 'INCOMPLETE') throw new Error('expected incomplete');
    expect(period.issues).toContain(
      'UBER_OTHER_EARNINGS_REQUIRES_SEMANTIC_REVIEW',
    );
  });

  it('includes reviewed Uber price adjustments in ex-tax sales', async () => {
    const september = statement({
      provider: AccountingFinancialProvider.UBER_EATS,
      month: '2026-09',
      lines: [
        line(
          'uber_sep_reviewed_1',
          'Sales',
          AccountingFinancialComponent.SALES,
          378_508,
        ),
        line(
          'uber_sep_reviewed_2',
          'Tax on Sales',
          AccountingFinancialComponent.SALES_TAX,
          49_216,
          AccountingFinancialTaxRole.SALES_TAX,
        ),
        line(
          'uber_sep_reviewed_3',
          'Other Earnings',
          AccountingFinancialComponent.OTHER,
          -300,
        ),
        line(
          'uber_sep_reviewed_4',
          'Tax on Other Earnings',
          AccountingFinancialComponent.OTHER,
          -39,
          AccountingFinancialTaxRole.SALES_TAX,
        ),
      ],
      corrections: [
        {
          sourceLineStableId: 'uber_sep_reviewed_3',
          effectiveComponent: AccountingFinancialComponent.SALES,
        },
        {
          sourceLineStableId: 'uber_sep_reviewed_4',
          effectiveComponent: AccountingFinancialComponent.SALES_TAX,
        },
      ],
    });
    const { service } = makeService([september]);

    const report = await service.report({ storeStableId: STORE.storeStableId });
    const uber = report.providers.find(
      (provider) => provider.provider === AccountingFinancialProvider.UBER_EATS,
    );
    const period = uber?.periods[0];

    expect(period?.status).toBe('AVAILABLE');
    if (period?.status !== 'AVAILABLE') throw new Error('expected available');
    expect(period.salesCents).toBe(378_208);
  });

  it('does not fall back to a confirmed older revision when the latest revision is pending', async () => {
    const july = statement({
      provider: AccountingFinancialProvider.UBER_EATS,
      month: '2026-07',
      lines: [
        line('july_1', 'Sales', AccountingFinancialComponent.SALES, 100_000),
      ],
    });
    const juneRevision1 = statement({
      provider: AccountingFinancialProvider.UBER_EATS,
      month: '2026-06',
      businessIdentityKey: 'uber:june',
      revision: 1,
      lines: [
        line('june_r1_1', 'Sales', AccountingFinancialComponent.SALES, 90_000),
      ],
    });
    const juneRevision2 = statement({
      provider: AccountingFinancialProvider.UBER_EATS,
      month: '2026-06',
      businessIdentityKey: 'uber:june',
      revision: 2,
      status: AccountingInboxStatus.PENDING_REVIEW,
      lines: [
        line('june_r2_1', 'Sales', AccountingFinancialComponent.SALES, 95_000),
      ],
    });
    const may = statement({
      provider: AccountingFinancialProvider.UBER_EATS,
      month: '2026-05',
      lines: [
        line('may_1', 'Sales', AccountingFinancialComponent.SALES, 80_000),
      ],
    });
    const { service } = makeService([juneRevision1, july, may, juneRevision2]);

    const report = await service.report({ storeStableId: STORE.storeStableId });
    const uber = report.providers[0];

    expect(uber.latestMonth).toBe('2026-07');
    expect(uber.coverage).toBe('PARTIAL');
    expect(uber.periods.map((period) => [period.month, period.status])).toEqual(
      [
        ['2026-07', 'AVAILABLE'],
        ['2026-06', 'MISSING'],
        ['2026-05', 'AVAILABLE'],
      ],
    );
  });

  it('fails visible when one provider has multiple confirmed statements for the same month', async () => {
    const first = statement({
      provider: AccountingFinancialProvider.FANTUAN,
      month: '2026-08',
      businessIdentityKey: 'fantuan:aug:first',
      lines: [
        line(
          'ambiguous_1',
          'Sales',
          AccountingFinancialComponent.SALES,
          100_000,
        ),
      ],
    });
    const second = statement({
      provider: AccountingFinancialProvider.FANTUAN,
      month: '2026-08',
      businessIdentityKey: 'fantuan:aug:second',
      lines: [
        line(
          'ambiguous_2',
          'Sales',
          AccountingFinancialComponent.SALES,
          110_000,
        ),
      ],
    });
    const { service } = makeService([first, second]);

    const report = await service.report({ storeStableId: STORE.storeStableId });
    const fantuan = report.providers.find(
      (provider) => provider.provider === AccountingFinancialProvider.FANTUAN,
    );

    expect(fantuan?.latestMonth).toBe('2026-08');
    expect(fantuan?.coverage).toBe('PARTIAL');
    expect(fantuan?.periods[0]).toEqual(
      expect.objectContaining({
        month: '2026-08',
        status: 'AMBIGUOUS',
      }),
    );
  });

  it('blocks a Fantuan month when statement control totals prove a missing platform fee', async () => {
    const august = statement({
      provider: AccountingFinancialProvider.FANTUAN,
      month: '2026-08',
      lines: [
        line('control_1', 'Sales', AccountingFinancialComponent.SALES, 686_782),
        {
          ...line(
            'control_2',
            'Item Subtotal',
            AccountingFinancialComponent.CONTROL_TOTAL,
            686_782,
          ),
          postingTreatment: AccountingFinancialPostingTreatment.CONTROL_TOTAL,
        },
        {
          ...line(
            'control_3',
            'Marketing and Fantuan Event Charges',
            AccountingFinancialComponent.CONTROL_TOTAL,
            -274_545,
          ),
          postingTreatment: AccountingFinancialPostingTreatment.CONTROL_TOTAL,
        },
        line(
          'control_4',
          'Discounts from Promotion events',
          AccountingFinancialComponent.PROMOTION,
          -170_973,
        ),
        line(
          'control_5',
          'Fantuan Subsidy for Promotion events',
          AccountingFinancialComponent.SUBSIDY,
          170_973,
        ),
        line(
          'control_6',
          'Commission',
          AccountingFinancialComponent.COMMISSION,
          -246_345,
        ),
        {
          ...line(
            'control_7',
            'Net Taxes',
            AccountingFinancialComponent.CONTROL_TOTAL,
            53_599,
          ),
          postingTreatment: AccountingFinancialPostingTreatment.CONTROL_TOTAL,
        },
        line(
          'control_8',
          'Net Sales GST/HST',
          AccountingFinancialComponent.SALES_TAX,
          89_287,
          AccountingFinancialTaxRole.SALES_TAX,
        ),
        line(
          'control_9',
          'Commission GST/HST',
          AccountingFinancialComponent.COMMISSION_TAX,
          -32_022,
          AccountingFinancialTaxRole.INPUT_TAX,
        ),
        {
          ...line(
            'control_10',
            'Total transfer amount',
            AccountingFinancialComponent.PAYOUT,
            465_836,
          ),
          postingTreatment: AccountingFinancialPostingTreatment.CONTROL_TOTAL,
        },
      ],
    });
    const { service } = makeService([august]);

    const report = await service.report({ storeStableId: STORE.storeStableId });
    const fantuan = report.providers.find(
      (provider) => provider.provider === AccountingFinancialProvider.FANTUAN,
    );
    const period = fantuan?.periods[0];
    expect(period?.status).toBe('INCOMPLETE');
    if (period?.status !== 'INCOMPLETE') throw new Error('expected incomplete');
    expect(period.issues).toContain(
      'PROVIDER_CONTROL_FANTUAN_MARKETING_CHARGES_MISMATCH',
    );
    expect(period.issues).toContain(
      'PROVIDER_CONTROL_FANTUAN_NET_TAXES_MISMATCH',
    );
  });

  it('accepts the Fantuan month once Marketing Fee and its tax reconcile the statement controls', async () => {
    const august = statement({
      provider: AccountingFinancialProvider.FANTUAN,
      month: '2026-08',
      lines: [
        line(
          'complete_1',
          'Sales',
          AccountingFinancialComponent.SALES,
          686_782,
        ),
        {
          ...line(
            'complete_2',
            'Item Subtotal',
            AccountingFinancialComponent.CONTROL_TOTAL,
            686_782,
          ),
          postingTreatment: AccountingFinancialPostingTreatment.CONTROL_TOTAL,
        },
        {
          ...line(
            'complete_3',
            'Marketing and Fantuan Event Charges',
            AccountingFinancialComponent.CONTROL_TOTAL,
            -274_545,
          ),
          postingTreatment: AccountingFinancialPostingTreatment.CONTROL_TOTAL,
        },
        line(
          'complete_4',
          'Discounts from Promotion events',
          AccountingFinancialComponent.PROMOTION,
          -170_973,
        ),
        line(
          'complete_5',
          'Fantuan Subsidy for Promotion events',
          AccountingFinancialComponent.SUBSIDY,
          170_973,
        ),
        line(
          'complete_6',
          'Marketing Fee',
          AccountingFinancialComponent.ADVERTISING,
          -28_200,
        ),
        line(
          'complete_7',
          'Commission',
          AccountingFinancialComponent.COMMISSION,
          -246_345,
        ),
        {
          ...line(
            'complete_8',
            'Net Taxes',
            AccountingFinancialComponent.CONTROL_TOTAL,
            53_599,
          ),
          postingTreatment: AccountingFinancialPostingTreatment.CONTROL_TOTAL,
        },
        line(
          'complete_9',
          'Net Sales GST/HST',
          AccountingFinancialComponent.SALES_TAX,
          89_287,
          AccountingFinancialTaxRole.SALES_TAX,
        ),
        line(
          'complete_10',
          'Marketing Fee GST/HST',
          AccountingFinancialComponent.ADVERTISING_TAX,
          -3_666,
          AccountingFinancialTaxRole.INPUT_TAX,
        ),
        line(
          'complete_11',
          'Commission GST/HST',
          AccountingFinancialComponent.COMMISSION_TAX,
          -32_022,
          AccountingFinancialTaxRole.INPUT_TAX,
        ),
        {
          ...line(
            'complete_12',
            'Total transfer amount',
            AccountingFinancialComponent.PAYOUT,
            465_836,
          ),
          postingTreatment: AccountingFinancialPostingTreatment.CONTROL_TOTAL,
        },
      ],
    });
    const { service } = makeService([august]);

    const report = await service.report({ storeStableId: STORE.storeStableId });
    const fantuan = report.providers.find(
      (provider) => provider.provider === AccountingFinancialProvider.FANTUAN,
    );
    const period = fantuan?.periods[0];
    expect(period?.status).toBe('AVAILABLE');
    if (period?.status !== 'AVAILABLE') throw new Error('expected period');
    expect(period.totalPlatformCostExTaxCents).toBe(274_545);
    expect(period.fees.find((fee) => fee.rawName === 'Marketing Fee')).toEqual(
      expect.objectContaining({
        costImpactCents: 28_200,
        kind: 'CHARGE',
      }),
    );
  });

  it('returns null percentages when ex-tax sales are zero', async () => {
    const august = statement({
      provider: AccountingFinancialProvider.FANTUAN,
      month: '2026-08',
      lines: [
        line('zero_1', 'Sales', AccountingFinancialComponent.SALES, 0),
        line(
          'zero_2',
          'Commission',
          AccountingFinancialComponent.COMMISSION,
          -10_000,
        ),
      ],
    });
    const { service } = makeService([august]);

    const report = await service.report({ storeStableId: STORE.storeStableId });
    const fantuan = report.providers.find(
      (provider) => provider.provider === AccountingFinancialProvider.FANTUAN,
    );
    const period = fantuan?.periods[0];
    expect(period?.status).toBe('AVAILABLE');
    if (period?.status !== 'AVAILABLE') throw new Error('expected period');
    expect(period.commission.shareOfSalesBps).toBeNull();
    expect(period.totalPlatformCostShareOfSalesBps).toBeNull();
  });
});
