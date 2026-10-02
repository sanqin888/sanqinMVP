import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const ACCOUNTING_ROOT = resolve(__dirname, '..');
const pageSource = readFileSync(resolve(__dirname, 'page.tsx'), 'utf8');

describe('Accounting Funds account-transfer workflow', () => {
  it('keeps account selection explicit and posts through the dedicated transfer API', () => {
    expect(pageSource).toContain('/accounting/account-transfers');
    expect(pageSource).toContain("setFromAccountStableId('')");
    expect(pageSource).toContain("setToAccountStableId('')");
    expect(pageSource).toContain('ACCOUNT_ATTRIBUTION_CORRECTION');
    expect(pageSource).toContain('canonical Journal');
  });

  it('does not auto-select a money-moving account in Accounting workflows', () => {
    const files = [
      'inbox/bank-csv-review-panel.tsx',
      'settlements/provider-fee-bank-withdrawal-panel.tsx',
      'settlements/provider-payout-panel.tsx',
      'settlements/provider-payout-settlement-bank-csv-panel.tsx',
      'payroll/payroll-employee-payment-panel.tsx',
      'payroll/payroll-cra-remittance-panel.tsx',
    ];

    for (const file of files) {
      const source = readFileSync(resolve(ACCOUNTING_ROOT, file), 'utf8');
      expect(source).not.toContain('eligibleBanks[0]?.accountStableId');
      expect(source).not.toContain("eligible.find((account) => account.type === 'BANK')");
      expect(source).not.toMatch(
        /find\(\s*\(account\)\s*=>[\s\S]{0,160}account\.type\s*===\s*'BANK'[\s\S]{0,160}\)\?\.accountStableId/,
      );
    }
  });
});
