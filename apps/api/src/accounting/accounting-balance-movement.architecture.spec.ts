import { resolve } from 'node:path';

import { scanTypeScript } from '../test/architecture-test.utils';

const API_SRC_ROOT = resolve(__dirname, '..');
const ACCOUNTING_ROOT = resolve(API_SRC_ROOT, 'accounting');

const file = (suffix: string) =>
  scanTypeScript(ACCOUNTING_ROOT).find(({ path }) => path.endsWith(suffix));

describe('B3-C Balance Movement boundary', () => {
  it('derives only from the canonical B3-A Trial Balance contract', () => {
    const service =
      file('accounting-balance-movement.service.ts')?.source ?? '';
    const policy = file('accounting-balance-movement.policy.ts')?.source ?? '';

    expect(service).toContain('AccountingTrialBalanceService');
    expect(service).toContain('projectAccountingBalanceMovement');
    expect(service).not.toContain('ACCOUNTING_DB');
    expect(service).not.toContain('Prisma');
    expect(service).not.toContain('AccountingFinancialReportsService');
    expect(service).not.toContain('readProjection(');
    expect(service).not.toContain('accountingExpenseDocument');
    expect(service).not.toContain('../orders/');
    expect(policy).not.toContain('Prisma');
    expect(policy).not.toContain('readProjection(');
    expect(policy).not.toContain('includeFundedExpensesInManagementReports');
    expect(policy).not.toContain('AccountingFinancialReportsService');
  });

  it('keeps the HTTP route transport-only and under the existing Accounting guards', () => {
    const module = file('accounting.module.ts')?.source ?? '';
    const reportsController =
      file('accounting-reports.controller.ts')?.source ?? '';
    const routeStart = reportsController.indexOf(
      "@Get('report/balance-movement')",
    );
    const nextRoute = reportsController.indexOf('@Get(', routeStart + 1);
    const routeSource = reportsController.slice(
      routeStart,
      nextRoute === -1 ? undefined : nextRoute,
    );

    expect(module).toContain('AccountingBalanceMovementService');
    expect(routeStart).toBeGreaterThanOrEqual(0);
    expect(reportsController).toContain(
      '@UseGuards(SessionAuthGuard, RolesGuard)',
    );
    expect(reportsController).toContain("@Roles('ADMIN', 'ACCOUNTANT')");
    expect(routeSource).toContain(
      'this.balanceMovement.project({ from, to, currency })',
    );
    expect(routeSource).not.toContain('Prisma');
    expect(routeSource).not.toContain('this.reports.');
    expect(routeSource).not.toContain('readProjection(');
    expect(routeSource).not.toContain('accountingExpenseDocument');
    expect(routeSource).not.toContain('../orders/');
  });

  it('keeps B4 presentation/export work out of B3-C', () => {
    const service =
      file('accounting-balance-movement.service.ts')?.source ?? '';
    const policy = file('accounting-balance-movement.policy.ts')?.source ?? '';
    const controller = file('accounting-reports.controller.ts')?.source ?? '';

    expect(service).not.toContain('csv');
    expect(service).not.toContain('pdf');
    expect(policy).not.toContain('csv');
    expect(policy).not.toContain('pdf');
    expect(controller).not.toContain('export/balance-movement');
  });
});
