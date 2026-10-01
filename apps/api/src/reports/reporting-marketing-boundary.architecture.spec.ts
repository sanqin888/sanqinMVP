import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const REPORTS_ROOT = resolve(__dirname);
const API_ROOT = resolve(REPORTS_ROOT, '..');
const REPOSITORY_ROOT = resolve(API_ROOT, '../../..');

function read(path: string): string {
  return readFileSync(path, 'utf8');
}

describe('Reporting / Marketing owner boundaries', () => {
  it('keeps Marketing overview business logic on Reporting-owned ports only', () => {
    const service = read(
      resolve(REPORTS_ROOT, 'marketing-overview-report.service.ts'),
    );
    const campaignContract = read(
      resolve(REPORTS_ROOT, 'reporting-marketing-campaigns-query.contract.ts'),
    );
    const usageContract = read(
      resolve(REPORTS_ROOT, 'reporting-marketing-usage-query.contract.ts'),
    );

    expect(service).toContain('REPORTING_MARKETING_CAMPAIGNS_QUERY');
    expect(service).toContain('REPORTING_MARKETING_USAGE_QUERY');
    expect(service).toContain('REPORTING_STORE_OPERATING_CONTEXT_QUERY');
    expect(service).not.toContain("from '../orders/");
    expect(service).not.toContain("from '../promotions/");
    expect(service).not.toContain("from '../prisma/");
    expect(service).not.toContain('@prisma/client');
    expect(service).not.toContain('promotionSnapshot');
    expect(campaignContract).not.toContain("from '../promotions/");
    expect(usageContract).not.toContain("from '../orders/");
    expect(campaignContract).not.toContain('@prisma/client');
    expect(usageContract).not.toContain('@prisma/client');
  });

  it('confines Orders and Offers public wiring to the registered ReportsModule composition root', () => {
    const module = read(resolve(REPORTS_ROOT, 'reports.module.ts'));
    const baseline = read(
      resolve(REPOSITORY_ROOT, 'tools/architecture/context-baseline.json'),
    );

    expect(module).toContain("from '../orders/public-api'");
    expect(module).toContain("from '../promotions/public-api'");
    expect(module).toContain('ORDER_MARKETING_USAGE_FACTS_READER');
    expect(module).toContain('MARKETING_CAMPAIGN_FACTS_READER');
    expect(module).toContain('REPORTING_MARKETING_USAGE_QUERY');
    expect(module).toContain('REPORTING_MARKETING_CAMPAIGNS_QUERY');
    expect(baseline).toContain('"apps/api/src/reports/reports.module.ts"');
    expect(baseline).not.toContain(
      '"accounting-reporting-analytics -> catalog-pricing-offers"',
    );
  });

  it('keeps the additive HTTP contract on Reporting and avoids legacy root-report reuse', () => {
    const controller = read(resolve(REPORTS_ROOT, 'reports.controller.ts'));

    expect(controller).toContain("@Get('marketing')");
    expect(controller).toContain('MarketingOverviewReportService');
    expect(controller).toContain('storeStableId');
    expect(controller).not.toContain('promotionSnapshot');
  });
});
