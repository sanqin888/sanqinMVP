import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const REPORTS_ROOT = __dirname;
const ACCOUNTING_ROOT = resolve(REPORTS_ROOT, '..');

const pageSource = readFileSync(resolve(REPORTS_ROOT, 'page.tsx'), 'utf8');
const statementsSource = readFileSync(
  resolve(REPORTS_ROOT, 'accounting-statements.tsx'),
  'utf8',
);
const drillSource = readFileSync(
  resolve(REPORTS_ROOT, 'statement-journal-drill-through.tsx'),
  'utf8',
);
const contractsSource = readFileSync(
  resolve(ACCOUNTING_ROOT, 'contracts', 'reports.ts'),
  'utf8',
);

describe('B4-C1 Accounting statement Journal drill-through', () => {
  it('opens drill-through from both canonical statement views', () => {
    expect(pageSource).toContain('StatementJournalDrillThrough');
    expect(pageSource).toContain('onDrillThrough={setDrillTarget}');
    expect(statementsSource).toContain("phase: 'OPENING'");
    expect(statementsSource).toContain("phase: 'PERIOD'");
    expect(statementsSource).toContain("phase: 'CLOSING'");
  });

  it('uses a shared Web wire contract and the Accounting-owned statement Journal endpoint', () => {
    expect(contractsSource).toContain(
      'export type AccountingStatementJournalDrillThrough',
    );
    expect(drillSource).toContain('/accounting/report/statement-journals?');
    expect(drillSource).toContain('sourceFactType');
    expect(drillSource).toContain('sourceFactStableId');
    expect(drillSource).toContain('entry.lines.map');
  });

  it('keeps C1 source-neutral instead of adding foreign-owner API lookups or deep links', () => {
    expect(drillSource).not.toContain('/orders/');
    expect(drillSource).not.toContain('/payroll/');
    expect(drillSource).not.toContain('/provider-payouts/');
    expect(drillSource).not.toContain('/provider-financial/');
  });

  it('renders Journal timestamps in the statement business timezone and labels pagination totals honestly', () => {
    expect(drillSource).toContain('timeZone: timezone');
    expect(drillSource).toContain('report.pageSummary');
    expect(contractsSource).toContain('pageSummary:');
  });
});
