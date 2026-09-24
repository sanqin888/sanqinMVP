import {
  AccountingFinancialComponent,
  AccountingFinancialDocumentType,
  AccountingFinancialPostingTreatment,
  AccountingFinancialProvider,
} from '@prisma/client';
import {
  buildProviderSettlementDocumentPlan,
  buildUberPreCutoverOrderReversalDraft,
  PROVIDER_SETTLEMENT_ACCOUNT_IDS,
  PROVIDER_SETTLEMENT_CATEGORY_IDS,
  resolveProviderSalesAuthority,
} from './accounting-provider-settlement.policy';
import { FANTUAN_ADJUSTMENT_RAW_CODES } from './accounting-fantuan-adjustment-detail.contract';
import { CLOVER_STATEMENT_RAW_CODES } from './accounting-clover-statement.contract';

type SettlementTestLine = {
  lineStableId: string;
  lineNo: number;
  rawCode?: string;
  rawName: string;
  component: AccountingFinancialComponent;
  postingTreatment: AccountingFinancialPostingTreatment;
  amountCents: number;
};

const sumUberTestLines = (
  lines: SettlementTestLine[],
  rawNames: readonly string[],
) => {
  const names = new Set(rawNames.map((name) => name.toLowerCase()));
  return lines.reduce(
    (sum, line) =>
      names.has(line.rawName.toLowerCase()) ? sum + line.amountCents : sum,
    0,
  );
};

const withUberControlTotals = (
  inputLines: SettlementTestLine[],
): SettlementTestLine[] => {
  const lines = [...inputLines];
  const appendControl = (
    rawName: string,
    componentRawNames: readonly string[],
  ) => {
    if (
      lines.some((line) => line.rawName.toLowerCase() === rawName.toLowerCase())
    ) {
      return;
    }
    lines.push({
      lineStableId: `line-control-${rawName
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, '-')}`,
      lineNo: lines.length + 1,
      rawName,
      component: AccountingFinancialComponent.CONTROL_TOTAL,
      postingTreatment: AccountingFinancialPostingTreatment.CONTROL_TOTAL,
      amountCents: sumUberTestLines(lines, componentRawNames),
    });
  };

  appendControl('Total Earnings', [
    'Sales',
    'Tax on Sales',
    'Tips',
    'Container Fees',
    'Tax on Container Fees',
    'Other Earnings',
    'Tax on Other Earnings',
  ]);
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

const uberDocument = (lines: SettlementTestLine[]) => ({
  documentStableId: 'provider_doc_1',
  revision: 1,
  provider: AccountingFinancialProvider.UBER_EATS,
  documentType: AccountingFinancialDocumentType.STATEMENT,
  storeStableId: '4750_Yonge_Street',
  periodStart: '2026-08-01',
  periodEnd: '2026-08-31',
  currency: 'CAD',
  lines: withUberControlTotals(lines),
});

// Read-only production evidence B4842290 came from Poppler text shaped like:
// Sales (84 Orders) / Tax on Sales / $2,603.36 / $338.48.
// The legacy label-followed-by-next-token parser therefore duplicated Sales into Tax.
const observedJulyUberLayoutLossLines = (): SettlementTestLine[] => {
  const rows: Array<
    [
      string,
      AccountingFinancialComponent,
      AccountingFinancialPostingTreatment,
      number,
    ]
  > = [
    [
      'Sales',
      AccountingFinancialComponent.SALES,
      AccountingFinancialPostingTreatment.POSTABLE,
      260336,
    ],
    [
      'Tax on Sales',
      AccountingFinancialComponent.SALES_TAX,
      AccountingFinancialPostingTreatment.POSTABLE,
      260336,
    ],
    [
      'Tips',
      AccountingFinancialComponent.TIP,
      AccountingFinancialPostingTreatment.POSTABLE,
      0,
    ],
    [
      'Container Fees',
      AccountingFinancialComponent.OTHER,
      AccountingFinancialPostingTreatment.POSTABLE,
      0,
    ],
    [
      'Tax on Container Fees',
      AccountingFinancialComponent.OTHER,
      AccountingFinancialPostingTreatment.POSTABLE,
      0,
    ],
    [
      'Other Earnings',
      AccountingFinancialComponent.OTHER,
      AccountingFinancialPostingTreatment.POSTABLE,
      0,
    ],
    [
      'Tax on Other Earnings',
      AccountingFinancialComponent.OTHER,
      AccountingFinancialPostingTreatment.POSTABLE,
      0,
    ],
    [
      'Total Earnings',
      AccountingFinancialComponent.CONTROL_TOTAL,
      AccountingFinancialPostingTreatment.CONTROL_TOTAL,
      294184,
    ],
    [
      'Marketplace Fees',
      AccountingFinancialComponent.COMMISSION,
      AccountingFinancialPostingTreatment.POSTABLE,
      -61088,
    ],
    [
      'Tax on Marketplace Fees',
      AccountingFinancialComponent.COMMISSION_TAX,
      AccountingFinancialPostingTreatment.POSTABLE,
      -7941,
    ],
    [
      'Other Charges',
      AccountingFinancialComponent.PLATFORM_OTHER_FEE,
      AccountingFinancialPostingTreatment.POSTABLE,
      -1,
    ],
    [
      'Tax On Other Charges',
      AccountingFinancialComponent.PLATFORM_OTHER_FEE_TAX,
      AccountingFinancialPostingTreatment.POSTABLE,
      0,
    ],
    [
      'Total Uber Fees',
      AccountingFinancialComponent.CONTROL_TOTAL,
      AccountingFinancialPostingTreatment.CONTROL_TOTAL,
      -69030,
    ],
    [
      'Offers On Items',
      AccountingFinancialComponent.PROMOTION,
      AccountingFinancialPostingTreatment.POSTABLE,
      -51779,
    ],
    [
      'Marketing Adjustment',
      AccountingFinancialComponent.ADJUSTMENT,
      AccountingFinancialPostingTreatment.POSTABLE,
      0,
    ],
    [
      'Other Offer Charges',
      AccountingFinancialComponent.PROMOTION,
      AccountingFinancialPostingTreatment.POSTABLE,
      0,
    ],
    [
      'Tax on offer spends',
      AccountingFinancialComponent.SALES_TAX,
      AccountingFinancialPostingTreatment.POSTABLE,
      -6729,
    ],
    [
      'Ad Spends',
      AccountingFinancialComponent.ADVERTISING,
      AccountingFinancialPostingTreatment.POSTABLE,
      -25753,
    ],
    [
      'Ad Credits',
      AccountingFinancialComponent.ADVERTISING_CREDIT,
      AccountingFinancialPostingTreatment.POSTABLE,
      4999,
    ],
    [
      'Tax on Net Ad Spends',
      AccountingFinancialComponent.ADVERTISING_TAX,
      AccountingFinancialPostingTreatment.POSTABLE,
      -2698,
    ],
    [
      'Total Marketing Spends',
      AccountingFinancialComponent.CONTROL_TOTAL,
      AccountingFinancialPostingTreatment.CONTROL_TOTAL,
      -81960,
    ],
    [
      'Net Chargeback Amount',
      AccountingFinancialComponent.CHARGEBACK,
      AccountingFinancialPostingTreatment.POSTABLE,
      0,
    ],
    [
      'Net Tax On Chargeback',
      AccountingFinancialComponent.CHARGEBACK_TAX,
      AccountingFinancialPostingTreatment.POSTABLE,
      0,
    ],
    [
      'Marketplace Facilitator Tax',
      AccountingFinancialComponent.OTHER,
      AccountingFinancialPostingTreatment.RECONCILIATION_ONLY,
      0,
    ],
    [
      'Adjustments',
      AccountingFinancialComponent.ADJUSTMENT,
      AccountingFinancialPostingTreatment.POSTABLE,
      0,
    ],
    [
      'Tax On Adjustments',
      AccountingFinancialComponent.ADJUSTMENT,
      AccountingFinancialPostingTreatment.POSTABLE,
      0,
    ],
    [
      'Total Amendments',
      AccountingFinancialComponent.CONTROL_TOTAL,
      AccountingFinancialPostingTreatment.CONTROL_TOTAL,
      0,
    ],
    [
      'Net Total',
      AccountingFinancialComponent.CONTROL_TOTAL,
      AccountingFinancialPostingTreatment.CONTROL_TOTAL,
      143194,
    ],
  ];

  return rows.map(
    ([rawName, component, postingTreatment, amountCents], index) => ({
      lineStableId: `line-july-${index + 1}`,
      lineNo: index + 1,
      rawName,
      component,
      postingTreatment,
      amountCents,
    }),
  );
};

describe('Accounting provider settlement shadow policy', () => {
  it('uses statement authority before live Uber Order cutover and maps tip as non-taxable store revenue', () => {
    const authority = resolveProviderSalesAuthority({
      provider: AccountingFinancialProvider.UBER_EATS,
      documentType: AccountingFinancialDocumentType.STATEMENT,
      periodStart: '2026-08-01',
      periodEnd: '2026-08-31',
      liveOrderFactCutoverAt: null,
      timezone: 'America/Toronto',
    });
    expect(authority).toBe('STATEMENT_AUTHORITATIVE');

    const plan = buildProviderSettlementDocumentPlan({
      document: uberDocument([
        {
          lineStableId: 'line-sales',
          lineNo: 1,
          rawName: 'Sales',
          component: AccountingFinancialComponent.SALES,
          postingTreatment: AccountingFinancialPostingTreatment.POSTABLE,
          amountCents: 10000,
        },
        {
          lineStableId: 'line-tax',
          lineNo: 2,
          rawName: 'Tax on Sales',
          component: AccountingFinancialComponent.SALES_TAX,
          postingTreatment: AccountingFinancialPostingTreatment.POSTABLE,
          amountCents: 1300,
        },
        {
          lineStableId: 'line-tip',
          lineNo: 3,
          rawName: 'Tips',
          component: AccountingFinancialComponent.TIP,
          postingTreatment: AccountingFinancialPostingTreatment.POSTABLE,
          amountCents: 500,
        },
        {
          lineStableId: 'line-commission',
          lineNo: 4,
          rawName: 'Marketplace Fees',
          component: AccountingFinancialComponent.COMMISSION,
          postingTreatment: AccountingFinancialPostingTreatment.POSTABLE,
          amountCents: -2500,
        },
        {
          lineStableId: 'line-promo',
          lineNo: 5,
          rawName: 'Offers On Items',
          component: AccountingFinancialComponent.PROMOTION,
          postingTreatment: AccountingFinancialPostingTreatment.POSTABLE,
          amountCents: -1200,
        },
        {
          lineStableId: 'line-subsidy',
          lineNo: 6,
          rawName: 'Provider Subsidy',
          component: AccountingFinancialComponent.SUBSIDY,
          postingTreatment: AccountingFinancialPostingTreatment.POSTABLE,
          amountCents: 300,
        },
      ]),
      salesAuthority: authority,
      occurredAt: new Date('2026-09-01T03:59:59.999Z'),
    });

    expect(plan.status).toBe('READY');
    expect(
      plan.decisions.find(
        (line) => line.component === AccountingFinancialComponent.TIP,
      ),
    ).toEqual(
      expect.objectContaining({
        disposition: 'POSTABLE',
        reason: 'NON_TAXABLE_STORE_TIP_REVENUE',
        targetAccountStableId: PROVIDER_SETTLEMENT_ACCOUNT_IDS.tipRevenue,
      }),
    );
    expect(
      plan.decisions.find(
        (line) => line.component === AccountingFinancialComponent.SUBSIDY,
      ),
    ).toEqual(
      expect.objectContaining({
        disposition: 'POSTABLE',
        reason: 'CONTRA_PROMOTION_EXPENSE',
        targetAccountStableId:
          PROVIDER_SETTLEMENT_ACCOUNT_IDS.platformPromotionExpense,
      }),
    );
    expect(plan.debitCents).toBe(plan.creditCents);
    expect(plan.requiredAccountStableIds).toContain(
      PROVIDER_SETTLEMENT_ACCOUNT_IDS.tipRevenue,
    );
  });

  it('fails closed when the observed July Uber layout loss breaks source control totals', () => {
    const plan = buildProviderSettlementDocumentPlan({
      document: uberDocument(observedJulyUberLayoutLossLines()),
      salesAuthority: 'STATEMENT_AUTHORITATIVE',
      occurredAt: new Date('2026-08-01T03:59:59.999Z'),
    });

    expect(plan.status).toBe('BLOCKED');
    expect(plan.blockReasons).toContain('PROVIDER_CONTROL_TOTAL_MISMATCH');
    expect(plan.draftJournal).toBeNull();
    expect(plan.debitCents).toBe(0);
    expect(plan.creditCents).toBe(0);
    expect(
      plan.controlTotalChecks.find(
        (check) => check.key === 'UBER_TOTAL_EARNINGS',
      ),
    ).toEqual(
      expect.objectContaining({
        status: 'MISMATCH',
        expectedCents: 294184,
        calculatedCents: 520672,
        deltaCents: 226488,
      }),
    );
    expect(
      plan.controlTotalChecks.find((check) => check.key === 'UBER_NET_TOTAL'),
    ).toEqual(
      expect.objectContaining({
        status: 'MATCHED',
        expectedCents: 143194,
        calculatedCents: 143194,
        deltaCents: 0,
      }),
    );
  });

  it('fails closed when an Uber statement is missing required control totals', () => {
    const plan = buildProviderSettlementDocumentPlan({
      document: {
        ...uberDocument([]),
        lines: [
          {
            lineStableId: 'line-sales-only',
            lineNo: 1,
            rawName: 'Sales',
            component: AccountingFinancialComponent.SALES,
            postingTreatment: AccountingFinancialPostingTreatment.POSTABLE,
            amountCents: 1000,
          },
        ],
      },
      salesAuthority: 'STATEMENT_AUTHORITATIVE',
      occurredAt: new Date('2026-09-01T03:59:59.999Z'),
    });

    expect(plan.status).toBe('BLOCKED');
    expect(plan.blockReasons).toContain('PROVIDER_CONTROL_TOTAL_INCOMPLETE');
    expect(plan.controlTotalChecks).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          key: 'UBER_NET_TOTAL',
          status: 'INCOMPLETE',
          expectedCents: null,
        }),
      ]),
    );
  });

  it('honors parser reconciliation-only treatment for Clover tips', () => {
    const plan = buildProviderSettlementDocumentPlan({
      document: {
        documentStableId: 'clover_closeout_1',
        revision: 1,
        provider: AccountingFinancialProvider.CLOVER,
        documentType: AccountingFinancialDocumentType.BATCH_CONTROL,
        storeStableId: '4750_Yonge_Street',
        periodStart: '2026-09-14',
        periodEnd: '2026-09-14',
        currency: 'CAD',
        lines: [
          {
            lineStableId: 'line-clover-tip',
            lineNo: 1,
            rawName: 'Tips',
            component: AccountingFinancialComponent.TIP,
            postingTreatment:
              AccountingFinancialPostingTreatment.RECONCILIATION_ONLY,
            amountCents: 500,
          },
        ],
      },
      salesAuthority: 'RECONCILIATION_ONLY',
      occurredAt: new Date('2026-09-15T03:59:59.999Z'),
    });

    expect(plan.status).toBe('NOOP');
    expect(plan.requiredAccountStableIds).toEqual([]);
    expect(plan.decisions[0]).toEqual(
      expect.objectContaining({
        disposition: 'RECONCILIATION_ONLY',
        reason: 'PROVIDER_RECONCILIATION_ONLY',
        targetAccountStableId: null,
      }),
    );
  });

  it('maps Clover monthly equipment fees to software subscription and reconciles fee detail', () => {
    const plan = buildProviderSettlementDocumentPlan({
      document: {
        documentStableId: 'clover_statement_june_2026',
        revision: 1,
        provider: AccountingFinancialProvider.CLOVER,
        documentType: AccountingFinancialDocumentType.STATEMENT,
        storeStableId: '4750_Yonge_Street',
        periodStart: '2026-06-01',
        periodEnd: '2026-06-30',
        currency: 'CAD',
        lines: [
          {
            lineStableId: 'line-service-charges',
            lineNo: 1,
            rawName: 'Service Charges',
            component: AccountingFinancialComponent.PROCESSING_FEE,
            postingTreatment: AccountingFinancialPostingTreatment.POSTABLE,
            amountCents: -6264,
          },
          {
            lineStableId: 'line-fees-control',
            lineNo: 2,
            rawCode: CLOVER_STATEMENT_RAW_CODES.FEES_TOTAL,
            rawName: 'Fees',
            component: AccountingFinancialComponent.CONTROL_TOTAL,
            postingTreatment: AccountingFinancialPostingTreatment.CONTROL_TOTAL,
            amountCents: -3575,
          },
          {
            lineStableId: 'line-equipment',
            lineNo: 3,
            rawCode: CLOVER_STATEMENT_RAW_CODES.MONTHLY_EQUIPMENT_BILL,
            rawName: 'Monthly Equipment Bill',
            component: AccountingFinancialComponent.PLATFORM_OTHER_FEE,
            postingTreatment: AccountingFinancialPostingTreatment.POSTABLE,
            amountCents: -3000,
          },
          {
            lineStableId: 'line-equipment-hst',
            lineNo: 4,
            rawCode: CLOVER_STATEMENT_RAW_CODES.MONTHLY_EQUIPMENT_BILL_HST,
            rawName: 'Monthly Equipment Bill HST',
            component: AccountingFinancialComponent.PLATFORM_OTHER_FEE_TAX,
            postingTreatment: AccountingFinancialPostingTreatment.POSTABLE,
            amountCents: -390,
          },
          {
            lineStableId: 'line-network',
            lineNo: 5,
            rawCode: CLOVER_STATEMENT_RAW_CODES.NETWORK_FEES,
            rawName: 'Other Card/Network Fees',
            component: AccountingFinancialComponent.PROCESSING_FEE,
            postingTreatment: AccountingFinancialPostingTreatment.POSTABLE,
            amountCents: -185,
          },
        ],
      },
      salesAuthority: 'RECONCILIATION_ONLY',
      occurredAt: new Date('2026-06-30T03:59:59.999Z'),
    });

    expect(plan.status).toBe('READY');
    expect(plan.controlTotalChecks).toEqual([
      expect.objectContaining({
        key: 'CLOVER_FEES_DETAIL',
        status: 'MATCHED',
        expectedCents: -3575,
        calculatedCents: -3575,
        deltaCents: 0,
      }),
    ]);
    expect(plan.decisions).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          lineStableId: 'line-equipment',
          disposition: 'POSTABLE',
          targetAccountStableId:
            PROVIDER_SETTLEMENT_ACCOUNT_IDS.generalOperatingExpense,
          targetCategoryStableId:
            PROVIDER_SETTLEMENT_CATEGORY_IDS.cloverMonthlyEquipment,
        }),
        expect.objectContaining({
          lineStableId: 'line-equipment-hst',
          targetAccountStableId: PROVIDER_SETTLEMENT_ACCOUNT_IDS.hstRecoverable,
          targetCategoryStableId: null,
        }),
        expect.objectContaining({
          lineStableId: 'line-network',
          targetAccountStableId:
            PROVIDER_SETTLEMENT_ACCOUNT_IDS.paymentProcessingFeeExpense,
          targetCategoryStableId: null,
        }),
      ]),
    );
    expect(plan.debitCents).toBe(9839);
    expect(plan.creditCents).toBe(9839);
    expect(plan.draftJournal?.lines).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          accountStableId:
            PROVIDER_SETTLEMENT_ACCOUNT_IDS.generalOperatingExpense,
          categoryStableId:
            PROVIDER_SETTLEMENT_CATEGORY_IDS.cloverMonthlyEquipment,
          debitCents: 3000,
          creditCents: 0,
        }),
        expect.objectContaining({
          accountStableId: PROVIDER_SETTLEMENT_ACCOUNT_IDS.hstRecoverable,
          categoryStableId: null,
          debitCents: 390,
          creditCents: 0,
        }),
        expect.objectContaining({
          accountStableId:
            PROVIDER_SETTLEMENT_ACCOUNT_IDS.paymentProcessingFeeExpense,
          categoryStableId: null,
          debitCents: 6449,
          creditCents: 0,
        }),
        expect.objectContaining({
          accountStableId: PROVIDER_SETTLEMENT_ACCOUNT_IDS.cloverPending,
          categoryStableId: null,
          debitCents: 0,
          creditCents: 9839,
        }),
      ]),
    );
  });

  it('fails closed when Clover fee detail does not reconcile to the statement Fees control', () => {
    const plan = buildProviderSettlementDocumentPlan({
      document: {
        documentStableId: 'clover_statement_mismatch',
        revision: 1,
        provider: AccountingFinancialProvider.CLOVER,
        documentType: AccountingFinancialDocumentType.STATEMENT,
        storeStableId: '4750_Yonge_Street',
        periodStart: '2026-06-01',
        periodEnd: '2026-06-30',
        currency: 'CAD',
        lines: [
          {
            lineStableId: 'line-fees-control',
            lineNo: 1,
            rawCode: CLOVER_STATEMENT_RAW_CODES.FEES_TOTAL,
            rawName: 'Fees',
            component: AccountingFinancialComponent.CONTROL_TOTAL,
            postingTreatment: AccountingFinancialPostingTreatment.CONTROL_TOTAL,
            amountCents: -3575,
          },
          {
            lineStableId: 'line-equipment',
            lineNo: 2,
            rawCode: CLOVER_STATEMENT_RAW_CODES.MONTHLY_EQUIPMENT_BILL,
            rawName: 'Monthly Equipment Bill',
            component: AccountingFinancialComponent.PLATFORM_OTHER_FEE,
            postingTreatment: AccountingFinancialPostingTreatment.POSTABLE,
            amountCents: -3000,
          },
          {
            lineStableId: 'line-equipment-hst',
            lineNo: 3,
            rawCode: CLOVER_STATEMENT_RAW_CODES.MONTHLY_EQUIPMENT_BILL_HST,
            rawName: 'Monthly Equipment Bill HST',
            component: AccountingFinancialComponent.PLATFORM_OTHER_FEE_TAX,
            postingTreatment: AccountingFinancialPostingTreatment.POSTABLE,
            amountCents: -390,
          },
          {
            lineStableId: 'line-network',
            lineNo: 4,
            rawCode: CLOVER_STATEMENT_RAW_CODES.NETWORK_FEES,
            rawName: 'Other Card/Network Fees',
            component: AccountingFinancialComponent.PROCESSING_FEE,
            postingTreatment: AccountingFinancialPostingTreatment.POSTABLE,
            amountCents: -175,
          },
        ],
      },
      salesAuthority: 'RECONCILIATION_ONLY',
      occurredAt: new Date('2026-06-30T03:59:59.999Z'),
    });

    expect(plan.status).toBe('BLOCKED');
    expect(plan.blockReasons).toContain('PROVIDER_CONTROL_TOTAL_MISMATCH');
    expect(plan.controlTotalChecks).toEqual([
      expect.objectContaining({
        key: 'CLOVER_FEES_DETAIL',
        status: 'MISMATCH',
        expectedCents: -3575,
        calculatedCents: -3565,
        deltaCents: 10,
      }),
    ]);
    expect(plan.draftJournal).toBeNull();
  });

  it('fails closed when Clover fee detail contains an unclassified description', () => {
    const plan = buildProviderSettlementDocumentPlan({
      document: {
        documentStableId: 'clover_statement_unknown_fee',
        revision: 1,
        provider: AccountingFinancialProvider.CLOVER,
        documentType: AccountingFinancialDocumentType.STATEMENT,
        storeStableId: '4750_Yonge_Street',
        periodStart: '2026-06-01',
        periodEnd: '2026-06-30',
        currency: 'CAD',
        lines: [
          {
            lineStableId: 'line-fees-control',
            lineNo: 1,
            rawCode: CLOVER_STATEMENT_RAW_CODES.FEES_TOTAL,
            rawName: 'Fees',
            component: AccountingFinancialComponent.CONTROL_TOTAL,
            postingTreatment: AccountingFinancialPostingTreatment.CONTROL_TOTAL,
            amountCents: -100,
          },
          {
            lineStableId: 'line-unknown-fee',
            lineNo: 2,
            rawCode: CLOVER_STATEMENT_RAW_CODES.UNCLASSIFIED_FEES,
            rawName: 'UNKNOWN CLOVER FEE',
            component: AccountingFinancialComponent.OTHER,
            postingTreatment: AccountingFinancialPostingTreatment.UNCLASSIFIED,
            amountCents: -100,
          },
        ],
      },
      salesAuthority: 'RECONCILIATION_ONLY',
      occurredAt: new Date('2026-06-30T03:59:59.999Z'),
    });

    expect(plan.controlTotalChecks).toEqual([
      expect.objectContaining({
        key: 'CLOVER_FEES_DETAIL',
        status: 'MATCHED',
        deltaCents: 0,
      }),
    ]);
    expect(plan.status).toBe('BLOCKED');
    expect(plan.blockReasons).toContain('UNCLASSIFIED_PROVIDER_COMPONENT');
    expect(plan.draftJournal).toBeNull();
  });

  it('keeps Uber sales and sales tax reconciliation-only after live Order cutover while fees remain postable', () => {
    const authority = resolveProviderSalesAuthority({
      provider: AccountingFinancialProvider.UBER_EATS,
      documentType: AccountingFinancialDocumentType.STATEMENT,
      periodStart: '2026-10-01',
      periodEnd: '2026-10-31',
      liveOrderFactCutoverAt: new Date('2026-09-01T04:00:00.000Z'),
      timezone: 'America/Toronto',
    });
    expect(authority).toBe('ORDER_AUTHORITATIVE');

    const plan = buildProviderSettlementDocumentPlan({
      document: uberDocument([
        {
          lineStableId: 'line-sales',
          lineNo: 1,
          rawName: 'Sales',
          component: AccountingFinancialComponent.SALES,
          postingTreatment: AccountingFinancialPostingTreatment.POSTABLE,
          amountCents: 10000,
        },
        {
          lineStableId: 'line-tax',
          lineNo: 2,
          rawName: 'Tax on Sales',
          component: AccountingFinancialComponent.SALES_TAX,
          postingTreatment: AccountingFinancialPostingTreatment.POSTABLE,
          amountCents: 1300,
        },
        {
          lineStableId: 'line-commission',
          lineNo: 3,
          rawName: 'Marketplace Fees',
          component: AccountingFinancialComponent.COMMISSION,
          postingTreatment: AccountingFinancialPostingTreatment.POSTABLE,
          amountCents: -2500,
        },
      ]),
      salesAuthority: authority,
      occurredAt: new Date('2026-11-01T03:59:59.999Z'),
    });

    expect(plan.status).toBe('READY');
    expect(
      plan.decisions.filter(
        (line) => line.disposition === 'RECONCILIATION_ONLY',
      ),
    ).toHaveLength(2);
    expect(
      plan.decisions.find(
        (line) => line.component === AccountingFinancialComponent.COMMISSION,
      ),
    ).toEqual(expect.objectContaining({ disposition: 'POSTABLE' }));
  });

  it('blocks sales posting for a provider document that crosses a non-midnight live cutover', () => {
    const authority = resolveProviderSalesAuthority({
      provider: AccountingFinancialProvider.UBER_EATS,
      documentType: AccountingFinancialDocumentType.STATEMENT,
      periodStart: '2026-09-01',
      periodEnd: '2026-09-30',
      liveOrderFactCutoverAt: new Date('2026-09-15T16:30:00.000Z'),
      timezone: 'America/Toronto',
    });
    expect(authority).toBe('SPLIT_PERIOD_BLOCKED');

    const plan = buildProviderSettlementDocumentPlan({
      document: uberDocument([
        {
          lineStableId: 'line-sales',
          lineNo: 1,
          rawName: 'Sales',
          component: AccountingFinancialComponent.SALES,
          postingTreatment: AccountingFinancialPostingTreatment.POSTABLE,
          amountCents: 10000,
        },
      ]),
      salesAuthority: authority,
      occurredAt: new Date('2026-10-01T03:59:59.999Z'),
    });
    expect(plan.status).toBe('BLOCKED');
    expect(plan.blockReasons).toContain('DOCUMENT_CROSSES_LIVE_ORDER_CUTOVER');
  });

  it('maps the observed June Uber settlement components without swallowing unknown provider semantics', () => {
    const plan = buildProviderSettlementDocumentPlan({
      document: uberDocument([
        {
          lineStableId: 'line-sales',
          lineNo: 1,
          rawName: 'Sales',
          component: AccountingFinancialComponent.SALES,
          postingTreatment: AccountingFinancialPostingTreatment.POSTABLE,
          amountCents: 267167,
        },
        {
          lineStableId: 'line-sales-tax',
          lineNo: 2,
          rawName: 'Tax on Sales',
          component: AccountingFinancialComponent.SALES_TAX,
          postingTreatment: AccountingFinancialPostingTreatment.POSTABLE,
          amountCents: 34735,
        },
        {
          lineStableId: 'line-commission',
          lineNo: 3,
          rawName: 'Marketplace Fees',
          component: AccountingFinancialComponent.COMMISSION,
          postingTreatment: AccountingFinancialPostingTreatment.POSTABLE,
          amountCents: -61912,
        },
        {
          lineStableId: 'line-commission-tax',
          lineNo: 4,
          rawName: 'Tax on Marketplace Fees',
          component: AccountingFinancialComponent.COMMISSION_TAX,
          postingTreatment: AccountingFinancialPostingTreatment.POSTABLE,
          amountCents: -8047,
        },
        {
          lineStableId: 'line-other-fee',
          lineNo: 5,
          rawName: 'Other Charges',
          component: AccountingFinancialComponent.PLATFORM_OTHER_FEE,
          postingTreatment: AccountingFinancialPostingTreatment.POSTABLE,
          amountCents: -2,
        },
        {
          lineStableId: 'line-promotion',
          lineNo: 6,
          rawName: 'Offers On Items',
          component: AccountingFinancialComponent.PROMOTION,
          postingTreatment: AccountingFinancialPostingTreatment.POSTABLE,
          amountCents: -58703,
        },
        {
          lineStableId: 'line-offer-tax',
          lineNo: 7,
          rawName: 'Tax on offer spends',
          component: AccountingFinancialComponent.SALES_TAX,
          postingTreatment: AccountingFinancialPostingTreatment.POSTABLE,
          amountCents: -7633,
        },
        {
          lineStableId: 'line-ad-spend',
          lineNo: 8,
          rawName: 'Ad Spends',
          component: AccountingFinancialComponent.ADVERTISING,
          postingTreatment: AccountingFinancialPostingTreatment.POSTABLE,
          amountCents: -42527,
        },
        {
          lineStableId: 'line-ad-credit',
          lineNo: 9,
          rawName: 'Ad Credits',
          component: AccountingFinancialComponent.ADVERTISING_CREDIT,
          postingTreatment: AccountingFinancialPostingTreatment.POSTABLE,
          amountCents: 4998,
        },
        {
          lineStableId: 'line-ad-tax',
          lineNo: 10,
          rawName: 'Tax on Net Ad Spends',
          component: AccountingFinancialComponent.ADVERTISING_TAX,
          postingTreatment: AccountingFinancialPostingTreatment.POSTABLE,
          amountCents: -4880,
        },
        {
          lineStableId: 'line-chargeback',
          lineNo: 11,
          rawName: 'Net Chargeback Amount',
          component: AccountingFinancialComponent.CHARGEBACK,
          postingTreatment: AccountingFinancialPostingTreatment.POSTABLE,
          amountCents: -806,
        },
        {
          lineStableId: 'line-chargeback-tax',
          lineNo: 12,
          rawName: 'Net Tax On Chargeback',
          component: AccountingFinancialComponent.CHARGEBACK_TAX,
          postingTreatment: AccountingFinancialPostingTreatment.POSTABLE,
          amountCents: -105,
        },
      ]),
      salesAuthority: 'STATEMENT_AUTHORITATIVE',
      occurredAt: new Date('2026-07-01T03:59:59.999Z'),
    });

    expect(plan.status).toBe('READY');
    expect(plan.blockReasons).toEqual([]);
    expect(plan.debitCents).toBe(294164);
    expect(plan.creditCents).toBe(294164);
    const journalLines = new Map(
      plan.draftJournal?.lines.map((line) => [line.accountStableId, line]) ??
        [],
    );
    expect(
      journalLines.get(PROVIDER_SETTLEMENT_ACCOUNT_IDS.uberPending),
    ).toEqual(expect.objectContaining({ debitCents: 122285, creditCents: 0 }));
    expect(
      journalLines.get(
        PROVIDER_SETTLEMENT_ACCOUNT_IDS.platformCommissionExpense,
      ),
    ).toEqual(expect.objectContaining({ debitCents: 61912, creditCents: 0 }));
    expect(
      journalLines.get(
        PROVIDER_SETTLEMENT_ACCOUNT_IDS.platformPromotionExpense,
      ),
    ).toEqual(expect.objectContaining({ debitCents: 58703, creditCents: 0 }));
    expect(
      journalLines.get(PROVIDER_SETTLEMENT_ACCOUNT_IDS.advertisingExpense),
    ).toEqual(expect.objectContaining({ debitCents: 37529, creditCents: 0 }));
    expect(
      journalLines.get(
        PROVIDER_SETTLEMENT_ACCOUNT_IDS.chargebackAdjustmentExpense,
      ),
    ).toEqual(expect.objectContaining({ debitCents: 806, creditCents: 0 }));
    expect(
      journalLines.get(PROVIDER_SETTLEMENT_ACCOUNT_IDS.generalOperatingExpense),
    ).toEqual(expect.objectContaining({ debitCents: 2, creditCents: 0 }));
    expect(
      journalLines.get(PROVIDER_SETTLEMENT_ACCOUNT_IDS.hstRecoverable),
    ).toEqual(expect.objectContaining({ debitCents: 12927, creditCents: 0 }));
    expect(
      journalLines.get(PROVIDER_SETTLEMENT_ACCOUNT_IDS.salesRevenue),
    ).toEqual(expect.objectContaining({ debitCents: 0, creditCents: 267167 }));
    expect(
      journalLines.get(PROVIDER_SETTLEMENT_ACCOUNT_IDS.hstPayable),
    ).toEqual(expect.objectContaining({ debitCents: 0, creditCents: 26997 }));
  });

  it('maps validated Fantuan adjustment detail compensation and deduction into distinct accounts', () => {
    const plan = buildProviderSettlementDocumentPlan({
      document: {
        documentStableId: 'fantuan_aug_statement',
        revision: 1,
        provider: AccountingFinancialProvider.FANTUAN,
        documentType: AccountingFinancialDocumentType.STATEMENT,
        storeStableId: '4750_Yonge_Street',
        periodStart: '2026-08-01',
        periodEnd: '2026-08-31',
        currency: 'CAD',
        lines: [
          {
            lineStableId: 'detail-compensation',
            lineNo: 1,
            rawCode: FANTUAN_ADJUSTMENT_RAW_CODES.COMPENSATION,
            rawName: 'Compensation',
            component: AccountingFinancialComponent.ADJUSTMENT,
            postingTreatment: AccountingFinancialPostingTreatment.POSTABLE,
            amountCents: 3354,
          },
          {
            lineStableId: 'detail-deduction',
            lineNo: 2,
            rawCode: FANTUAN_ADJUSTMENT_RAW_CODES.DEDUCTION,
            rawName: 'Deduction',
            component: AccountingFinancialComponent.ADJUSTMENT,
            postingTreatment: AccountingFinancialPostingTreatment.POSTABLE,
            amountCents: -660,
          },
        ],
      },
      salesAuthority: 'STATEMENT_AUTHORITATIVE',
      occurredAt: new Date('2026-09-01T03:59:59.999Z'),
    });

    expect(plan.status).toBe('READY');
    expect(plan.blockReasons).toEqual([]);
    expect(plan.requiredAccountStableIds).toEqual(
      expect.arrayContaining([
        PROVIDER_SETTLEMENT_ACCOUNT_IDS.fantuanPending,
        PROVIDER_SETTLEMENT_ACCOUNT_IDS.otherOperatingRevenue,
        PROVIDER_SETTLEMENT_ACCOUNT_IDS.chargebackAdjustmentExpense,
      ]),
    );
    const journalLines = new Map(
      plan.draftJournal?.lines.map((line) => [line.accountStableId, line]) ??
        [],
    );
    expect(
      journalLines.get(PROVIDER_SETTLEMENT_ACCOUNT_IDS.fantuanPending),
    ).toEqual(expect.objectContaining({ debitCents: 2694, creditCents: 0 }));
    expect(
      journalLines.get(PROVIDER_SETTLEMENT_ACCOUNT_IDS.otherOperatingRevenue),
    ).toEqual(expect.objectContaining({ debitCents: 0, creditCents: 3354 }));
    expect(
      journalLines.get(
        PROVIDER_SETTLEMENT_ACCOUNT_IDS.chargebackAdjustmentExpense,
      ),
    ).toEqual(expect.objectContaining({ debitCents: 660, creditCents: 0 }));
  });

  it.each<[string, AccountingFinancialComponent]>([
    ['OTHER', AccountingFinancialComponent.OTHER],
    ['ADJUSTMENT', AccountingFinancialComponent.ADJUSTMENT],
  ])(
    'fails closed on unknown %s provider components instead of defaulting them into general income or expense',
    (_label, component) => {
      const plan = buildProviderSettlementDocumentPlan({
        document: uberDocument([
          {
            lineStableId: 'line-unknown',
            lineNo: 1,
            rawName: 'Unknown provider component',
            component,
            postingTreatment: AccountingFinancialPostingTreatment.POSTABLE,
            amountCents: 123,
          },
        ]),
        salesAuthority: 'STATEMENT_AUTHORITATIVE',
        occurredAt: new Date('2026-09-01T03:59:59.999Z'),
      });
      expect(plan.status).toBe('BLOCKED');
      expect(plan.blockReasons).toEqual(['UNMAPPED_PROVIDER_COMPONENT']);
    },
  );

  it('inverts every line of a pre-cutover Uber Order journal without changing historical occurrence time', () => {
    const draft = buildUberPreCutoverOrderReversalDraft({
      entryStableId: 'journal_manual_uber_1',
      storeStableId: '4750_Yonge_Street',
      occurredAt: new Date('2026-06-10T16:00:00.000Z'),
      currency: 'CAD',
      lines: [
        {
          accountStableId: 'account_uber_pending',
          debitCents: 1130,
          creditCents: 0,
        },
        {
          accountStableId: 'account_sales_revenue',
          debitCents: 0,
          creditCents: 1000,
        },
        {
          accountStableId: 'account_hst_payable',
          debitCents: 0,
          creditCents: 130,
        },
      ],
    });

    expect(draft.occurredAt).toBe('2026-06-10T16:00:00.000Z');
    expect(draft.lines).toEqual([
      expect.objectContaining({
        accountStableId: 'account_uber_pending',
        debitCents: 0,
        creditCents: 1130,
      }),
      expect.objectContaining({
        accountStableId: 'account_sales_revenue',
        debitCents: 1000,
        creditCents: 0,
      }),
      expect.objectContaining({
        accountStableId: 'account_hst_payable',
        debitCents: 130,
        creditCents: 0,
      }),
    ]);
  });
});
