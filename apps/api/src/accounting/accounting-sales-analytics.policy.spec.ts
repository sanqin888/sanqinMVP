import {
  isAccountingSalesSourceFactType,
  projectAccountingSalesComponentLine,
  projectAccountingSalesTenderLine,
  resolveAccountingSalesAttributionQuality,
  resolveAccountingSalesProviderCoverage,
  summarizeAccountingSalesComponents,
} from './accounting-sales-analytics.policy';

describe('Accounting sales analytics policy', () => {
  it('limits core Sales projection to canonical sale/change/provider source facts', () => {
    for (const sourceFactType of [
      'order.financial_sale.v1',
      'order.financial_adjustment.v1',
      'order.financial_reversal.v1',
      'accounting.provider_financial_document.v1',
      'accounting.uber_pre_cutover_order_reversal.v1',
    ]) {
      expect(isAccountingSalesSourceFactType(sourceFactType)).toBe(true);
    }
    expect(isAccountingSalesSourceFactType('accounting.expense_document.v1')).toBe(
      false,
    );
    expect(isAccountingSalesSourceFactType(null)).toBe(false);
  });

  it('projects canonical Journal accounts with accounting-aware signs', () => {
    const rows = [
      projectAccountingSalesComponentLine({
        accountStableId: 'account_sales_revenue',
        debitCents: 0,
        creditCents: 1000,
      }),
      projectAccountingSalesComponentLine({
        accountStableId: 'account_sales_discounts',
        debitCents: 100,
        creditCents: 0,
      }),
      projectAccountingSalesComponentLine({
        accountStableId: 'account_delivery_revenue',
        debitCents: 0,
        creditCents: 50,
      }),
      projectAccountingSalesComponentLine({
        accountStableId: 'account_card_surcharge_revenue',
        debitCents: 0,
        creditCents: 20,
      }),
      projectAccountingSalesComponentLine({
        accountStableId: 'account_hst_payable',
        debitCents: 0,
        creditCents: 126,
      }),
    ].filter((row) => row !== null);

    expect(summarizeAccountingSalesComponents(rows)).toMatchObject({
      grossSalesCents: 1000,
      discountsCents: 100,
      netFoodSalesCents: 900,
      deliveryRevenueCents: 50,
      cardSurchargeRevenueCents: 20,
      netSalesRevenueCents: 970,
      outputTaxCents: 126,
      contributionCents: 970,
    });
  });

  it('keeps reversals signed so they reduce the original sales metrics', () => {
    expect(
      projectAccountingSalesComponentLine({
        accountStableId: 'account_sales_revenue',
        debitCents: 1000,
        creditCents: 0,
      }),
    ).toEqual({ component: 'GROSS_SALES', amountCents: -1000 });
    expect(
      projectAccountingSalesComponentLine({
        accountStableId: 'account_sales_discounts',
        debitCents: 0,
        creditCents: 100,
      }),
    ).toEqual({ component: 'SALES_DISCOUNTS', amountCents: -100 });
  });

  it('derives contribution from Journal revenue and provider-cost components without tax', () => {
    const summary = summarizeAccountingSalesComponents([
      { component: 'GROSS_SALES', amountCents: 10_000 },
      { component: 'SALES_DISCOUNTS', amountCents: 500 },
      { component: 'DELIVERY_REVENUE', amountCents: 300 },
      { component: 'CARD_SURCHARGE_REVENUE', amountCents: 100 },
      { component: 'OUTPUT_TAX', amountCents: 1287 },
      { component: 'TIP_REVENUE', amountCents: 200 },
      { component: 'OTHER_OPERATING_REVENUE', amountCents: 50 },
      { component: 'PLATFORM_COMMISSION', amountCents: 1500 },
      { component: 'PAYMENT_PROCESSING_FEE', amountCents: 200 },
      { component: 'PLATFORM_PROMOTION', amountCents: 300 },
      { component: 'ADVERTISING', amountCents: 100 },
      { component: 'CHARGEBACK', amountCents: 50 },
      { component: 'PROVIDER_OTHER_FEE', amountCents: 25 },
    ]);

    expect(summary.netSalesRevenueCents).toBe(9900);
    expect(summary.outputTaxCents).toBe(1287);
    expect(summary.contributionCents).toBe(7900);
  });

  it('keeps Journal tender buckets distinct from primary payment attribution', () => {
    expect(
      projectAccountingSalesTenderLine({
        accountStableId: 'account_store_cash',
        debitCents: 1200,
        creditCents: 0,
      }),
    ).toEqual({
      tender: 'STORE_CASH_EQUIVALENT',
      amountCents: 1200,
    });
    expect(
      projectAccountingSalesTenderLine({
        accountStableId: 'account_clover_pending',
        debitCents: 800,
        creditCents: 0,
      }),
    ).toEqual({ tender: 'CLOVER_CARD', amountCents: 800 });
    expect(
      projectAccountingSalesTenderLine({
        accountStableId: 'account_store_balance_liability',
        debitCents: 250,
        creditCents: 0,
      }),
    ).toEqual({ tender: 'STORE_BALANCE', amountCents: 250 });
    expect(
      projectAccountingSalesTenderLine({
        accountStableId: 'account_sales_revenue',
        debitCents: 0,
        creditCents: 1000,
      }),
    ).toBeNull();
  });

  it('classifies attribution evidence without upgrading legacy current-row dimensions', () => {
    expect(
      resolveAccountingSalesAttributionQuality('IMMUTABLE_SALE_SNAPSHOT'),
    ).toBe('IMMUTABLE');
    expect(
      resolveAccountingSalesAttributionQuality('LEGACY_CURRENT_ORDER'),
    ).toBe('LEGACY_CURRENT_ORDER');
    expect(resolveAccountingSalesAttributionQuality(null)).toBe('MISSING');
  });

  it('fails visible on missing or incomplete provider financial coverage', () => {
    expect(
      resolveAccountingSalesProviderCoverage({
        requestedFrom: '2026-06-01',
        requestedTo: '2026-06-30',
        applicable: true,
        coverage: null,
      }),
    ).toBe('UNKNOWN');

    expect(
      resolveAccountingSalesProviderCoverage({
        requestedFrom: '2026-06-01',
        requestedTo: '2026-07-31',
        applicable: true,
        coverage: {
          financialHistoryRequiredFrom: '2026-06-01',
          financialCompleteThrough: '2026-06-30',
        },
      }),
    ).toBe('INCOMPLETE');

    expect(
      resolveAccountingSalesProviderCoverage({
        requestedFrom: '2026-06-01',
        requestedTo: '2026-07-31',
        applicable: true,
        coverage: {
          financialHistoryRequiredFrom: '2026-06-01',
          financialCompleteThrough: '2026-07-31',
        },
      }),
    ).toBe('COMPLETE');
  });

  it('returns NOT_APPLICABLE only when the provider is irrelevant or the range predates required history', () => {
    expect(
      resolveAccountingSalesProviderCoverage({
        requestedFrom: '2026-06-01',
        requestedTo: '2026-06-30',
        applicable: false,
        coverage: null,
      }),
    ).toBe('NOT_APPLICABLE');

    expect(
      resolveAccountingSalesProviderCoverage({
        requestedFrom: '2026-05-01',
        requestedTo: '2026-05-31',
        applicable: true,
        coverage: {
          financialHistoryRequiredFrom: '2026-06-01',
          financialCompleteThrough: null,
        },
      }),
    ).toBe('NOT_APPLICABLE');
  });

  it('rejects invalid date ranges and invalid minor units', () => {
    expect(() =>
      resolveAccountingSalesProviderCoverage({
        requestedFrom: '2026-07-01',
        requestedTo: '2026-06-30',
        applicable: true,
        coverage: null,
      }),
    ).toThrow('requestedTo must be on or after requestedFrom');

    expect(() =>
      projectAccountingSalesComponentLine({
        accountStableId: 'account_sales_revenue',
        debitCents: -1,
        creditCents: 0,
      }),
    ).toThrow('debitCents must be a non-negative safe integer');
  });
});
