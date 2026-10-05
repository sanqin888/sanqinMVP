import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const root = resolve(__dirname);
const read = (name: string) => readFileSync(resolve(root, name), 'utf8');

describe('Accounting Opening Receivable architecture boundary', () => {
  it('keeps G1 inside Accounting and out of External Sale settlement persistence', () => {
    const service = read('accounting-opening-receivable.service.ts');
    const authority = read(
      'accounting-opening-receivable-journal-authority.ts',
    );
    const contract = read('accounting-opening-receivable.contract.ts');
    const schema = read('../../prisma/schema.prisma');

    expect(service).toContain('AccountingOpeningReceivableService');
    expect(service).toContain('runSerializableAccountingWrite');
    expect(service).toContain('createOpeningReceivableJournalInTx');
    expect(service).toContain('OPENING_RECEIVABLE_POST');
    expect(service).not.toContain('AccountingExternalSaleSettlementService');
    expect(service).not.toContain('accountingExternalSaleSettlement');
    expect(service).not.toContain("from '../orders/");
    expect(service).not.toContain("from '../payments/");
    expect(service).not.toContain("from '../integrations/");

    expect(authority).toContain('AccountingJournalEntryKind.OPENING_BALANCE');
    expect(authority).toContain(
      'ACCOUNTING_OPENING_RECEIVABLE_AR_ACCOUNT_STABLE_ID',
    );
    expect(authority).toContain(
      'ACCOUNTING_OPENING_BALANCE_EQUITY_ACCOUNT_STABLE_ID',
    );
    expect(contract).toContain('account_accounts_receivable');
    expect(contract).toContain('account_opening_balance_equity');
    expect(authority).not.toContain('account_sales_revenue');
    expect(authority).not.toContain('account_hst_payable');

    expect(schema).toContain('model AccountingOpeningReceivable');
    expect(schema).toContain(
      'externalSaleId        String                           @db.Uuid',
    );
  });

  it('does not expose arbitrary opening dates or generic Journal writes', () => {
    const contract = read('accounting-opening-receivable.contract.ts');
    const controller = read('accounting-opening-receivable.controller.ts');
    const journal = read('accounting-journal.service.ts');
    const createInput =
      contract
        .split('export type CreateAccountingOpeningReceivableInputV1 = {')[1]
        ?.split('};')[0] ?? '';

    expect(createInput).toContain('requestId');
    expect(createInput).not.toContain('openingDate');
    expect(controller).toContain("@Post('opening-receivables')");
    expect(controller).toContain("@Roles('ADMIN', 'ACCOUNTANT')");
    expect(journal).toContain(
      'Opening Receivable Journals require opening-receivable-specific write authority',
    );
  });
});
