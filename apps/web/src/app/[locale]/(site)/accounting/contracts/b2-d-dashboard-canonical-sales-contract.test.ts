import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const ACCOUNTING_ROOT = resolve(__dirname, '..');

const dashboardPageSource = readFileSync(
  resolve(ACCOUNTING_ROOT, 'dashboard', 'page.tsx'),
  'utf8',
);

describe('B2-D Dashboard canonical Sales cutover', () => {
  it('moves Dashboard sales summaries to the canonical Sales report', () => {
    expect(dashboardPageSource).toContain('AccountingSalesAnalyticsReport');
    expect(dashboardPageSource).toContain('/accounting/report/sales?');
    expect(dashboardPageSource).toContain('byChannel');
    expect(dashboardPageSource).toContain('byPrimaryPaymentMethod');
    expect(dashboardPageSource).toContain('summary.netSalesRevenueCents');

    expect(dashboardPageSource).not.toContain('/accounting/report/slice');
    expect(dashboardPageSource).not.toContain('AccountingOrderDimensionSlice');
    expect(dashboardPageSource).not.toContain('byPaymentMethod');
  });

  it('keeps Dashboard as a compact canonical sales overview', () => {
    expect(dashboardPageSource).toContain('Net sales revenue');
    expect(dashboardPageSource).toContain('Amounts come from canonical Journal.');
    expect(dashboardPageSource).toContain('Revenue attribution, not actual tender mix.');

    expect(dashboardPageSource).not.toContain('tenderMix');
    expect(dashboardPageSource).not.toContain('providerCoverage');
    expect(dashboardPageSource).not.toContain('bySource');
    expect(dashboardPageSource).not.toContain('daily');
  });
});
