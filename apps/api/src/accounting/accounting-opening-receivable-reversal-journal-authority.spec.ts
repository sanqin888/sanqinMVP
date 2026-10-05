import {
  AccountingJournalEntryKind,
  AccountingJournalSource,
} from './accounting-contracts';
import {
  ACCOUNTING_OPENING_RECEIVABLE_REVERSAL_SOURCE_FACT_TYPE,
} from './accounting-opening-receivable.contract';
import {
  ACCOUNTING_OPENING_RECEIVABLE_SETTLEMENT_REVERSAL_SOURCE_FACT_TYPE,
} from './accounting-opening-receivable-settlement.contract';
import {
  assertAccountingOpeningReceivableReversalJournalAuthority,
  buildAccountingOpeningReceivableReversalStableId,
  buildAccountingOpeningReceivableReversalWritePlan,
  hashAccountingOpeningReceivableReversalJournalWrite,
  type AccountingOpeningReceivableOriginalJournalV1,
  type AccountingOpeningReceivableReversalFactV1,
} from './accounting-opening-receivable-reversal-journal-authority';
import { normalizeJournalCreate } from './accounting-journal-policy';

const openingJournal = (): AccountingOpeningReceivableOriginalJournalV1 => ({
  entryStableId: 'journal_opening_1',
  source: AccountingJournalSource.MANUAL,
  sourceFactType: 'accounting.opening_receivable.v1',
  sourceFactStableId: 'openingrecv_1',
  sourceFactVersion: 1,
  storeStableId: '4750_Yonge_Street',
  occurredAt: '2026-06-01T04:00:00.000Z',
  currency: 'CAD',
  memo: 'Opening Receivable openingrecv_1',
  lines: [
    {
      lineNo: 1,
      accountStableId: 'account_accounts_receivable',
      categoryStableId: null,
      debitCents: 50_500,
      creditCents: 0,
      memo: 'Opening Accounts Receivable',
    },
    {
      lineNo: 2,
      accountStableId: 'account_opening_balance_equity',
      categoryStableId: null,
      debitCents: 0,
      creditCents: 50_500,
      memo: 'Opening Balance Equity',
    },
  ],
});

const openingFact = (): AccountingOpeningReceivableReversalFactV1 => ({
  version: 1,
  target: 'OPENING_RECEIVABLE',
  targetStableId: 'openingrecv_1',
  originalFactHash: 'opening_fact_hash',
  originalJournalEntryStableId: 'journal_opening_1',
  reversalStableId: buildAccountingOpeningReceivableReversalStableId(
    'OPENING_RECEIVABLE',
    'openingrecv_1',
  ),
  reversalReason: 'Opening amount was incorrect',
});

describe('Accounting Opening Receivable reversal Journal authority', () => {
  it('builds an exact inverse Opening Balance ADJUSTMENT from the frozen original Journal', () => {
    const plan = buildAccountingOpeningReceivableReversalWritePlan({
      fact: openingFact(),
      originalJournal: openingJournal(),
    });

    expect(plan.journal).toMatchObject({
      idempotencyKey: 'opening-receivable-reversal:openingrecv_1:v1',
      kind: AccountingJournalEntryKind.ADJUSTMENT,
      source: AccountingJournalSource.MANUAL,
      sourceFactType: ACCOUNTING_OPENING_RECEIVABLE_REVERSAL_SOURCE_FACT_TYPE,
      sourceFactStableId: plan.authority.fact.reversalStableId,
      sourceFactVersion: 1,
      storeStableId: '4750_Yonge_Street',
      occurredAt: '2026-06-01T04:00:00.000Z',
      currency: 'CAD',
    });
    expect(plan.journal.lines).toEqual([
      expect.objectContaining({
        accountStableId: 'account_accounts_receivable',
        debitCents: 0,
        creditCents: 50_500,
      }),
      expect.objectContaining({
        accountStableId: 'account_opening_balance_equity',
        debitCents: 50_500,
        creditCents: 0,
      }),
    ]);
  });

  it('builds a settlement reversal that restores AR and reverses the original collection account', () => {
    const original: AccountingOpeningReceivableOriginalJournalV1 = {
      entryStableId: 'journal_opening_settlement_1',
      source: AccountingJournalSource.MANUAL,
      sourceFactType: 'accounting.opening_receivable_settlement.v1',
      sourceFactStableId: 'openingrecvsettle_1',
      sourceFactVersion: 1,
      storeStableId: '4750_Yonge_Street',
      occurredAt: '2026-06-20T04:00:00.000Z',
      currency: 'CAD',
      memo: 'Opening Receivable settlement',
      lines: [
        {
          lineNo: 1,
          accountStableId: 'account_primary_bank',
          categoryStableId: null,
          debitCents: 12_500,
          creditCents: 0,
          memo: 'Collection',
        },
        {
          lineNo: 2,
          accountStableId: 'account_accounts_receivable',
          categoryStableId: null,
          debitCents: 0,
          creditCents: 12_500,
          memo: 'Opening Receivable settlement',
        },
      ],
    };
    const fact: AccountingOpeningReceivableReversalFactV1 = {
      version: 1,
      target: 'SETTLEMENT',
      targetStableId: 'openingrecvsettle_1',
      originalFactHash: 'settlement_fact_hash',
      originalJournalEntryStableId: original.entryStableId,
      reversalStableId: buildAccountingOpeningReceivableReversalStableId(
        'SETTLEMENT',
        'openingrecvsettle_1',
      ),
      reversalReason: 'Wrong collection account',
    };

    const plan = buildAccountingOpeningReceivableReversalWritePlan({
      fact,
      originalJournal: original,
    });

    expect(plan.journal.sourceFactType).toBe(
      ACCOUNTING_OPENING_RECEIVABLE_SETTLEMENT_REVERSAL_SOURCE_FACT_TYPE,
    );
    expect(plan.journal.lines).toEqual([
      expect.objectContaining({
        accountStableId: 'account_primary_bank',
        debitCents: 0,
        creditCents: 12_500,
      }),
      expect.objectContaining({
        accountStableId: 'account_accounts_receivable',
        debitCents: 12_500,
        creditCents: 0,
      }),
    ]);
  });

  it('binds the reason and original Journal snapshot and rejects Journal tampering', () => {
    const plan = buildAccountingOpeningReceivableReversalWritePlan({
      fact: openingFact(),
      originalJournal: openingJournal(),
    });
    const normalized = normalizeJournalCreate(plan.journal);

    expect(() =>
      assertAccountingOpeningReceivableReversalJournalAuthority(
        normalized,
        plan.authority,
      ),
    ).not.toThrow();

    const originalHash =
      hashAccountingOpeningReceivableReversalJournalWrite(
        normalized,
        plan.authority,
      );
    expect(() =>
      assertAccountingOpeningReceivableReversalJournalAuthority(
        normalizeJournalCreate({
          ...plan.journal,
          memo: 'tampered',
        }),
        plan.authority,
      ),
    ).toThrow();

    const changedReason = buildAccountingOpeningReceivableReversalWritePlan({
      fact: {
        ...openingFact(),
        reversalReason: 'Different reason',
      },
      originalJournal: openingJournal(),
    });
    expect(changedReason.authority.reversalFactHash).not.toBe(
      plan.authority.reversalFactHash,
    );
    expect(
      hashAccountingOpeningReceivableReversalJournalWrite(
        normalizeJournalCreate(changedReason.journal),
        changedReason.authority,
      ),
    ).not.toBe(originalHash);
  });

  it('rejects a frozen original Journal with a mismatched source identity', () => {
    expect(() =>
      buildAccountingOpeningReceivableReversalWritePlan({
        fact: openingFact(),
        originalJournal: {
          ...openingJournal(),
          sourceFactStableId: 'openingrecv_other',
        },
      }),
    ).toThrow(
      'Opening Receivable reversal original Journal fact identity is invalid',
    );
  });
});
