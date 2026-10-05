import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const root = resolve(__dirname);
const read = (name: string) => readFileSync(resolve(root, name), 'utf8');

describe('Accounting Opening Receivable G3 architecture boundary', () => {
  it('keeps reversal/correction persistence dedicated to G1/G2 and leaves External Sale C2 non-polymorphic', () => {
    const schema = read('../../prisma/schema.prisma');
    const reversal = read(
      'accounting-opening-receivable-reversal.service.ts',
    );
    const allocationModel =
      schema
        .split('model AccountingExternalSaleSettlementAllocation {')[1]
        ?.split('model AccountingExternalSaleSettlementComponent {')[0] ?? '';

    expect(schema).toContain('reversalStableId');
    expect(schema).toContain('replacementForOpeningReceivableId');
    expect(schema).toContain('AccountingOpeningReceivableReplacement');
    expect(schema).toContain('replacementForSettlementId');
    expect(schema).toContain(
      'AccountingOpeningReceivableSettlementReplacement',
    );

    expect(reversal).toContain('runSerializableAccountingWrite');
    expect(reversal).toContain('OPENING_RECEIVABLE_REVERSE');
    expect(reversal).toContain('OPENING_RECEIVABLE_SETTLEMENT_REVERSE');
    expect(reversal).toContain(
      'createOpeningReceivableReversalJournalInTx',
    );
    expect(reversal).not.toContain('accountingExternalSaleSettlement');
    expect(reversal).not.toContain("from '../orders/");
    expect(reversal).not.toContain("from '../payments/");
    expect(reversal).not.toContain("from '../integrations/");

    expect(allocationModel).toMatch(/externalSaleId\s+String\s+@db\.Uuid/);
    expect(allocationModel).not.toContain('openingReceivableId');
    expect(allocationModel).not.toContain(
      'AccountingOpeningReceivableSettlement',
    );
  });

  it('uses dedicated reversal source facts and prevents generic Journal mutation/forging', () => {
    const authority = read(
      'accounting-opening-receivable-reversal-journal-authority.ts',
    );
    const journal = read('accounting-journal.service.ts');

    expect(authority).toContain(
      'ACCOUNTING_OPENING_RECEIVABLE_REVERSAL_SOURCE_FACT_TYPE',
    );
    expect(authority).toContain(
      'ACCOUNTING_OPENING_RECEIVABLE_SETTLEMENT_REVERSAL_SOURCE_FACT_TYPE',
    );
    expect(authority).toContain('AccountingJournalEntryKind.ADJUSTMENT');
    expect(authority).toContain('AccountingJournalSource.MANUAL');
    expect(authority).toContain(
      'exact inverse of its frozen original Journal',
    );

    expect(journal).toContain(
      'ACCOUNTING_OPENING_RECEIVABLE_REVERSAL_SOURCE_FACT_TYPE',
    );
    expect(journal).toContain(
      'ACCOUNTING_OPENING_RECEIVABLE_SETTLEMENT_REVERSAL_SOURCE_FACT_TYPE',
    );
    expect(journal).toContain(
      'createOpeningReceivableReversalJournalInTx',
    );
    expect(journal).toContain(
      'Opening Receivable canonical Journals cannot be updated in place',
    );
    expect(journal).toContain(
      'Opening Receivable canonical Journals cannot be deleted in place',
    );
  });

  it('exposes only Accounting-owned ADMIN/ACCOUNTANT routes for options and reversals', () => {
    const controller = read('accounting-opening-receivable.controller.ts');

    expect(controller).toContain("@Roles('ADMIN', 'ACCOUNTANT')");
    expect(controller).toContain("@Get('opening-receivables/options')");
    expect(controller).toContain(
      "@Post('opening-receivables/:openingReceivableStableId/reverse')",
    );
    expect(controller).toContain(
      "@Post('opening-receivables/settlements/:settlementStableId/reverse')",
    );
    expect(controller).toContain(
      "@Post('opening-receivables/settlements')",
    );
  });

  it('keeps G1/G2 frozen source facts unchanged while correction lineage stays outside their fact hashes', () => {
    const openingContract = read(
      'accounting-opening-receivable.contract.ts',
    );
    const openingPolicy = read('accounting-opening-receivable.policy.ts');
    const settlementContract = read(
      'accounting-opening-receivable-settlement.contract.ts',
    );
    const settlementPolicy = read(
      'accounting-opening-receivable-settlement.policy.ts',
    );

    const openingFact =
      openingContract
        .split('export type AccountingOpeningReceivableFactV1 = {')[1]
        ?.split('};')[0] ?? '';
    const settlementFact =
      settlementContract
        .split(
          'export type AccountingOpeningReceivableSettlementFactV1 = {',
        )[1]
        ?.split('};')[0] ?? '';

    expect(openingFact).not.toContain(
      'replacementForOpeningReceivableStableId',
    );
    expect(settlementFact).not.toContain(
      'replacementForSettlementStableId',
    );
    expect(openingPolicy).not.toContain(
      'replacementForOpeningReceivableStableId',
    );
    expect(settlementPolicy).not.toContain(
      'replacementForSettlementStableId',
    );
  });
});
