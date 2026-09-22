import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const ACCOUNTING_ROOT = resolve(__dirname, '..');

const salesPageSource = readFileSync(
  resolve(ACCOUNTING_ROOT, 'sales', 'page.tsx'),
  'utf8',
);
const reportsContractSource = readFileSync(
  resolve(__dirname, 'reports.ts'),
  'utf8',
);

describe('B2-C canonical Sales Web cutover', () => {
  it('keeps the Sales page on the canonical Sales report', () => {
    expect(salesPageSource).toContain('AccountingSalesAnalyticsReport');
    expect(salesPageSource).toContain('/accounting/report/sales?');
    expect(salesPageSource).not.toContain('/accounting/report/slice');
    expect(salesPageSource).not.toContain('/accounting/report/pnl');
    expect(salesPageSource).not.toContain('AccountingOrderDimensionSlice');
    expect(salesPageSource).not.toContain('AccountingPnlReport');
  });

  it('keeps canonical Sales dimensions, tender mix and provider coverage explicit in the Web contract', () => {
    for (const token of [
      'export type AccountingSalesAnalyticsReport',
      'export type AccountingSalesSummary',
      'netSalesRevenueCents: number',
      'contributionCents: number',
      'byPrimaryPaymentMethod:',
      'tenderMix:',
      'providerCoverage:',
      'financialCompleteThrough: string | null',
      "'HISTORICAL_REPLACEMENT_REVERSAL'",
      "'UNATTRIBUTED'",
    ]) {
      expect(reportsContractSource).toContain(token);
    }
  });

  it('surfaces canonical authority, equal-period comparison and fail-visible coverage in Sales UI', () => {
    expect(salesPageSource).toContain('Canonical Journal');
    expect(salesPageSource).toContain('previousEqualRange');
    expect(salesPageSource).toContain('Previous equal period');
    expect(salesPageSource).toContain('Provider financial coverage');
    expect(salesPageSource).toContain('INCOMPLETE / UNKNOWN');
    expect(salesPageSource).toContain('Tender mix');
    expect(salesPageSource).toContain('Sales sources / adjustments');
    expect(salesPageSource).toContain('Channel contribution');
  });
});
