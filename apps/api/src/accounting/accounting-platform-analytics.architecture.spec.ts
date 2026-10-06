import { resolve } from 'node:path';

import { scanTypeScript } from '../test/architecture-test.utils';

const ACCOUNTING_ROOT = resolve(__dirname);

const file = (suffix: string) =>
  scanTypeScript(ACCOUNTING_ROOT).find(({ path }) => path.endsWith(suffix))
    ?.source ?? '';

describe('Accounting platform analytics boundary', () => {
  it('keeps platform analytics as an Accounting-owned read model', () => {
    const service = file('accounting-platform-analytics.service.ts');

    expect(service).toContain('AccountingProviderSettlementQueryService');
    expect(service).toContain('BRAND_STORE_CONFIG_READER');
    expect(service).toContain("from '../store/public-api'");
    expect(service).toContain('resolveProviderFinancialEffectiveLines');
    expect(service).toContain('buildProviderControlTotalChecks');
    expect(service).not.toContain("from '../integrations/");
    expect(service).not.toContain('UberEatsReportingPort');
    expect(service).not.toContain('Order.totalCents');
  });

  it('keeps ex-tax fee classification on the server instead of the Admin browser', () => {
    const service = file('accounting-platform-analytics.service.ts');
    const contract = file('accounting-platform-analytics.contract.ts');

    expect(service).toContain('AccountingFinancialTaxRole.NONE');
    expect(service).toContain('PLATFORM_FEE_COMPONENTS');
    expect(service).toContain('totalPlatformCostExTaxCents');
    expect(contract).toContain('shareOfSalesBps');
    expect(contract).toContain("'AMBIGUOUS'");
    expect(contract).toContain("'INCOMPLETE'");
  });
});
