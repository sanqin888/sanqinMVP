import { resolve } from 'node:path';

import { scanTypeScript } from '../test/architecture-test.utils';

const API_SRC_ROOT = resolve(__dirname, '..');
const ACCOUNTING_ROOT = resolve(API_SRC_ROOT, 'accounting');

const file = (suffix: string) =>
  scanTypeScript(ACCOUNTING_ROOT).find(({ path }) => path.endsWith(suffix));

describe('B3-A canonical Trial Balance boundary', () => {
  it('keeps Trial Balance money exclusively on canonical Accounting Journal lines', () => {
    const service = file('accounting-trial-balance.service.ts')?.source ?? '';
    const policy = file('accounting-trial-balance.policy.ts')?.source ?? '';

    expect(service).toContain('ACCOUNTING_DB');
    expect(service).toContain('accountingJournalLine.findMany');
    expect(service).toContain('AccountingPeriodService');
    expect(service).toContain('projectAccountingTrialBalance');
    expect(policy).toContain('AccountingJournalEntryKind.OPENING_BALANCE');
    expect(policy).toContain('accountingTrialBalanceNormalSide');

    expect(service).not.toContain('AccountingFinancialReportsService');
    expect(service).not.toContain('readProjection(');
    expect(service).not.toContain('includeFundedExpensesInManagementReports');
    expect(service).not.toContain('accountingExpenseDocument');
    expect(service).not.toContain('AccountingExpensePaymentAllocation');
    expect(service).not.toContain("from '../orders/");
    expect(service).not.toContain("from '../payments/");
    expect(service).not.toContain("from '../loyalty/");
    expect(service).not.toContain("from '../integrations/");
  });

  it('pins whole-ledger per-currency scope without a store filter', () => {
    const service = file('accounting-trial-balance.service.ts')?.source ?? '';
    const contract = file('accounting-trial-balance.contract.ts')?.source ?? '';

    expect(contract).toContain("scope: 'WHOLE_LEDGER'");
    expect(contract).toContain('AccountingTrialBalanceNormalSideV1');
    expect(contract).toContain('openingBalanceJournal');
    expect(contract).toContain('closeStatus');
    expect(service).toContain("|| 'CAD'");
    expect(service).not.toContain('storeStableId');
  });

  it('registers the B3-A core inside Accounting without adding a transport adapter', () => {
    const module = file('accounting.module.ts')?.source ?? '';
    const reportsController =
      file('accounting-reports.controller.ts')?.source ?? '';

    expect(module).toContain('AccountingTrialBalanceService');
    expect(reportsController).not.toContain('report/trial-balance');
  });
});
