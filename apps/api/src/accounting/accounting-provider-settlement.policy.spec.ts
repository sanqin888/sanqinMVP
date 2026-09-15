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

  it('fails closed on unknown provider components instead of defaulting them into general income or expense', () => {
    const plan = buildProviderSettlementDocumentPlan({
      document: uberDocument([
        {
          lineStableId: 'line-other',
          lineNo: 1,
          rawName: 'Other Earnings',
          component: AccountingFinancialComponent.OTHER,
          postingTreatment: AccountingFinancialPostingTreatment.POSTABLE,
          amountCents: 123,
        },
      ]),
      salesAuthority: 'STATEMENT_AUTHORITATIVE',
      occurredAt: new Date('2026-09-01T03:59:59.999Z'),
    });
    expect(plan.status).toBe('BLOCKED');
    expect(plan.blockReasons).toEqual(['UNMAPPED_PROVIDER_COMPONENT']);
  });

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