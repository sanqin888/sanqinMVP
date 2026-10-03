import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const reportsRoot = __dirname;
const accountingRoot = resolve(reportsRoot, '..');

const contractsSource = readFileSync(
  resolve(accountingRoot, 'contracts', 'reports.ts'),
  'utf8',
);
const sharedManagementContractSource = readFileSync(
  resolve(
    accountingRoot,
    '../../../../lib/contracts/accounting-management.ts',
  ),
  'utf8',
);
const pageSource = readFileSync(resolve(reportsRoot, 'page.tsx'), 'utf8');

describe('B4-D1 Management P&L adjustment decomposition', () => {
  it(
    'keeps adjustment decomposition in the shared Accounting report contract',
    () => {
      expect(contractsSource).toContain(
        "from '@/lib/contracts/accounting-management'",
      );
      expect(sharedManagementContractSource).toContain(
        'adjustmentBreakdown: Array<{',
      );
      expect(sharedManagementContractSource).toContain(
        'revenueNetCents: number',
      );
      expect(sharedManagementContractSource).toContain(
        'expenseNetCents: number',
      );
      expect(sharedManagementContractSource).toContain(
        'netProfitEffectCents: number',
      );
    },
  );

  it(
    'renders explanation without recalculating P&L in the Web adapter',
    () => {
      expect(pageSource).toContain('Adjustment effect breakdown');
      expect(pageSource).toContain('Revenue net change');
      expect(pageSource).toContain('Expense net change');
      expect(pageSource).toContain('Net profit effect');
      expect(pageSource).not.toContain(
        'row.revenueNetCents - row.expenseNetCents',
      );
    },
  );
});
