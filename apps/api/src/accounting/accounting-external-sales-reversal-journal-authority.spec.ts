import {
  AccountingJournalEntryKind,
  AccountingJournalSource,
} from './accounting-contracts';
import {
  ACCOUNTING_EXTERNAL_SALE_REVERSAL_SOURCE_FACT_TYPE,
  ACCOUNTING_EXTERNAL_SALE_SETTLEMENT_REVERSAL_SOURCE_FACT_TYPE,
} from './accounting-external-sales.contract';
import {
  assertAccountingExternalSaleReversalJournalAuthority,
  buildAccountingExternalSaleReversalStableId,
  buildAccountingExternalSaleReversalWritePlan,
  hashAccountingExternalSaleReversalJournalWrite,
  type AccountingExternalSaleOriginalJournalV1,
  type AccountingExternalSaleReversalFactV1,
} from './accounting-external-sales-reversal-journal-authority';
import { normalizeJournalCreate } from './accounting-journal-policy';

const saleJournal = (): AccountingExternalSaleOriginalJournalV1 => ({
  entryStableId: 'journal_sale_1',
  source: AccountingJournalSource.EXTERNAL_SALE,
  sourceFactType: 'accounting.external_sale.v1',
  sourceFactStableId: 'extsale_1',
  sourceFactVersion: 1,
  storeStableId: '4750_Yonge_Street',
  occurredAt: '2026-06-15T04:00:00.000Z',
  currency: 'CAD',
  memo: 'External Sale extsale_1',
  lines: [
    {
      lineNo: 1,
      accountStableId: 'account_accounts_receivable',
      categoryStableId: null,
      debitCents: 11_300,
      creditCents: 0,
      memo: 'Accounts Receivable',
    },
    {
      lineNo: 2,
      accountStableId: 'account_sales_revenue',
      categoryStableId: 'income_sales',
      debitCents: 0,
      creditCents: 10_000,
      memo: 'Sale',
    },
    {
      lineNo: 3,
      accountStableId: 'account_hst_payable',
      categoryStableId: null,
      debitCents: 0,
      creditCents: 1300,
      memo: 'HST',
    },
  ],
});

const saleFact = (): AccountingExternalSaleReversalFactV1 => ({
  version: 1,
  target: 'SALE',
  targetStableId: 'extsale_1',
  originalFactHash: 'original_sale_fact_hash',
  originalJournalEntryStableId: 'journal_sale_1',
  reversalStableId: buildAccountingExternalSaleReversalStableId(
    'SALE',
    'extsale_1',
  ),
  reversalReason: 'Incorrect quantity',
});

describe('Accounting External Sales reversal Journal authority', () => {
  it('builds an exact inverse Sale ADJUSTMENT at the original occurredAt', () => {
    const plan = buildAccountingExternalSaleReversalWritePlan({
      fact: saleFact(),
      originalJournal: saleJournal(),
    });

    expect(plan.journal).toMatchObject({
      idempotencyKey: 'external-sale-reversal:extsale_1:v1',
      kind: AccountingJournalEntryKind.ADJUSTMENT,
      source: AccountingJournalSource.EXTERNAL_SALE,
      sourceFactType: ACCOUNTING_EXTERNAL_SALE_REVERSAL_SOURCE_FACT_TYPE,
      sourceFactStableId: plan.authority.fact.reversalStableId,
      sourceFactVersion: 1,
      storeStableId: '4750_Yonge_Street',
      occurredAt: '2026-06-15T04:00:00.000Z',
      currency: 'CAD',
    });
    expect(plan.journal.lines).toEqual([
      {
        accountStableId: 'account_accounts_receivable',
        categoryStableId: null,
        debitCents: 0,
        creditCents: 11_300,
        memo: 'Accounts Receivable',
      },
      {
        accountStableId: 'account_sales_revenue',
        categoryStableId: 'income_sales',
        debitCents: 10_000,
        creditCents: 0,
        memo: 'Sale',
      },
      {
        accountStableId: 'account_hst_payable',
        categoryStableId: null,
        debitCents: 1300,
        creditCents: 0,
        memo: 'HST',
      },
    ]);
  });

  it('builds an exact inverse Settlement reversal that restores AR and reverses cash/expense/tax', () => {
    const original: AccountingExternalSaleOriginalJournalV1 = {
      entryStableId: 'journal_settlement_1',
      source: AccountingJournalSource.EXTERNAL_SALE,
      sourceFactType: 'accounting.external_sale_settlement.v1',
      sourceFactStableId: 'extsettlement_1',
      sourceFactVersion: 1,
      storeStableId: '4750_Yonge_Street',
      occurredAt: '2026-06-20T04:00:00.000Z',
      currency: 'CAD',
      memo: 'External Sale settlement',
      lines: [
        {
          lineNo: 1,
          accountStableId: 'account_primary_bank',
          categoryStableId: null,
          debitCents: 8200,
          creditCents: 0,
          memo: 'Bank receipt',
        },
        {
          lineNo: 2,
          accountStableId: 'account_commission_expense',
          categoryStableId: null,
          debitCents: 1500,
          creditCents: 0,
          memo: 'Commission',
        },
        {
          lineNo: 3,
          accountStableId: 'account_hst_recoverable',
          categoryStableId: null,
          debitCents: 300,
          creditCents: 0,
          memo: 'Input tax',
        },
        {
          lineNo: 4,
          accountStableId: 'account_accounts_receivable',
          categoryStableId: null,
          debitCents: 0,
          creditCents: 10_000,
          memo: 'Receivable settlement',
        },
      ],
    };
    const fact: AccountingExternalSaleReversalFactV1 = {
      version: 1,
      target: 'SETTLEMENT',
      targetStableId: 'extsettlement_1',
      originalFactHash: 'original_settlement_fact_hash',
      originalJournalEntryStableId: 'journal_settlement_1',
      reversalStableId: buildAccountingExternalSaleReversalStableId(
        'SETTLEMENT',
        'extsettlement_1',
      ),
      reversalReason: 'Wrong bank account',
    };
    const plan = buildAccountingExternalSaleReversalWritePlan({
      fact,
      originalJournal: original,
    });

    expect(plan.journal.sourceFactType).toBe(
      ACCOUNTING_EXTERNAL_SALE_SETTLEMENT_REVERSAL_SOURCE_FACT_TYPE,
    );
    expect(plan.journal.lines).toEqual([
      expect.objectContaining({
        accountStableId: 'account_primary_bank',
        debitCents: 0,
        creditCents: 8200,
      }),
      expect.objectContaining({
        accountStableId: 'account_commission_expense',
        debitCents: 0,
        creditCents: 1500,
      }),
      expect.objectContaining({
        accountStableId: 'account_hst_recoverable',
        debitCents: 0,
        creditCents: 300,
      }),
      expect.objectContaining({
        accountStableId: 'account_accounts_receivable',
        debitCents: 10_000,
        creditCents: 0,
      }),
    ]);
  });

  it('binds the reason and exact original Journal snapshot into the authority hash', () => {
    const plan = buildAccountingExternalSaleReversalWritePlan({
      fact: saleFact(),
      originalJournal: saleJournal(),
    });
    const normalized = normalizeJournalCreate(plan.journal);
    expect(() =>
      assertAccountingExternalSaleReversalJournalAuthority(
        normalized,
        plan.authority,
      ),
    ).not.toThrow();

    const originalHash = hashAccountingExternalSaleReversalJournalWrite(
      normalized,
      plan.authority,
    );
    const changedJournal = normalizeJournalCreate({
      ...plan.journal,
      memo: 'Tampered reversal memo',
    });
    expect(() =>
      assertAccountingExternalSaleReversalJournalAuthority(
        changedJournal,
        plan.authority,
      ),
    ).toThrow();

    const changedPlan = buildAccountingExternalSaleReversalWritePlan({
      fact: { ...saleFact(), reversalReason: 'Different reason' },
      originalJournal: saleJournal(),
    });
    expect(changedPlan.authority.reversalFactHash).not.toBe(
      plan.authority.reversalFactHash,
    );
    expect(originalHash).not.toBe(
      hashAccountingExternalSaleReversalJournalWrite(
        normalizeJournalCreate(changedPlan.journal),
        changedPlan.authority,
      ),
    );
  });

  it('rejects mismatched original source identity instead of recomputing policy', () => {
    expect(() =>
      buildAccountingExternalSaleReversalWritePlan({
        fact: saleFact(),
        originalJournal: {
          ...saleJournal(),
          sourceFactStableId: 'different_sale',
        },
      }),
    ).toThrow(
      'External Sale reversal original Journal fact identity is invalid',
    );
  });
});
