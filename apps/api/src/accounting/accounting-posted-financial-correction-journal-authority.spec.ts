import {
  AccountingJournalEntryKind,
  AccountingJournalSource,
} from './accounting-contracts';
import {
  AccountingPostedCorrectionJournalOutputRole,
  AccountingPostedCorrectionTargetKind,
} from './accounting-posted-financial-correction.contract';
import {
  assertPostedCorrectionJournalAuthority,
  buildPostedCorrectionJournalWritePlan,
  hashPostedCorrectionJournalWrite,
} from './accounting-posted-financial-correction-journal-authority';
import { normalizeJournalCreate } from './accounting-journal-policy';

const draft = {
  role: AccountingPostedCorrectionJournalOutputRole.DELTA,
  sequence: 1,
  basisJournalIdempotencyKey: 'expense:document:1',
  anchor: {
    source: AccountingJournalSource.EXPENSE_DOCUMENT,
    storeStableId: '4750_Yonge_Street',
    occurredAt: '2026-09-15T16:00:00.000Z',
    currency: 'CAD',
  },
  postingVector: {
    version: 1 as const,
    currency: 'CAD',
    lines: [
      {
        accountStableId: 'account_cash',
        categoryStableId: null,
        debitCents: 0,
        creditCents: 2_000,
      },
      {
        accountStableId: 'account_expense',
        categoryStableId: 'expense_food',
        debitCents: 2_000,
        creditCents: 0,
      },
    ],
  },
};

describe('posted financial correction Journal authority', () => {
  it('builds a deterministic ADJUSTMENT Journal bound to correction authority', () => {
    const first = buildPostedCorrectionJournalWritePlan({
      correctionStableId: 'correction_1',
      correctionRevisionStableId: 'revision_1',
      correctionRevision: 2,
      targetKind: AccountingPostedCorrectionTargetKind.EXPENSE,
      targetStableId: 'expense_1',
      targetVersion: 1,
      planHash: 'a'.repeat(64),
      draft,
    });
    const second = buildPostedCorrectionJournalWritePlan({
      correctionStableId: 'correction_1',
      correctionRevisionStableId: 'revision_1',
      correctionRevision: 2,
      targetKind: AccountingPostedCorrectionTargetKind.EXPENSE,
      targetStableId: 'expense_1',
      targetVersion: 1,
      planHash: 'a'.repeat(64),
      draft,
    });

    expect(first).toEqual(second);
    expect(first.journal).toEqual(
      expect.objectContaining({
        idempotencyKey: 'posted-correction:correction_1:delta:1:v1',
        kind: AccountingJournalEntryKind.ADJUSTMENT,
        source: AccountingJournalSource.EXPENSE_DOCUMENT,
        sourceFactType: 'accounting.posted_financial_correction.v1',
        sourceFactStableId: 'correction_1',
        sourceFactVersion: 2,
        storeStableId: '4750_Yonge_Street',
        occurredAt: '2026-09-15T16:00:00.000Z',
        currency: 'CAD',
      }),
    );

    const normalized = normalizeJournalCreate(first.journal);
    expect(() =>
      assertPostedCorrectionJournalAuthority(normalized, first.authority),
    ).not.toThrow();
    expect(
      hashPostedCorrectionJournalWrite(normalized, first.authority),
    ).toMatch(/^[a-f0-9]{64}$/);
  });

  it('rejects a Journal whose source-fact identity was tampered', () => {
    const plan = buildPostedCorrectionJournalWritePlan({
      correctionStableId: 'correction_1',
      correctionRevisionStableId: 'revision_1',
      correctionRevision: 2,
      targetKind: AccountingPostedCorrectionTargetKind.EXPENSE,
      targetStableId: 'expense_1',
      targetVersion: 1,
      planHash: 'a'.repeat(64),
      draft,
    });
    const normalized = normalizeJournalCreate({
      ...plan.journal,
      sourceFactStableId: 'correction_other',
    });

    expect(() =>
      assertPostedCorrectionJournalAuthority(normalized, plan.authority),
    ).toThrow('source fact does not match its authority');
  });

  it('rejects tampered financial lines even when the Journal remains balanced', () => {
    const plan = buildPostedCorrectionJournalWritePlan({
      correctionStableId: 'correction_1',
      correctionRevisionStableId: 'revision_1',
      correctionRevision: 2,
      targetKind: AccountingPostedCorrectionTargetKind.EXPENSE,
      targetStableId: 'expense_1',
      targetVersion: 1,
      planHash: 'a'.repeat(64),
      draft,
    });
    const normalized = normalizeJournalCreate({
      ...plan.journal,
      lines: [
        {
          accountStableId: 'account_cash',
          debitCents: 0,
          creditCents: 1_500,
        },
        {
          accountStableId: 'account_expense',
          categoryStableId: 'expense_food',
          debitCents: 1_500,
          creditCents: 0,
        },
      ],
    });

    expect(() =>
      assertPostedCorrectionJournalAuthority(normalized, plan.authority),
    ).toThrow('lines do not match its reviewed posting vector');
  });
});
