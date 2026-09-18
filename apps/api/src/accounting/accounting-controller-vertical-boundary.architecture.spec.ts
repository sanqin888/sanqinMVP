import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs';
import { relative, resolve } from 'node:path';

const ACCOUNTING_ROOT = resolve(__dirname);

const EXPECTED_CONTROLLER_CAPABILITIES = {
  'accounting-audit.controller.ts': ['AccountingService'],
  'accounting-automation.controller.ts': ['AccountingAutomationScheduler'],
  'accounting-canonical-change.controller.ts': [
    'AccountingCanonicalChangeExecutionService',
    'AccountingCanonicalChangePreviewService',
  ],
  'accounting-canonical-sale.controller.ts': [
    'AccountingCanonicalSaleReplayService',
  ],
  'accounting-chart.controller.ts': ['AccountingChartService'],
  'accounting-expense.controller.ts': ['AccountingExpenseService'],
  'accounting-inbox-artifacts.controller.ts': [
    'AccountingImageRetentionService',
    'AccountingInboxAcquisitionService',
  ],
  'accounting-inbox.controller.ts': ['AccountingInboxService'],
  'accounting-period.controller.ts': ['AccountingPeriodService'],
  'payroll/accounting-payroll.controller.ts': [
    'AccountingPayrollConfigService',
    'AccountingPayrollCraRemittanceService',
    'AccountingPayrollEmployeePaymentService',
    'AccountingPayrollEmployeeService',
    'AccountingPayrollFinalizationService',
    'AccountingPayrollOpeningService',
    'AccountingPayrollPayStatementService',
    'AccountingPayrollPostingService',
    'AccountingPayrollRunService',
    'AccountingPayrollYtdService',
  ],
  'accounting-provider-financial.controller.ts': [
    'AccountingProviderFinancialService',
  ],
  'accounting-provider-settlement.controller.ts': [
    'AccountingProviderSettlementExecutionService',
    'AccountingProviderSettlementPreviewService',
  ],
  'accounting-reports.controller.ts': [
    'AccountingFinancialReportsService',
    'AccountingService',
  ],
} as const;

const EXPECTED_ROUTES = [
  'POST setup/initialize',
  'GET dashboard',
  'POST expenses',
  'GET expenses',
  'GET inbox',
  'GET inbox/image-retention/pending',
  'GET inbox/manual-uploads',
  'POST inbox/artifacts',
  'GET inbox/provider-recognition-rules',
  'PUT inbox/provider-recognition-rules/:ruleStableId',
  'GET inbox/trusted-senders',
  'PUT inbox/trusted-senders',
  'PUT inbox/:inboxItemStableId/classification',
  'POST inbox/:inboxItemStableId/other/confirm',
  'POST inbox/:inboxItemStableId/expense/confirm',
  'POST inbox/:inboxItemStableId/image-retention/candidate',
  'DELETE inbox/:inboxItemStableId/image-retention/candidate',
  'POST inbox/:inboxItemStableId/image-retention/accept',
  'GET inbox/artifacts/:artifactStableId/content',
  'POST inbox/:inboxItemStableId/provider-financial/confirm',
  'DELETE inbox/manual-uploads/:inboxItemStableId/permanent',
  'DELETE inbox/:inboxItemStableId',
  'GET files/:kind/:fileName',
  'POST automation/run',
  'GET automation/settings',
  'PUT automation/settings',
  'GET automation/uber-reports',
  'POST period-close/month/:periodKey',
  'DELETE period-close/month/:periodKey',
  'GET period-close/month',
  'POST period-close/year/:periodKey',
  'GET period-close/year',
  'GET report/pnl',
  'GET journal/canonical-sales/replay-preview',
  'GET journal/canonical-changes/shadow-preview',
  'GET journal/provider-settlement/shadow-preview',
  'POST journal/provider-settlement/replay',
  'POST journal/canonical-changes/replay',
  'POST journal/canonical-sales/replay',
  'POST accounts',
  'GET accounts',
  'GET report/account-balance',
  'GET report/annual/:year',
  'GET report/cashflow',
  'GET report/slice',
  'GET audit-logs',
  'GET export/tx.csv',
  'GET export/report.csv',
  'GET export/report.pdf',
  'GET categories',
  'POST categories',
  'PUT categories/:categoryStableId',
  'GET payroll/employers',
  'POST payroll/employers',
  'PUT payroll/employers/:employerStableId',
  'GET payroll/employers/:employerStableId/configs',
  'POST payroll/employers/:employerStableId/configs',
  'GET payroll/employers/:employerStableId/cra-remittances/preview',
  'GET payroll/employers/:employerStableId/employees',
  'POST payroll/employers/:employerStableId/employees',
  'PUT payroll/employees/:employeeStableId',
  'GET payroll/employees/:employeeStableId/configs',
  'POST payroll/employees/:employeeStableId/configs',
  'GET payroll/employees/:employeeStableId/openings/:taxYear',
  'PUT payroll/employees/:employeeStableId/openings/:taxYear',
  'GET payroll/employees/:employeeStableId/ytd/:taxYear',
  'GET payroll/runs',
  'POST payroll/runs',
  'GET payroll/runs/:runStableId',
  'PUT payroll/runs/:runStableId',
  'POST payroll/runs/:runStableId/calculate',
  'POST payroll/runs/:runStableId/approve',
  'POST payroll/runs/:runStableId/post',
  'GET payroll/runs/:runStableId/employee-payment',
  'POST payroll/runs/:runStableId/employee-payment',
  'GET payroll/runs/:runStableId/pay-statement.pdf',
  'POST payroll/runs/:runStableId/void',
].sort();

function read(name: string): string {
  return readFileSync(resolve(ACCOUNTING_ROOT, name), 'utf8');
}

function controllerFiles(root = ACCOUNTING_ROOT): string[] {
  const controllers: string[] = [];
  for (const name of readdirSync(root)) {
    const path = resolve(root, name);
    if (statSync(path).isDirectory()) {
      controllers.push(...controllerFiles(path));
      continue;
    }
    if (name.endsWith('.controller.ts')) {
      controllers.push(relative(ACCOUNTING_ROOT, path).replaceAll('\\', '/'));
    }
  }
  return controllers.sort();
}

const ACCOUNTING_CAPABILITY_PATTERN =
  /\bAccounting(?:[A-Z][A-Za-z]+)?(?:Service|Scheduler)\b/g;

function accountingCapabilities(source: string): string[] {
  return [
    ...new Set(
      [...source.matchAll(ACCOUNTING_CAPABILITY_PATTERN)].map(
        (match) => match[0],
      ),
    ),
  ].sort();
}

function routes(source: string): string[] {
  return [...source.matchAll(/@(Get|Post|Put|Delete)\('([^']+)'\)/g)].map(
    ([, method, route]) => `${method.toUpperCase()} ${route}`,
  );
}

describe('Phase 9 Accounting controller vertical boundary', () => {
  it('replaces the god controller with explicit vertical transport adapters', () => {
    expect(
      existsSync(resolve(ACCOUNTING_ROOT, 'accounting.controller.ts')),
    ).toBe(false);

    const expectedFiles = Object.keys(EXPECTED_CONTROLLER_CAPABILITIES).sort();
    expect(controllerFiles()).toEqual(expectedFiles);

    for (const [name, expectedCapabilities] of Object.entries(
      EXPECTED_CONTROLLER_CAPABILITIES,
    )) {
      const source = read(name);
      expect(source).toContain("@Controller('accounting')");
      expect(source).toContain('@UseGuards(SessionAuthGuard, RolesGuard)');
      expect(source).toContain("@Roles('ADMIN', 'ACCOUNTANT')");
      expect(source).toMatch(/from '\.\.\/(?:\.\.\/)*auth\/public-api'/);
      expect(source).not.toContain('@prisma/client');
      expect(source).not.toContain('../prisma/');
      expect(accountingCapabilities(source)).toEqual(
        [...expectedCapabilities].sort(),
      );
    }
  });

  it('preserves the complete authenticated Accounting HTTP route set exactly once', () => {
    const actualRoutes = controllerFiles()
      .flatMap((name) => routes(read(name)))
      .sort();

    expect(actualRoutes).toEqual(EXPECTED_ROUTES);
    expect(new Set(actualRoutes).size).toBe(actualRoutes.length);
  });

  it('keeps one AccountingModule composition root without reintroducing a broad controller facade', () => {
    const module = read('accounting.module.ts');

    expect(module).not.toContain('AccountingController');
    for (const name of Object.keys(EXPECTED_CONTROLLER_CAPABILITIES)) {
      const source = read(name);
      const className =
        source.match(/export class (Accounting[A-Za-z]+Controller)/)?.[1] ?? '';
      expect(className).not.toBe('');
      expect(module).toContain(className);
    }

    const productionSources = readdirSync(ACCOUNTING_ROOT)
      .filter(
        (name) =>
          name.endsWith('.ts') &&
          !name.endsWith('.spec.ts') &&
          !name.endsWith('.test.ts'),
      )
      .map((name) => read(name))
      .join('\n');
    expect(productionSources).not.toContain('AccountingOperationsService');
  });
});
