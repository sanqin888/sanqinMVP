import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

describe('Accounting Settings expense funding policy UX', () => {
  it('exposes the account policy on create and existing-account update without implementing EFA-D filtering', () => {
    const source = readFileSync(resolve(__dirname, 'page.tsx'), 'utf8');

    expect(source).toContain(
      'includeNewAccountFundedExpensesInManagementReports',
    );
    expect(source).toContain(
      'includeFundedExpensesInManagementReports:',
    );
    expect(source).toContain(
      '/expense-management-policy',
    );
    expect(source).toContain(
      '计入管理报表费用',
    );
    expect(source).toContain(
      '不会删除 Journal、账户流水、实际现金流或 HST 事实',
    );
    expect(source).not.toContain('/accounting/report/profit');
    expect(source).not.toContain('/accounting/report/pnl');
  });
});
