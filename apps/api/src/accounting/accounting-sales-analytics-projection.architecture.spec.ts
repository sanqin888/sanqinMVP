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

    expect(service).not.toContain("from '../orders/order-");
    expect(service).not.toContain('ORDER_REPORTING_FACTS_READER');
    expect(service).not.toContain('readPaidTotalDimensionsForRange');
    expect(service).not.toContain('Order.totalCents');
    expect(service).not.toContain('paymentBreakdownJson');
  });

  it('exposes the new canonical Sales read path without retiring legacy consumers yet', () => {
    const controller = file('accounting-reports.controller.ts')?.source ?? '';
    const module = file('accounting.module.ts')?.source ?? '';

    expect(controller).toContain("@Get('report/sales')");
    expect(controller).toContain('this.salesAnalytics.report');
    expect(controller).toContain("@Get('report/slice')");
    expect(controller).toContain('this.accountingService.dimensionSlice');

    expect(module).toContain('AccountingSalesAnalyticsService');
    expect(module).toContain('OrderSalesAttributionModule');
    expect(module).toContain('OrderReportingFactsModule');
  });

  it('keeps provider completeness explicit instead of treating missing fees as zero', () => {
    const service = file('accounting-sales-analytics.service.ts')?.source ?? '';
    const contract =
      file('accounting-sales-analytics.contract.ts')?.source ?? '';

    expect(service).toContain('readProviderFinancialCoverage');
    expect(service).toContain('resolveAccountingSalesProviderCoverage');
    expect(service).toContain("'UNATTRIBUTED_PROVIDER'");
    expect(contract).toContain('providerCoverage');
    expect(contract).toContain('financialCompleteThrough');
    expect(contract).toContain('AccountingSalesProviderCoverageStatusV1');
  });
});
