import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const REPORTS_ROOT = resolve(__dirname);
const API_ROOT = resolve(REPORTS_ROOT, '..');
const REPOSITORY_ROOT = resolve(API_ROOT, '../../..');

function read(path: string): string {
  return readFileSync(path, 'utf8');
}

describe('Reporting / Brand-Store operating-context boundary', () => {
  it('keeps Store implementation knowledge at the registered Reporting composition root', () => {
    const reportsModule = read(resolve(REPORTS_ROOT, 'reports.module.ts'));
    const reportsService = read(resolve(REPORTS_ROOT, 'reports.service.ts'));
    const reportingContract = read(
      resolve(REPORTS_ROOT, 'reporting-store-operating-context.contract.ts'),
    );
    const baseline = read(
      resolve(REPOSITORY_ROOT, 'tools/architecture/context-baseline.json'),
    );

    expect(reportsModule).toContain("from '../store/public-api'");
    expect(reportsModule).toContain('BRAND_STORE_CONFIG_READER');
    expect(reportsModule).toContain('STORE_SCHEDULE_READER');
    expect(reportsModule).toContain('STORE_STATUS_READER');
    expect(reportsModule).toContain('REPORTING_STORE_OPERATING_CONTEXT_QUERY');
    expect(reportsService).not.toContain("from '../store/");
    expect(reportingContract).not.toContain("from '../store/");
    expect(reportingContract).not.toContain('@prisma/client');
    expect(baseline).toContain('"apps/api/src/reports/reports.module.ts"');
    expect(baseline).not.toContain(
      '"accounting-reporting-analytics -> brand-store"',
    );
  });

  it('publishes only the store operating context needed by Reporting', () => {
    const reportingContract = read(
      resolve(REPORTS_ROOT, 'reporting-store-operating-context.contract.ts'),
    );

    expect(reportingContract).toContain('storeStableId');
    expect(reportingContract).toContain('timezone');
    expect(reportingContract).toContain('businessHours');
    expect(reportingContract).toContain('holidays');
    expect(reportingContract).toContain('currentStatus');
    expect(reportingContract).toContain('CURRENT_CONFIGURATION_ONLY');
    expect(reportingContract).not.toContain('salesTaxRate');
    expect(reportingContract).not.toContain('supportPhone');
    expect(reportingContract).not.toContain('contactName');
    expect(reportingContract).not.toContain('autoAcceptOnlineOrders');
    expect(reportingContract).not.toContain('allergyHandlingMode');
  });
});
