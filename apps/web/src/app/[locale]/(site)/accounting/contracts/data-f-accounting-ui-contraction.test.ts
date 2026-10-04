import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const WEB_ROOT = resolve(__dirname, '../../../../..');
const accountingRoot = resolve(__dirname, '..');
const salesPageSource = readFileSync(
  resolve(accountingRoot, 'sales', 'page.tsx'),
  'utf8',
);
const reportsPageSource = readFileSync(
  resolve(accountingRoot, 'reports', 'page.tsx'),
  'utf8',
);
const accountingShellSource = readFileSync(
  resolve(WEB_ROOT, 'components', 'staff', 'AccountingShell.tsx'),
  'utf8',
);
const adminSalesSource = readFileSync(
  resolve(
    WEB_ROOT,
    'features',
    'admin',
    'sales-analytics',
    'SalesAnalyticsPageClient.tsx',
  ),
  'utf8',
);
const adminManagementSource = readFileSync(
  resolve(
    WEB_ROOT,
    'features',
    'admin',
    'management-pnl',
    'ManagementPnlPageClient.tsx',
  ),
  'utf8',
);

describe('DATA-F Accounting UI contraction', () => {
  it(
    'reframes canonical Sales as Sales Accounting without duplicating Admin trend analysis',
    () => {
      expect(accountingShellSource).toContain("labelEn: 'Sales accounting'");
      expect(salesPageSource).toContain('Sales Accounting');
      expect(salesPageSource).toContain('/accounting/report/sales?');
      expect(salesPageSource).toContain('Tender mix');
      expect(salesPageSource).toContain('Provider financial coverage');
      expect(salesPageSource).toContain('Sales sources / adjustments');

      expect(salesPageSource).not.toContain('previousEqualRange');
      expect(salesPageSource).not.toContain('Previous equal period');
      expect(salesPageSource).not.toContain('Daily sales trend');
      expect(salesPageSource).not.toContain('Channel contribution');
      expect(salesPageSource).not.toContain("from 'recharts'");

      expect(adminSalesSource).toContain('Previous-period net sales');
      expect(adminSalesSource).toContain('Sales × weather × holidays');
      expect(adminSalesSource).toContain('Channel contribution');
    },
  );

  it(
    'contracts Accounting Reports to canonical statements while keeping Management P&L in Admin',
    () => {
      expect(reportsPageSource).toContain('Accounting Statements');
      expect(reportsPageSource).toContain('/accounting/report/trial-balance?');
      expect(reportsPageSource).toContain(
        '/accounting/report/balance-movement?',
      );
      expect(reportsPageSource).toContain(
        '/api/v1/accounting/export/trial-balance',
      );
      expect(reportsPageSource).toContain(
        '/api/v1/accounting/export/balance-movement',
      );

      expect(reportsPageSource).not.toContain('/accounting/report/pnl?');
      expect(reportsPageSource).not.toContain('/accounting/report/cashflow?');
      expect(reportsPageSource).not.toContain(
        '/api/v1/accounting/export/report',
      );
      expect(reportsPageSource).not.toContain('Management P&L');

      expect(adminManagementSource).toContain('/accounting/report/pnl?');
      expect(adminManagementSource).toContain('/accounting/report/cashflow?');
      expect(adminManagementSource).toContain('Management P&L');
    },
  );
});
