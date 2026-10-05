import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const root = resolve(__dirname);
const read = (name: string) => readFileSync(resolve(root, name), 'utf8');

describe('Accounting Opening Receivable settlement architecture boundary', () => {
  it('uses dedicated Accounting persistence and leaves External Sale C2 allocations non-polymorphic', () => {
    const service = read('accounting-opening-receivable-settlement.service.ts');
    const authority = read(
      'accounting-opening-receivable-settlement-journal-authority.ts',
    );
    const schema = read('../../prisma/schema.prisma');
    const allocationModel =
      schema
        .split('model AccountingExternalSaleSettlementAllocation {')[1]
        ?.split('model AccountingExternalSaleSettlementComponent {')[0] ?? '';

    expect(schema).toContain('model AccountingOpeningReceivableSettlement {');
    expect(schema).toMatch(
      /openingReceivable\s+AccountingOpeningReceivable\s+@relation/,
    );
    expect(service).toContain('runSerializableAccountingWrite');
    expect(service).toContain('createOpeningReceivableSettlementJournalInTx');
    expect(service).toContain('OPENING_RECEIVABLE_SETTLEMENT_POST');
    expect(service).not.toContain('accountingExternalSaleSettlement');
    expect(service).not.toContain('AccountingExternalSaleSettlementService');
    expect(service).not.toContain("from '../orders/");
    expect(service).not.toContain("from '../payments/");
    expect(service).not.toContain("from '../integrations/");

    expect(allocationModel).toMatch(/externalSaleId\s+String\s+@db\.Uuid/);
    expect(allocationModel).not.toContain('openingReceivableId');
    expect(allocationModel).not.toContain('AccountingOpeningReceivable');

    expect(authority).toContain('AccountingJournalEntryKind.STANDARD');
    expect(authority).toContain(
      'ACCOUNTING_OPENING_RECEIVABLE_SETTLEMENT_SOURCE_FACT_TYPE',
    );
    expect(authority).toContain(
      'ACCOUNTING_OPENING_RECEIVABLE_AR_ACCOUNT_STABLE_ID',
    );
    expect(authority).not.toContain('account_sales_revenue');
    expect(authority).not.toContain('account_hst_payable');
    expect(authority).not.toContain('account_commission_expense');
  });

  it('blocks generic Journal forging and exposes only ADMIN/ACCOUNTANT Accounting routes', () => {
    const journal = read('accounting-journal.service.ts');
    const controller = read('accounting-opening-receivable.controller.ts');

    expect(journal).toContain(
      'Opening Receivable canonical Journals require Opening-Receivable-specific write authority',
    );
    expect(journal).toContain(
      'Opening Receivable canonical Journals cannot be updated in place',
    );
    expect(journal).toContain(
      'generic Journal update cannot create Opening Receivable canonical authority',
    );
    expect(journal).toContain(
      'Opening Receivable canonical Journals cannot be deleted in place',
    );
    expect(controller).toContain("@Post('opening-receivables/settlements')");
    expect(controller).toContain("@Roles('ADMIN', 'ACCOUNTANT')");
  });
});
