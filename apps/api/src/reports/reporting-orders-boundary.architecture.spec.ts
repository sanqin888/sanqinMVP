import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const REPORTS_ROOT = resolve(__dirname);
const API_ROOT = resolve(REPORTS_ROOT, '..');
const REPOSITORY_ROOT = resolve(API_ROOT, '../../..');

function read(path: string): string {
  return readFileSync(path, 'utf8');
}

describe('Reporting / Orders cycle-safe boundary', () => {
  it('keeps Reporting business logic independent from Orders persistence and internal parsers', () => {
    const reportsService = read(resolve(REPORTS_ROOT, 'reports.service.ts'));

    expect(reportsService).toContain('REPORTING_ORDER_FACTS_QUERY');
    expect(reportsService).not.toContain("from '../prisma/");
    expect(reportsService).not.toContain("from '../orders/");
    expect(reportsService).not.toContain('@prisma/client');
    expect(reportsService).not.toContain('componentsJson');
    expect(reportsService).not.toContain('readOrderItemComponentsSnapshot');
  });

  it('binds the Reporting-owned outbound port to the Orders public reader only at the registered composition root', () => {
    const reportsModule = read(resolve(REPORTS_ROOT, 'reports.module.ts'));
    const baseline = read(
      resolve(REPOSITORY_ROOT, 'tools/architecture/context-baseline.json'),
    );

    expect(reportsModule).toContain("from '../orders/public-api'");
    expect(reportsModule).toContain('ORDER_REPORTING_FACTS_READER');
    expect(reportsModule).toContain('REPORTING_ORDER_FACTS_QUERY');
    expect(baseline).toContain('"apps/api/src/reports/reports.module.ts"');
    expect(baseline).not.toContain(
      '"accounting-reporting-analytics -> commerce-orders-fulfillment"',
    );
  });

  it('keeps Homepage business logic on a Brand-owned ranking port and confines Reporting wiring to a composition root', () => {
    const homepageService = read(
      resolve(API_ROOT, 'homepage/homepage-featured.service.ts'),
    );
    const homepageModule = read(
      resolve(API_ROOT, 'homepage/homepage-content.module.ts'),
    );
    const baseline = read(
      resolve(REPOSITORY_ROOT, 'tools/architecture/context-baseline.json'),
    );

    expect(homepageService).toContain('HOMEPAGE_SALES_RANKING_QUERY');
    expect(homepageService).not.toContain("from '../reports/");
    expect(homepageModule).toContain("from '../reports/public-api'");
    expect(homepageModule).toContain('REPORTING_TOP_ITEMS_QUERY');
    expect(homepageModule).toContain('HOMEPAGE_SALES_RANKING_QUERY');
    expect(baseline).toContain(
      '"apps/api/src/homepage/homepage-content.module.ts"',
    );
    expect(baseline).not.toContain(
      '"brand-store -> accounting-reporting-analytics"',
    );
  });

  it('keeps immutable component decoding inside the Orders owner', () => {
    const ordersReader = read(
      resolve(API_ROOT, 'orders/order-reporting-facts-reader.service.ts'),
    );
    const ordersPublicApi = read(resolve(API_ROOT, 'orders/public-api.ts'));

    expect(ordersReader).toContain('readOrderItemComponentsSnapshot');
    expect(ordersReader).toContain('componentsJson');
    expect(ordersPublicApi).toContain('ORDER_REPORTING_FACTS_READER');
    expect(ordersPublicApi).toContain('OrderReportingFactsModule');
  });
});
