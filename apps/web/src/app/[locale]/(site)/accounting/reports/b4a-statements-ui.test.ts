import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const REPORTS_ROOT = __dirname;
const ACCOUNTING_ROOT = resolve(REPORTS_ROOT, '..');

const pageSource = readFileSync(resolve(REPORTS_ROOT, 'page.tsx'), 'utf8');
const statementsSource = readFileSync(
  resolve(REPORTS_ROOT, 'accounting-statements.tsx'),
  'utf8',
);
const contractsSource = readFileSync(
  resolve(ACCOUNTING_ROOT, 'contracts', 'reports.ts'),
  'utf8',
);

describe('B4-A Accounting statements UI boundary', () => {
  it('cuts the Reports UI to the canonical B3 statement endpoints', () => {
    expect(pageSource).toContain('/accounting/report/trial-balance?');
    expect(pageSource).toContain('/accounting/report/balance-movement?');
    expect(pageSource).not.toContain('/accounting/report/account-balance');
    expect(pageSource).not.toContain('AccountingAccountBalanceReport');
    expect(contractsSource).not.toContain(
      'export type AccountingAccountBalanceReport',
    );
  });

  it(
    'keeps Trial Balance and Balance Movement wire DTOs on the Web contract surface',
    () => {
      expect(contractsSource).toContain(
        'export type AccountingTrialBalanceReport',
      );
      expect(contractsSource).toContain(
        'export type AccountingBalanceMovementReport',
      );
      expect(contractsSource).toContain("scope: 'WHOLE_LEDGER'");
      expect(contractsSource).toContain('absoluteBalanceClaim: false');
      expect(pageSource).toContain("from '../contracts/reports'");
      expect(pageSource).not.toContain('type AccountingTrialBalanceReport =');
      expect(pageSource).not.toContain(
        'type AccountingBalanceMovementReport =',
      );
    },
  );

  it('keeps the zero-opening and non-Balance-Sheet disclosure visible', () => {
    expect(statementsSource).toContain('zeroOpeningDisclaimerRequired');
    expect(statementsSource).toContain('不代表现实银行、现金或其他账户的绝对余额');
    expect(statementsSource).toContain(
      'not presented as a formal Balance Sheet',
    );
  });

  it('keeps Accounting Reports statement-only after DATA-F', () => {
    expect(pageSource).toContain('Accounting Statements');
    expect(pageSource).toContain('Trial Balance');
    expect(pageSource).toContain('Balance Movement');
    expect(pageSource).not.toContain('/accounting/report/pnl?');
    expect(pageSource).not.toContain('/accounting/report/cashflow?');
    expect(pageSource).not.toContain('Management P&L');
    expect(pageSource).not.toContain('Management scope');
  });
});
