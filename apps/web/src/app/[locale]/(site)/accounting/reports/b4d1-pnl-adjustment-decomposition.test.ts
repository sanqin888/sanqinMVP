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
const adminManagementViewSource = readFileSync(
  resolve(
    accountingRoot,
    '../../../../features/admin/management-pnl/ManagementPnlReportView.tsx',
  ),
  'utf8',
);

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
    'keeps adjustment explanation in Admin after the Accounting UI contraction',
    () => {
      expect(adminManagementViewSource).toContain('Adjustment effect breakdown');
      expect(adminManagementViewSource).toContain('Revenue net change');
      expect(adminManagementViewSource).toContain('Expense net change');
      expect(adminManagementViewSource).toContain('Net profit effect');
      expect(adminManagementViewSource).not.toContain(
        'row.revenueNetCents - row.expenseNetCents',
      );
      expect(pageSource).not.toContain('Adjustment effect breakdown');
      expect(pageSource).not.toContain('/accounting/report/pnl?');
    },
  );
});
