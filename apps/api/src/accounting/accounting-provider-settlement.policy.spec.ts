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
  resolveProviderSalesAuthority,
} from './accounting-provider-settlement.policy';
import { FANTUAN_ADJUSTMENT_RAW_CODES } from './accounting-fantuan-adjustment-detail.contract';

const uberDocument = (
  lines: Array<{
    lineStableId: string;
    lineNo: number;
    rawName: string;
    component: AccountingFinancialComponent;
    postingTreatment: AccountingFinancialPostingTreatment;
    amountCents: number;
  }>,
) => ({
  documentStableId: 'provider_doc_1',
  revision: 1,
  provider: AccountingFinancialProvider.UBER_EATS,
  documentType: AccountingFinancialDocumentType.STATEMENT,
  storeStableId: '4750_Yonge_Street',
  periodStart: '2026-08-01',
  periodEnd: '2026-08-31',
  currency: 'CAD',
  lines,
});

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
