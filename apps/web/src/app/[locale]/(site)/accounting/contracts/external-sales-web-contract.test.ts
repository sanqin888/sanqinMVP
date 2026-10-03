import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const ACCOUNTING_ROOT = resolve(__dirname, '..');
const WEB_ROOT = resolve(ACCOUNTING_ROOT, 'external-sales');

const page = readFileSync(resolve(WEB_ROOT, 'page.tsx'), 'utf8');
const saleForm = readFileSync(
  resolve(WEB_ROOT, 'external-sale-create-form.tsx'),
  'utf8',
);
const saleEditors = readFileSync(
  resolve(WEB_ROOT, 'external-sale-form-editors.tsx'),
  'utf8',
);
const settlementForm = readFileSync(
  resolve(WEB_ROOT, 'external-sale-settlement-form.tsx'),
  'utf8',
);
const settlementEditors = readFileSync(
  resolve(WEB_ROOT, 'external-sale-settlement-editors.tsx'),
  'utf8',
);
const detail = readFileSync(
  resolve(WEB_ROOT, 'external-sale-detail.tsx'),
  'utf8',
);
const contract = readFileSync(resolve(__dirname, 'external-sales.ts'), 'utf8');
const shell = readFileSync(
  resolve(process.cwd(), 'src', 'components', 'staff', 'AccountingShell.tsx'),
  'utf8',
);

describe('External Sales Accounting Web authority boundary', () => {
  it('uses Accounting read models for history, options, outstanding AR and detail', () => {
    expect(page).toContain("'/accounting/external-sales?limit=100'");
    expect(page).toContain(
      "'/accounting/external-sales/settlements?limit=100'",
    );
    expect(page).toContain("'/accounting/external-sales/options'");
    expect(page).toContain('/accounting/external-sales/');
    expect(page).toContain('/accounting/audit-logs?entityType=');
    expect(page).toContain('sale.outstandingCents');
    expect(page).toContain("from '../contracts/external-sales'");
  });

  it('keeps canonical account eligibility out of browser source', () => {
    for (const source of [
      page,
      saleForm,
      saleEditors,
      settlementForm,
      settlementEditors,
      detail,
      contract,
    ]) {
      expect(source).not.toContain("'account_sales_revenue'");
      expect(source).not.toContain("'account_hst_payable'");
      expect(source).not.toContain("'account_commission_expense'");
      expect(source).not.toContain("'account_primary_bank'");
    }

    expect(saleEditors).toContain('options.sale.lineRevenueAccounts');
    expect(saleEditors).toContain('options.sale.positiveAdjustmentAccounts');
    expect(saleEditors).toContain('options.sale.negativeAdjustmentAccounts');
    expect(settlementEditors).toContain(
      'options.settlement.collectionAccounts',
    );
    expect(settlementEditors).toContain(
      'Explicitly choose BANK / CASH',
    );
  });

  it('orchestrates C1/C2/C3 writes without browser Journal construction', () => {
    expect(saleForm).toContain("'/accounting/external-sales'");
    expect(settlementForm).toContain(
      "'/accounting/external-sales/settlements'",
    );
    expect(detail).toContain('/reverse');
    expect(detail).toContain('reversal reason');
    expect(contract).toContain('replacementForExternalSaleStableId');
    expect(contract).toContain('replacementForSettlementStableId');

    for (const source of [page, saleForm, settlementForm, detail]) {
      expect(source).not.toContain('createJournal');
      expect(source).not.toContain('JournalEntryCreate');
    }
  });

  it('adds an Accounting navigation entry without moving External Sales ownership into Web', () => {
    expect(shell).toContain('/external-sales');
    expect(shell).toContain("labelEn: 'External sales'");
    expect(page).toContain(
      'Amounts, receivables, account eligibility, reversals and Journals remain Accounting-owned.',
    );
  });
});
