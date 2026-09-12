import {
  AccountingJournalEntryKind,
  AccountingJournalSource,
} from '@prisma/client';
import {
  AccountingJournalPolicyError,
  hashJournalCreatePayload,
  normalizeJournalCreate,
} from './accounting-journal-policy';

const baseInput = {
  idempotencyKey: 'journal:manual:1',
  kind: AccountingJournalEntryKind.STANDARD,
  source: AccountingJournalSource.MANUAL,
  occurredAt: '2026-09-12T14:00:00.000Z',
  currency: 'cad',
  memo: '  Kitchen supplies  ',
  lines: [
    {
      accountStableId: 'account_general_operating_expense',
      categoryStableId: 'expense_kitchen_supplies',
      debitCents: 1250,
      creditCents: 0,
    },
    {
      accountStableId: 'account_store_cash',
      debitCents: 0,
      creditCents: 1250,
    },
  ],
};

describe('Accounting journal policy', () => {
  it('normalizes a balanced entry and produces a deterministic content hash', () => {
    const normalized = normalizeJournalCreate(baseInput);

    expect(normalized.currency).toBe('CAD');
    expect(normalized.memo).toBe('Kitchen supplies');
    expect(normalized.occurredAt).toEqual(new Date('2026-09-12T14:00:00.000Z'));
    expect(hashJournalCreatePayload(normalized)).toMatch(/^[a-f0-9]{64}$/);
    expect(hashJournalCreatePayload(normalized)).toBe(
      hashJournalCreatePayload(normalizeJournalCreate(baseInput)),
    );
  });

  it('rejects a journal with fewer than two lines', () => {
    expect(() =>
      normalizeJournalCreate({ ...baseInput, lines: [baseInput.lines[0]] }),
    ).toThrow(AccountingJournalPolicyError);
  });

  it('rejects negative minor units', () => {
    expect(() =>
      normalizeJournalCreate({
        ...baseInput,
        lines: [
          { ...baseInput.lines[0], debitCents: -1 },
          { ...baseInput.lines[1], creditCents: 1 },
        ],
      }),
    ).toThrow(AccountingJournalPolicyError);
  });

  it('rejects a line with both debit and credit positive', () => {
    expect(() =>
      normalizeJournalCreate({
        ...baseInput,
        lines: [{ ...baseInput.lines[0], creditCents: 1 }, baseInput.lines[1]],
      }),
    ).toThrow(AccountingJournalPolicyError);
  });

  it('rejects a zero-value line', () => {
    expect(() =>
      normalizeJournalCreate({
        ...baseInput,
        lines: [{ ...baseInput.lines[0], debitCents: 0 }, baseInput.lines[1]],
      }),
    ).toThrow(AccountingJournalPolicyError);
  });

  it('rejects an imbalanced journal', () => {
    expect(() =>
      normalizeJournalCreate({
        ...baseInput,
        lines: [
          baseInput.lines[0],
          { ...baseInput.lines[1], creditCents: 1200 },
        ],
      }),
    ).toThrow('journal entry does not balance');
  });

  it('requires source fact type and stable identity together', () => {
    expect(() =>
      normalizeJournalCreate({
        ...baseInput,
        sourceFactType: 'ORDER_FINANCIAL_FACT',
      }),
    ).toThrow(AccountingJournalPolicyError);
  });

  it('requires a positive source fact version when versioned evidence is provided', () => {
    expect(() =>
      normalizeJournalCreate({
        ...baseInput,
        sourceFactType: 'ORDER_FINANCIAL_FACT',
        sourceFactStableId: 'order_fact_1',
        sourceFactVersion: 0,
      }),
    ).toThrow(AccountingJournalPolicyError);
  });

  it('rejects malformed currency codes', () => {
    expect(() =>
      normalizeJournalCreate({ ...baseInput, currency: 'CAD$' }),
    ).toThrow(AccountingJournalPolicyError);
  });
});
