import { resolve } from 'node:path';

import { scanTypeScript } from '../test/architecture-test.utils';

const API_SRC_ROOT = resolve(__dirname, '..');
const ACCOUNTING_ROOT = resolve(API_SRC_ROOT, 'accounting');

const file = (suffix: string) =>
  scanTypeScript(ACCOUNTING_ROOT).find(({ path }) => path.endsWith(suffix));

describe('B4-C statement Journal drill-through boundary', () => {
  it('reuses the canonical Trial Balance statement scope instead of rebuilding date semantics', () => {
    const service =
      file('accounting-statement-drill-through.service.ts')?.source ?? '';

    expect(service).toContain('AccountingTrialBalanceService');
    expect(service).toContain('resolveStatementScope');
    expect(service).toContain('ACCOUNTING_DB');
    expect(service).toContain('AccountingJournalEntryKind.OPENING_BALANCE');
  });

  it('reads only Accounting-owned Journal/account data and exposes source identity without owner lookups', () => {
    const service =
      file('accounting-statement-drill-through.service.ts')?.source ?? '';

    expect(service).toContain('accountingJournalEntry');
    expect(service).toContain('accountingAccount');
    expect(service).toContain('sourceFactType');
    expect(service).toContain('sourceFactStableId');
    expect(service).not.toContain('../orders/');
    expect(service).not.toContain('../payments/');
    expect(service).not.toContain('../integrations/');
    expect(service).not.toContain('AccountingProviderPayoutService');
    expect(service).not.toContain('AccountingProviderSettlementQueryService');
    expect(service).not.toContain('AccountingExpenseService');
    expect(service).not.toContain('AccountingPayroll');
  });

  it('keeps the authenticated route transport-only', () => {
    const controller = file('accounting-reports.controller.ts')?.source ?? '';

    expect(controller).toContain("@Get('report/statement-journals')");
    expect(controller).toContain('this.statementDrillThrough.read');
    expect(controller).not.toContain('accountingJournalEntry');
    expect(controller).not.toContain('@prisma/client');
  });
});
