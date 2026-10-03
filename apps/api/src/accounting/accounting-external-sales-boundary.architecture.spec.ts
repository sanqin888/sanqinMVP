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

  it('keeps Slice E read authority inside Accounting with Store scope only', () => {
    const queryService =
      file('accounting-external-sales-query.service.ts')?.source ?? '';
    const queryPolicy =
      file('accounting-external-sales-query.policy.ts')?.source ?? '';
    const queryPersistence =
      file('accounting-external-sales-query.persistence.ts')?.source ?? '';

    expect(importSpecifiers(queryService)).toContain('../store/public-api');
    expect(queryService).not.toContain("from '../orders/");
    expect(queryService).not.toContain("from '../payments/");
    expect(queryService).not.toContain("from '../menu/");
    expect(queryService).not.toContain("from '../pos/");
    expect(queryService).not.toContain("from '../integrations/");
    expect(queryService).not.toContain('@prisma/client');

    expect(queryPolicy).not.toContain("from '../orders/");
    expect(queryPolicy).not.toContain("from '../payments/");
    expect(queryPolicy).not.toContain("from '../integrations/");
    expect(queryPolicy).not.toContain('@prisma/client');
    expect(queryPolicy).toContain(
      'projectAccountingExternalSaleReceivableCents',
    );
    expect(queryPolicy).toContain(
      'projectAccountingExternalSaleSettlementAppliedCents',
    );
    expect(queryPolicy).toContain('resolveAccountingExternalSaleReversalState');

    expect(queryPersistence).toContain("from '@prisma/client'");
    expect(queryPersistence).toContain('ACCOUNTING_EXTERNAL_SALE_QUERY_SELECT');
    expect(queryPersistence).toContain(
      'ACCOUNTING_EXTERNAL_SALE_SETTLEMENT_QUERY_SELECT',
    );
  });

  it('pins C1/C2/C3 write ownership with D sale-only analytics cutover', () => {
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

    expect(module).toContain('AccountingExternalSalesController');
    expect(module).toContain('AccountingExternalSalesService');
    expect(module).toContain('AccountingExternalSalesQueryService');
    expect(module).toContain('AccountingExternalSaleSettlementService');
    expect(module).toContain('AccountingExternalSaleReversalService');
    expect(controllerGuard).toContain("'GET external-sales'");
    expect(controllerGuard).toContain("'GET external-sales/options'");
    expect(controllerGuard).toContain("'GET external-sales/settlements'");
    expect(controllerGuard).toContain(
      "'GET external-sales/:externalSaleStableId'",
    );
    expect(controllerGuard).toContain("'POST external-sales'");
    expect(controllerGuard).toContain(
      "'POST external-sales/:externalSaleStableId/reverse'",
    );
    expect(controllerGuard).toContain("'POST external-sales/settlements'");
    expect(controllerGuard).toContain(
      "'POST external-sales/settlements/:settlementStableId/reverse'",
    );
    expect(salesPolicy).toContain('accounting.external_sale.v1');
    expect(salesPolicy).toContain('accounting.external_sale_reversal.v1');
    expect(salesPolicy).not.toContain('accounting.external_sale_settlement.v1');
    expect(salesPolicy).not.toContain(
      'accounting.external_sale_settlement_reversal.v1',
    );
    expect(chart).toContain('account_accounts_receivable');
    expect(chart).toContain('account_commission_expense');
    expect(chart).not.toContain('account_platform_commission_expense');

    const authority =
      file('accounting-external-sales-journal-authority.ts')?.source ?? '';
    const settlementAuthority =
      file('accounting-external-sales-settlement-journal-authority.ts')
        ?.source ?? '';
    const reversalAuthority =
      file('accounting-external-sales-reversal-journal-authority.ts')?.source ??
      '';
    const journal = file('accounting-journal.service.ts')?.source ?? '';
    expect(authority).toContain("'EXTERNAL_SALE_RECOGNITION'");
    expect(authority).toContain("'account_hst_payable'");
    expect(authority).toContain("'account_sales_discounts'");
    expect(authority).not.toContain("'account_commission_expense'");
    expect(settlementAuthority).toContain("'EXTERNAL_SALE_SETTLEMENT'");
    expect(settlementAuthority).toContain("'account_commission_expense'");
    expect(settlementAuthority).toContain("'account_hst_recoverable'");
    expect(settlementAuthority).toContain('AccountingAccountType.BANK');
    expect(settlementAuthority).toContain('AccountingAccountType.CASH');
    expect(settlementAuthority).not.toContain(
      "'account_payroll_wages_expense'",
    );
    expect(reversalAuthority).toContain(
      'AccountingJournalEntryKind.ADJUSTMENT',
    );
    expect(reversalAuthority).toContain(
      'ACCOUNTING_EXTERNAL_SALE_REVERSAL_SOURCE_FACT_TYPE',
    );
    expect(reversalAuthority).toContain(
      'ACCOUNTING_EXTERNAL_SALE_SETTLEMENT_REVERSAL_SOURCE_FACT_TYPE',
    );
    expect(reversalAuthority).toContain('debitCents: line.creditCents');
    expect(reversalAuthority).toContain('creditCents: line.debitCents');
    expect(journal).toContain('createExternalSaleJournalInTx');
    expect(journal).toContain('createExternalSaleSettlementJournalInTx');
    expect(journal).toContain('createExternalSaleReversalJournalInTx');
    expect(journal).toContain('allowInactiveReferencedDimensions: true');
    expect(journal).toContain('allowInactiveReferencedDimensions = false');
    expect(journal).toContain(
      'External Sale canonical Journals cannot be updated in place',
    );
    expect(journal).toContain(
      'External Sale canonical Journals cannot be deleted in place',
    );
  });
});
