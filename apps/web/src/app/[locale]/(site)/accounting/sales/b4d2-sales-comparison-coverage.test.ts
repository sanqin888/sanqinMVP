import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const salesRoot = __dirname;
const pageSource = readFileSync(resolve(salesRoot, 'page.tsx'), 'utf8');
const helperSource = readFileSync(
  resolve(salesRoot, 'sales-comparison-range.ts'),
  'utf8',
);

describe('B4-D2 Sales equal-period coverage guard', () => {
  it('uses accountingStartDate before issuing the previous-period request', () => {
    expect(pageSource).toContain(
      'previousEqualRangeWithinAccountingCoverage(',
    );
    expect(pageSource).toContain('currentReport.accountingStartDate');
    expect(pageSource).toContain(
      "setComparisonUnavailableReason('OUTSIDE_ACCOUNTING_COVERAGE')",
    );
    expect(pageSource).toContain('so no comparison request is sent');
  });

  it('requires the entire prior period to be inside Accounting coverage', () => {
    expect(helperSource).toContain('previousFromMs < accountingStartMs');
    expect(helperSource).not.toContain('Math.max(previousFromMs');
  });

  it('keeps comparison money on the canonical Sales endpoint', () => {
    expect(pageSource).toContain('/accounting/report/sales?');
    expect(pageSource).not.toContain('/accounting/report/pnl');
    expect(pageSource).not.toContain('/accounting/report/slice');
  });
});
