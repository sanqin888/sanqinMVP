import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const REPORTS_ROOT = resolve(__dirname);

function read(path: string): string {
  return readFileSync(path, 'utf8');
}

describe('DATA-B2 Reporting Calendar Context boundary', () => {
  it('keeps Calendar application logic on the existing Reporting Store-location port', () => {
    const service = read(resolve(REPORTS_ROOT, 'calendar-context.service.ts'));

    expect(service).toContain('REPORTING_STORE_LOCATION_QUERY');
    expect(service).not.toContain('PrismaService');
    expect(service).not.toContain('@prisma/client');
    expect(service).not.toContain('HttpService');
    expect(service).not.toContain('process.env');
    expect(service).not.toContain("from '../store/");
    expect(service).not.toMatch(/\bfetch\s*\(/);
  });

  it('keeps the Ontario rules deterministic and provider-free', () => {
    const rules = read(
      resolve(REPORTS_ROOT, 'ontario-public-holiday-calendar.ts'),
    );

    expect(rules).toContain('CA-ON-ESA-PUBLIC-HOLIDAYS');
    expect(rules).toContain('ca-on-family-day');
    expect(rules).toContain('ca-on-good-friday');
    expect(rules).toContain('ca-on-victoria-day');
    expect(rules).not.toContain('HttpService');
    expect(rules).not.toContain('PrismaService');
    expect(rules).not.toContain('process.env');
  });

  it('publishes an additive authenticated Calendar Context report without changing Store schedule authority', () => {
    const controller = read(resolve(REPORTS_ROOT, 'reports.controller.ts'));
    const module = read(resolve(REPORTS_ROOT, 'reports.module.ts'));
    const storeContext = read(
      resolve(REPORTS_ROOT, 'reporting-store-operating-context.contract.ts'),
    );

    expect(controller).toContain("@Get('calendar-context')");
    expect(controller).toContain('CalendarContextService');
    expect(module).toContain('CalendarContextService');
    expect(storeContext).toContain("'CURRENT_CONFIGURATION_ONLY'");
  });

  it('keeps unsupported jurisdictions explicit and excludes non-ESA observances from the v1 authority', () => {
    const contract = read(resolve(REPORTS_ROOT, 'calendar-context.contract.ts'));
    const rules = read(
      resolve(REPORTS_ROOT, 'ontario-public-holiday-calendar.ts'),
    );

    expect(contract).toContain("'UNSUPPORTED_JURISDICTION'");
    expect(contract).toContain("'ONTARIO_PUBLIC_HOLIDAY'");
    expect(contract).toContain('PUBLIC_HOLIDAY_ON_FRIDAY_OR_MONDAY');
    expect(contract).toContain(
      'NOT_INFERRED_WITHOUT_HISTORICAL_STORE_EVIDENCE',
    );
    expect(contract).toContain('DOES_NOT_ASSERT_STORE_CLOSED');
    expect(rules).not.toContain('Civic Holiday');
    expect(rules).not.toContain('Truth and Reconciliation');
    expect(rules).not.toContain('Remembrance Day');
    expect(rules).not.toContain('Easter Monday');
  });
});
