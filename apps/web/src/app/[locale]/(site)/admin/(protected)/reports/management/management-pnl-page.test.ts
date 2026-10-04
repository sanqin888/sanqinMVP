import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const pageSource = readFileSync(resolve(__dirname, 'page.tsx'), 'utf8');
const clientSource = readFileSync(
  resolve(
    __dirname,
    '../../../../../../../features/admin/management-pnl/ManagementPnlPageClient.tsx',
  ),
  'utf8',
);
const reportViewSource = readFileSync(
  resolve(
    __dirname,
    '../../../../../../../features/admin/management-pnl/ManagementPnlReportView.tsx',
  ),
  'utf8',
);
const adminShellSource = readFileSync(
  resolve(
    __dirname,
    '../../../../../../../components/staff/AdminShell.tsx',
  ),
  'utf8',
);
const sharedContractSource = readFileSync(
  resolve(
    __dirname,
    '../../../../../../../lib/contracts/accounting-management.ts',
  ),
  'utf8',
);
const accountingContractSource = readFileSync(
  resolve(
    __dirname,
    '../../../../accounting/contracts/reports.ts',
  ),
  'utf8',
);
const accountingReportsPageSource = readFileSync(
  resolve(__dirname, '../../../../accounting/reports/page.tsx'),
  'utf8',
);

describe('Admin DATA-D Management P&L UI contract', () => {
  it('consumes only existing Accounting-owned Management P&L and Cash Movement reads', () => {
    expect(pageSource).toContain('ManagementPnlPageClient');
    expect(clientSource).toContain('/accounting/report/pnl?');
    expect(clientSource).toContain('/accounting/report/cashflow?');
    expect(clientSource).not.toContain('storeStableId');
    expect(clientSource).not.toContain('useSearchParams');
    expect(clientSource).not.toContain('AdminStoreContextSelector');
    expect(clientSource).not.toContain('/(site)/accounting/');
    expect(clientSource).not.toContain('/orders');
    expect(clientSource).not.toContain('/expenses');
    expect(clientSource).not.toContain('/accounting/journal');
  });

  it('keeps Management browser DTOs shared while Accounting retains a compatible re-export', () => {
    expect(sharedContractSource).toContain(
      'export type AccountingPnlReport',
    );
    expect(sharedContractSource).toContain(
      'export type AccountingCashflowReport',
    );
    expect(accountingContractSource).toContain(
      "from '@/lib/contracts/accounting-management'",
    );
  });

  it('adds a whole-ledger Data destination without preserving Store context', () => {
    const managementStart = adminShellSource.indexOf(
      "href: `${adminRoot}/reports/management`",
    );
    const behaviorStart = adminShellSource.indexOf(
      "href: `${adminRoot}/analytics`",
      managementStart,
    );
    const managementItem = adminShellSource.slice(managementStart, behaviorStart);

    expect(managementStart).toBeGreaterThan(-1);
    expect(behaviorStart).toBeGreaterThan(managementStart);
    expect(managementItem).toContain("labelEn: 'Management P&L'");
    expect(managementItem).not.toContain('preserveStoreContext');
    expect(adminShellSource).toContain(
      'activeNavigationItem?.preserveStoreContext === true',
    );
  });

  it('makes whole-business scope and the Cash Movement limitation explicit', () => {
    expect(clientSource).toContain('Whole-business / whole-ledger management view');
    expect(reportViewSource).toContain(
      'Whole-business / whole-ledger management scope',
    );
    expect(reportViewSource).toContain('Journal-only management aid');
    expect(reportViewSource).toContain(
      'not a formal Statement of Cash Flows',
    );
  });

  it('does not reproduce Accounting financial arithmetic in Admin', () => {
    expect(clientSource).not.toContain('Prisma');
    expect(clientSource).not.toContain('netProfitCents =');
    expect(reportViewSource).not.toContain(
      'incomeCents - report.summary.expenseCents',
    );
    expect(reportViewSource).not.toContain(
      'row.revenueNetCents - row.expenseNetCents',
    );
  });

  it('preserves the existing Management date/group/export capability', () => {
    for (const preset of ["'month'", "'lastMonth'", "'quarter'", "'year'"]) {
      expect(clientSource).toContain(`setPreset(${preset})`);
    }
    for (const groupBy of ['month', 'quarter', 'year']) {
      expect(clientSource).toContain(`<option value="${groupBy}">`);
    }
    expect(clientSource).toContain('type="date"');
    expect(clientSource).toContain('/api/v1/accounting/export/report.pdf?');
    expect(clientSource).toContain('/api/v1/accounting/export/report.csv?');
  });

  it('uses distinct presentation colors for P&L trend series', () => {
    expect(reportViewSource).toContain('MANAGEMENT_PNL_CHART_COLORS.income');
    expect(reportViewSource).toContain('MANAGEMENT_PNL_CHART_COLORS.expenses');
    expect(reportViewSource).toContain('MANAGEMENT_PNL_CHART_COLORS.netProfit');
  });

  it(
    'keeps Management in Admin while Accounting Reports contracts to canonical statements',
    () => {
      expect(clientSource).toContain('Management P&L');
      expect(accountingReportsPageSource).not.toContain('Management P&L');
      expect(accountingReportsPageSource).toContain('Trial Balance');
      expect(accountingReportsPageSource).toContain('Balance Movement');
    },
  );

  it('reuses existing Management export contracts without Store scope', () => {
    expect(clientSource).toContain('/api/v1/accounting/export/report.pdf?');
    expect(clientSource).toContain('/api/v1/accounting/export/report.csv?');
    expect(clientSource).toContain("template: 'MANAGEMENT'");
    expect(clientSource).not.toContain('store=');
  });
});
