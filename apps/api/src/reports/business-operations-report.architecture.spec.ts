import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const REPORTS_ROOT = resolve(__dirname);

function read(path: string): string {
  return readFileSync(path, 'utf8');
}

describe('B5-C1 Business Operations architecture', () => {
  it('keeps the projection/anomaly engine on Reporting-owned ports', () => {
    const service = read(
      resolve(REPORTS_ROOT, 'business-operations-report.service.ts'),
    );
    const module = read(resolve(REPORTS_ROOT, 'reports.module.ts'));

    expect(service).toContain('REPORTING_BUSINESS_ORDER_FACTS_QUERY');
    expect(service).toContain('REPORTING_STORE_OPERATING_CONTEXT_QUERY');
    expect(service).not.toContain("from '../orders/");
    expect(service).not.toContain("from '../store/");
    expect(service).not.toContain("from '../prisma/");
    expect(service).not.toContain('@prisma/client');

    expect(module).toContain('REPORTING_BUSINESS_ORDER_FACTS_QUERY');
    expect(module).toContain('ORDER_REPORTING_FACTS_READER');
    expect(module).toContain("from '../orders/public-api'");
  });

  it('keeps the legacy report route/service separate from the additive business projection', () => {
    const controller = read(resolve(REPORTS_ROOT, 'reports.controller.ts'));
    const legacyService = read(resolve(REPORTS_ROOT, 'reports.service.ts'));

    expect(controller).toContain("@Get('business')");
    expect(controller).toContain('@Get()');
    expect(controller).toContain('BusinessOperationsReportService');
    expect(legacyService).not.toContain('BusinessOperationsReportService');
    expect(legacyService).not.toContain('REPORTING_BUSINESS_ORDER_FACTS_QUERY');
  });

  it('does not introduce POS/Print authority before a public seam is approved', () => {
    const service = read(
      resolve(REPORTS_ROOT, 'business-operations-report.service.ts'),
    );
    const contract = read(
      resolve(REPORTS_ROOT, 'business-operations-report.contract.ts'),
    );

    expect(service).not.toContain('posPrintJob');
    expect(service).not.toContain("from '../pos/");
    expect(contract).toContain("printHealth: 'UNAVAILABLE'");
  });
});
