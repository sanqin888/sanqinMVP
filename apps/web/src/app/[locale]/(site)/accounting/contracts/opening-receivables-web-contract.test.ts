import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const ACCOUNTING_ROOT = resolve(__dirname, '..');
const WEB_ROOT = resolve(ACCOUNTING_ROOT, 'opening-receivables');

const page = readFileSync(resolve(WEB_ROOT, 'page.tsx'), 'utf8');
const createForm = readFileSync(
  resolve(WEB_ROOT, 'opening-receivable-create-form.tsx'),
  'utf8',
);
const settlementForm = readFileSync(
  resolve(WEB_ROOT, 'opening-receivable-settlement-form.tsx'),
  'utf8',
);
const detail = readFileSync(
  resolve(WEB_ROOT, 'opening-receivable-detail.tsx'),
  'utf8',
);
const contract = readFileSync(
  resolve(__dirname, 'opening-receivables.ts'),
  'utf8',
);
const shell = readFileSync(
  resolve(process.cwd(), 'src', 'components', 'staff', 'AccountingShell.tsx'),
  'utf8',
);

describe('Opening Receivables Accounting Web authority boundary', () => {
  it('uses Accounting-owned history, options, detail and audit read models', () => {
    expect(page).toContain(
      "'/accounting/opening-receivables?limit=100'",
    );
    expect(page).toContain(
      "'/accounting/opening-receivables/options'",
    );
    expect(page).toContain('/accounting/opening-receivables/');
    expect(page).toContain('/accounting/audit-logs?entityType=');
    expect(page).toContain('outstandingAmountCents');
    expect(page).toContain("from '../contracts/opening-receivables'");
  });

  it('uses backend-provided collection account options without browser GL defaults', () => {
    expect(settlementForm).toContain('options.collectionAccounts');
    expect(settlementForm).toContain(
      'explicitly selected from backend-approved active CAD BANK/CASH accounts',
    );

    for (const source of [
      page,
      createForm,
      settlementForm,
      detail,
      contract,
    ]) {
      expect(source).not.toContain("'account_primary_bank'");
      expect(source).not.toContain("'account_accounts_receivable'");
      expect(source).not.toContain("'account_opening_balance_equity'");
      expect(source).not.toContain("'account_sales_revenue'");
      expect(source).not.toContain("'account_hst_payable'");
    }
  });

  it('orchestrates G1/G2/G3 writes without browser Journal construction or in-place edits', () => {
    expect(createForm).toContain("'/accounting/opening-receivables'");
    expect(settlementForm).toContain(
      "'/accounting/opening-receivables/settlements'",
    );
    expect(detail).toContain('/reverse');
    expect(createForm).toContain(
      'replacementForOpeningReceivableStableId',
    );
    expect(settlementForm).toContain('replacementForSettlementStableId');

    for (const source of [page, createForm, settlementForm, detail, contract]) {
      expect(source).not.toContain('createJournal');
      expect(source).not.toContain('JournalEntryCreate');
      expect(source).not.toContain('updateOpeningReceivable');
      expect(source).not.toContain('updateSettlement');
    }
  });

  it('adds a dedicated Accounting navigation entry rather than moving ownership into Web', () => {
    expect(shell).toContain('/opening-receivables');
    expect(shell).toContain("labelEn: 'Opening receivables'");
    expect(page).toContain(
      'Amounts, outstanding balance, collection account, reversals and Journals remain Accounting-owned',
    );
  });
});
