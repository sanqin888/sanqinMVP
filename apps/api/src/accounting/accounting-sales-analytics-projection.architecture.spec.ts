import { resolve } from 'node:path';

import { scanTypeScript } from '../test/architecture-test.utils';

const API_SRC_ROOT = resolve(__dirname, '..');
const ACCOUNTING_ROOT = resolve(API_SRC_ROOT, 'accounting');

const file = (suffix: string) =>
  scanTypeScript(ACCOUNTING_ROOT).find(({ path }) => path.endsWith(suffix));

describe('B2 canonical Journal Sales projection boundary', () => {
  it('keeps Sales money Journal-owned while joining only public descriptive attribution', () => {
    const service = file('accounting-sales-analytics.service.ts')?.source ?? '';

    expect(service).toContain("from '../orders/public-api'");
    expect(service).toContain('ORDER_SALES_ATTRIBUTION_READER');
    expect(service).toContain('ACCOUNTING_DB');
    expect(service).toContain('ACCOUNTING_SALES_SOURCE_FACT_TYPES');
    expect(service).toContain('projectAccountingSalesComponentLine');
    expect(service).toContain('projectAccountingSalesTenderLine');
    expect(service).toContain(
      "'accounting.uber_pre_cutover_order_reversal.v1'",
    );
    expect(service).toContain("'accounting.provider_financial_document.v1'");
    expect(service).toContain('ACCOUNTING_EXTERNAL_SALE_SOURCE_FACT_TYPE');
    expect(service).toContain(
      'ACCOUNTING_EXTERNAL_SALE_REVERSAL_SOURCE_FACT_TYPE',
    );
    expect(service).toContain('accountingExternalSale.findMany');
    expect(service).toContain("primaryPaymentMethod: 'NOT_APPLICABLE'");
    expect(service).toContain('byExternalClassification');

    expect(service).not.toContain("from '../orders/order-");
    expect(service).not.toContain('ORDER_REPORTING_FACTS_READER');
    expect(service).not.toContain('readPaidTotalDimensionsForRange');
    expect(service).not.toContain('Order.totalCents');
    expect(service).not.toContain('paymentBreakdownJson');
    expect(service).not.toContain(
      "sourceFactType === 'accounting.external_sale_settlement.v1'",
    );
    expect(service).not.toContain(
      "sourceFactType === 'accounting.external_sale_settlement_reversal.v1'",
    );
  });

  it('keeps canonical Sales as the Accounting sales read path after legacy cleanup', () => {
    const controller = file('accounting-reports.controller.ts')?.source ?? '';
    const service = file('accounting-sales-analytics.service.ts')?.source ?? '';
    const module = file('accounting.module.ts')?.source ?? '';

    expect(controller).toContain("@Get('report/sales')");
    expect(controller).toContain("@Query('storeStableId')");
    expect(controller).toContain('this.salesAnalytics.report');
    expect(service).toContain('getStoreSnapshot');
    expect(service).toContain('getConfiguredStoreSnapshot');
    expect(controller).not.toContain("@Get('report/slice')");
    expect(controller).not.toContain('this.accountingService.dimensionSlice');

    expect(module).toContain('AccountingSalesAnalyticsService');
    expect(module).toContain('OrderSalesAttributionModule');
    expect(module).not.toContain('OrderReportingFactsModule');
  });

  it('keeps provider completeness explicit instead of treating missing fees as zero', () => {
    const service = file('accounting-sales-analytics.service.ts')?.source ?? '';
    const contract =
      file('accounting-sales-analytics.contract.ts')?.source ?? '';

    expect(service).toContain('readProviderFinancialCoverage');
    expect(service).toContain('resolveAccountingSalesProviderCoverage');
    expect(service).toContain("'UNATTRIBUTED_PROVIDER'");
    expect(contract).toContain('accountingStartDate: string');
    expect(contract).toContain('providerCoverage');
    expect(contract).toContain('financialCompleteThrough');
    expect(contract).toContain('AccountingSalesProviderCoverageStatusV1');
  });
});
