import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const ACCOUNTING_ROOT = resolve(__dirname, '..');
const inboxModelSource = readFileSync(
  resolve(ACCOUNTING_ROOT, 'inbox', 'inbox-model.ts'),
  'utf8',
);
const inboxPageSource = readFileSync(
  resolve(ACCOUNTING_ROOT, 'inbox', 'page.tsx'),
  'utf8',
);
const expensePageSource = readFileSync(
  resolve(ACCOUNTING_ROOT, 'expenses', 'page.tsx'),
  'utf8',
);
const settlementsPageSource = readFileSync(
  resolve(ACCOUNTING_ROOT, 'settlements', 'page.tsx'),
  'utf8',
);
const settlementReplayGateSource = readFileSync(
  resolve(ACCOUNTING_ROOT, 'settlements', 'settlement-replay-gate.tsx'),
  'utf8',
);
const settlementReplayPolicySource = readFileSync(
  resolve(ACCOUNTING_ROOT, 'settlements', 'settlement-replay-policy.ts'),
  'utf8',
);

describe('Phase 9 Slice 8B-B Accounting Web vertical contracts', () => {
  it('keeps Inbox wire DTOs outside the Inbox UI model', () => {
    expect(inboxModelSource).toContain("from '../contracts/inbox'");
    expect(inboxModelSource).not.toContain('export type AccountingInboxItem');
    expect(inboxModelSource).not.toContain('export type AccountingFinancialProvider');
    expect(inboxModelSource).not.toContain('export type AccountingCategory');
    expect(inboxModelSource).not.toContain('export type AccountingAccount');
    expect(inboxPageSource).toContain("from '../contracts/inbox'");
    expect(inboxPageSource).toContain("from '../contracts/chart'");
  });

  it('makes Expenses consume Accounting chart and expense wire contracts', () => {
    expect(expensePageSource).toContain("from '../contracts/chart'");
    expect(expensePageSource).toContain("from '../contracts/expenses'");
    expect(expensePageSource).not.toContain('type Category =');
    expect(expensePageSource).not.toContain('type Account =');
    expect(expensePageSource).not.toContain('type ExpenseDocument =');
  });

  it('removes Settlement dependency on Inbox UI models and the old settlement model', () => {
    for (const source of [
      settlementsPageSource,
      settlementReplayGateSource,
      settlementReplayPolicySource,
    ]) {
      expect(source).not.toContain('inbox/inbox-model');
      expect(source).not.toContain('settlement-model');
    }

    expect(settlementsPageSource).toContain(
      "from '../contracts/provider-financial'",
    );
    expect(settlementsPageSource).toContain("from '../contracts/settlements'");
    expect(settlementReplayGateSource).toContain(
      "from '../contracts/settlements'",
    );
    expect(settlementReplayPolicySource).toContain(
      "from '../contracts/settlements'",
    );
    expect(
      existsSync(resolve(ACCOUNTING_ROOT, 'settlements', 'settlement-model.ts')),
    ).toBe(false);
  });
});
