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
const sharedSalesContractSource = readFileSync(
  resolve(
    __dirname,
    '../../../../../lib/contracts/accounting-sales.ts',
  ),
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

  it(
    'keeps canonical Sales dimensions, tender mix and provider coverage explicit in the shared Web contract',
    () => {
      expect(reportsContractSource).toContain(
        "from '@/lib/contracts/accounting-sales'",
      );
      for (const token of [
        'export type AccountingSalesAnalyticsReport',
        'export type AccountingSalesSummary',
        'netSalesRevenueCents: number',
        'contributionCents: number',
        'accountingStartDate: string',
        'byPrimaryPaymentMethod:',
        'tenderMix:',
        'providerCoverage:',
        'financialCompleteThrough: string | null',
        "'HISTORICAL_REPLACEMENT_REVERSAL'",
        "'UNATTRIBUTED'",
      ]) {
        expect(sharedSalesContractSource).toContain(token);
      }
    },
  );

  it(
    'reframes the Accounting page as Sales Accounting without duplicating management analysis',
    () => {
      expect(salesPageSource).toContain('Sales Accounting');
      expect(salesPageSource).toContain('Canonical Journal');
      expect(salesPageSource).toContain('Provider financial coverage');
      expect(salesPageSource).toContain('INCOMPLETE / UNKNOWN');
      expect(salesPageSource).toContain('Tender mix');
      expect(salesPageSource).toContain('Sales sources / adjustments');
      expect(salesPageSource).not.toContain('previousEqualRange');
      expect(salesPageSource).not.toContain('Previous equal period');
      expect(salesPageSource).not.toContain('Daily sales trend');
      expect(salesPageSource).not.toContain('Channel contribution');
    },
  );
});
