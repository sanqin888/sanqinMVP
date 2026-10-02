import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

import {
  importSpecifiers,
  scanTypeScript,
} from '../test/architecture-test.utils';

const API_SRC_ROOT = resolve(__dirname, '..');
const ACCOUNTING_ROOT = resolve(API_SRC_ROOT, 'accounting');
const PRISMA_SCHEMA = resolve(API_SRC_ROOT, '..', 'prisma', 'schema.prisma');

const file = (suffix: string) =>
  scanTypeScript(ACCOUNTING_ROOT).find(({ path }) => path.endsWith(suffix));

describe('Post-modularization External Sales boundary', () => {
  it('keeps the source-fact contract Accounting-owned and persistence-neutral', () => {
    const contract =
      file('accounting-external-sales.contract.ts')?.source ?? '';

    expect(importSpecifiers(contract)).toEqual([]);
    expect(contract).toContain("'accounting.external_sale.v1'");
    expect(contract).toContain("'accounting.external_sale_settlement.v1'");
    expect(contract).toContain('classificationStableId: string');
    expect(contract).toContain('quantity: string');
    expect(contract).toContain('unitPriceCents: number');
    expect(contract).toContain('lineAmountCents: number');
    expect(contract).toContain('adjustments');
    expect(contract).toContain('taxes');
    expect(contract).toContain('components');
    expect(contract).not.toContain('@prisma/client');
    expect(contract).not.toContain('saleType');
    expect(contract).not.toContain('discountCents');
    expect(contract).not.toContain('commissionExpenseCents');
    expect(contract).not.toContain('paymentMethod');
  });

  it('keeps External Sales policy inside Accounting without foreign-owner business imports', () => {
    const policy = file('accounting-external-sales.policy.ts')?.source ?? '';
    const imports = importSpecifiers(policy);

    expect(imports).toEqual(
      expect.arrayContaining([
        'node:crypto',
        'luxon',
        './accounting-journal-policy',
        './accounting-external-sales.contract',
      ]),
    );
    expect(policy).not.toContain("from '../orders/");
    expect(policy).not.toContain("from '../payments/");
    expect(policy).not.toContain("from '../menu/");
    expect(policy).not.toContain("from '../pos/");
    expect(policy).not.toContain("from '../integrations/");
    expect(policy).not.toContain('@prisma/client');
    expect(policy).toContain("source: 'EXTERNAL_SALE'");
    expect(policy).toContain('ACCOUNTING_EXTERNAL_SALE_AR_ACCOUNT_STABLE_ID');
  });

  it('pins the Slice B1 persistence foundation without a runtime cutover', () => {
    const schema = readFileSync(PRISMA_SCHEMA, 'utf8');
    const module = file('accounting.module.ts')?.source ?? '';
    const controllerGuard =
      file('accounting-controller-vertical-boundary.architecture.spec.ts')
        ?.source ?? '';
    const salesPolicy =
      file('accounting-sales-analytics.policy.ts')?.source ?? '';
    const accountingContracts = file('accounting-contracts.ts')?.source ?? '';
    const chart = file('accounting-chart-of-accounts.ts')?.source ?? '';

    expect(schema).toContain('EXTERNAL_SALE');
    expect(schema).toContain('enum AccountingExternalSaleGranularity');
    expect(schema).toContain('model AccountingExternalSale {');
    expect(schema).toContain('model AccountingExternalSaleLine {');
    expect(schema).toContain('model AccountingExternalSaleAdjustment {');
    expect(schema).toContain('model AccountingExternalSaleTax {');
    expect(schema).toContain('model AccountingExternalSaleSettlement {');
    expect(schema).toContain(
      'model AccountingExternalSaleSettlementAllocation {',
    );
    expect(schema).toContain(
      'model AccountingExternalSaleSettlementComponent {',
    );
    expect(schema).toContain('model AccountingExternalSaleEvidence {');
    expect(schema).toContain(
      'model AccountingExternalSaleSettlementEvidence {',
    );
    expect(schema).toContain('@db.Decimal(18, 4)');
    expect(schema).toContain('replacementForExternalSaleId');
    expect(schema).toContain('replacementForSettlementId');
    expect(schema).toContain('reversalJournalEntryStableId');
    expect(schema).toContain('externalSaleSettlementEvidence');
    expect(accountingContracts).toContain("EXTERNAL_SALE: 'EXTERNAL_SALE'");

    expect(module).not.toContain('AccountingExternalSale');
    expect(controllerGuard).not.toContain('external-sales');
    expect(salesPolicy).not.toContain('accounting.external_sale.v1');
    expect(chart).not.toContain('account_accounts_receivable');
    expect(chart).not.toContain('account_commission_expense');
    expect(chart).toContain('account_platform_commission_expense');
  });
});
