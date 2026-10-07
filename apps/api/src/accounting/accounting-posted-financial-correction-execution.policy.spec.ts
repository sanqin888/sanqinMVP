import {
  AccountingJournalEntryKind,
  AccountingJournalSource,
} from './accounting-contracts';
import {
  AccountingPostedCorrectionReasonCode,
  AccountingPostedCorrectionStrategy,
  AccountingPostedCorrectionTargetKind,
  type AccountingPostedCorrectionPostedJournalAnchorV1,
} from './accounting-posted-financial-correction.contract';
import {
  AccountingPostedFinancialCorrectionExecutionPolicyError,
  buildPostedCorrectionExecutionJournalDrafts,
} from './accounting-posted-financial-correction-execution.policy';
import { buildPostedFinancialCorrectionPreviewPlan } from './accounting-posted-financial-correction.policy';
import type { AccountingJournalCreateInput } from './accounting-journal-policy';

const sha = (char: string) => char.repeat(64);

const posted = (input: {
  entryStableId: string;
  key: string;
  occurredAt: string;
  amountCents: number;
  fundingAccount: string;
}): AccountingPostedCorrectionPostedJournalAnchorV1 => ({
  entryStableId: input.entryStableId,
  idempotencyKey: input.key,
  idempotencyHash: sha(input.entryStableId.endsWith('1') ? '1' : '2'),
  version: 1,
  kind: AccountingJournalEntryKind.STANDARD,
  source: AccountingJournalSource.EXPENSE_DOCUMENT,
  sourceFactType: 'accounting.expense.v2',
  sourceFactStableId: input.key,
  sourceFactVersion: 1,
  storeStableId: '4750_Yonge_Street',
  occurredAt: input.occurredAt,
  currency: 'CAD',
  memo: input.key,
  lines: [
    {
      lineNo: 1,
      accountStableId: 'account_expense',
      categoryStableId: 'expense_food',
      debitCents: input.amountCents,
      creditCents: 0,
      memo: null,
    },
    {
      lineNo: 2,
      accountStableId: input.fundingAccount,
      categoryStableId: null,
      debitCents: 0,
      creditCents: input.amountCents,
      memo: null,
    },
  ],
});

const target = (
  current: AccountingPostedCorrectionPostedJournalAnchorV1,
  amountCents: number,
  overrides: Partial<AccountingJournalCreateInput> = {},
): AccountingJournalCreateInput => ({
  idempotencyKey: current.idempotencyKey,
  kind: current.kind,
  source: current.source,
  sourceFactType: current.sourceFactType,
  sourceFactStableId: current.sourceFactStableId,
  sourceFactVersion: current.sourceFactVersion,
  storeStableId: current.storeStableId,
  occurredAt: current.occurredAt,
  currency: current.currency,
  memo: current.memo,
  lines: [
    {
      accountStableId: 'account_expense',
      categoryStableId: 'expense_food',
      debitCents: amountCents,
      creditCents: 0,
    },
    {
      accountStableId: current.lines[1].accountStableId,
      debitCents: 0,
      creditCents: amountCents,
    },
  ],
  ...overrides,
});

const plan = (input: {
  strategy: keyof typeof AccountingPostedCorrectionStrategy;
  original: AccountingPostedCorrectionPostedJournalAnchorV1[];
  target: AccountingJournalCreateInput[];
  baseHash?: string;
  targetHash?: string;
}) =>
  buildPostedFinancialCorrectionPreviewPlan({
    correctionStableId: 'correction_1',
    targetKind: AccountingPostedCorrectionTargetKind.EXPENSE,
    targetStableId: 'expense_1',
    targetVersion: 1,
    strategy: AccountingPostedCorrectionStrategy[input.strategy],
    reasonCode: AccountingPostedCorrectionReasonCode.AMOUNT_ERROR,
    baseAuthoritySchema: 'accounting.expense.correction-target.v1',
    baseAuthorityHash: input.baseHash ?? sha('a'),
    targetAuthoritySchema: 'accounting.expense.correction-target.v1',
    targetAuthorityHash: input.targetHash ?? sha('b'),
    currency: 'CAD',
    originalJournals: input.original,
    priorCorrectionJournals: [],
    targetJournals: input.target,
  });

describe('posted financial correction execution policy', () => {
  it('splits DELTA by owner Journal identity and preserves each period anchor', () => {
    const first = posted({
      entryStableId: 'journal_1',
      key: 'expense:document:1',
      occurredAt: '2026-09-15T16:00:00.000Z',
      amountCents: 10_000,
      fundingAccount: 'account_cash',
    });
    const second = posted({
      entryStableId: 'journal_2',
      key: 'expense:funding:1',
      occurredAt: '2026-10-02T16:00:00.000Z',
      amountCents: 5_000,
      fundingAccount: 'account_bank',
    });
    const reviewed = plan({
      strategy: 'DELTA',
      original: [first, second],
      target: [target(first, 12_000), target(second, 4_000)],
    });

    const drafts = buildPostedCorrectionExecutionJournalDrafts({
      plan: reviewed,
      currentBusinessJournals: [target(first, 10_000), target(second, 5_000)],
    });

    expect(drafts).toHaveLength(2);
    expect(drafts.map((draft) => draft.role)).toEqual(['DELTA', 'DELTA']);
    expect(drafts.map((draft) => draft.sequence)).toEqual([1, 2]);
    expect(drafts.map((draft) => draft.basisJournalIdempotencyKey)).toEqual([
      'expense:document:1',
      'expense:funding:1',
    ]);
    expect(drafts.map((draft) => draft.anchor.occurredAt)).toEqual([
      '2026-09-15T16:00:00.000Z',
      '2026-10-02T16:00:00.000Z',
    ]);
    expect(drafts[0].postingVector.lines).toEqual([
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
    ]);
    expect(drafts[1].postingVector.lines).toEqual([
      {
        accountStableId: 'account_bank',
        categoryStableId: null,
        debitCents: 1_000,
        creditCents: 0,
      },
      {
        accountStableId: 'account_expense',
        categoryStableId: 'expense_food',
        debitCents: 0,
        creditCents: 1_000,
      },
    ]);
  });

  it('rejects structural DELTA changes that require REVERSAL_REPOST', () => {
    const original = posted({
      entryStableId: 'journal_1',
      key: 'expense:document:1',
      occurredAt: '2026-09-15T16:00:00.000Z',
      amountCents: 10_000,
      fundingAccount: 'account_cash',
    });
    const structurallyChanged = target(original, 12_000, {
      occurredAt: '2026-10-15T16:00:00.000Z',
    });
    const reviewed = plan({
      strategy: 'DELTA',
      original: [original],
      target: [structurallyChanged],
    });

    expect(() =>
      buildPostedCorrectionExecutionJournalDrafts({
        plan: reviewed,
        currentBusinessJournals: [target(original, 10_000)],
      }),
    ).toThrow(AccountingPostedFinancialCorrectionExecutionPolicyError);
  });

  it('emits exact per-Journal REVERSAL and target REPOST drafts', () => {
    const original = posted({
      entryStableId: 'journal_1',
      key: 'expense:document:1',
      occurredAt: '2026-09-15T16:00:00.000Z',
      amountCents: 10_000,
      fundingAccount: 'account_cash',
    });
    const replacement = target(original, 12_000, {
      idempotencyKey: 'expense:replacement:1',
      occurredAt: '2026-10-15T16:00:00.000Z',
    });
    const reviewed = plan({
      strategy: 'REVERSAL_REPOST',
      original: [original],
      target: [replacement],
    });

    const drafts = buildPostedCorrectionExecutionJournalDrafts({
      plan: reviewed,
      currentBusinessJournals: [target(original, 10_000)],
    });

    expect(drafts).toHaveLength(2);
    expect(drafts[0]).toEqual(
      expect.objectContaining({
        role: 'REVERSAL',
        sequence: 1,
        basisJournalIdempotencyKey: 'expense:document:1',
        anchor: expect.objectContaining({
          occurredAt: '2026-09-15T16:00:00.000Z',
        }) as unknown,
      }),
    );
    expect(drafts[1]).toEqual(
      expect.objectContaining({
        role: 'REPOST',
        sequence: 1,
        basisJournalIdempotencyKey: 'expense:replacement:1',
        anchor: expect.objectContaining({
          occurredAt: '2026-10-15T16:00:00.000Z',
        }) as unknown,
      }),
    );
  });

  it('allows authority-only DELTA READY plans to execute with zero Journal outputs', () => {
    const original = posted({
      entryStableId: 'journal_1',
      key: 'expense:document:1',
      occurredAt: '2026-09-15T16:00:00.000Z',
      amountCents: 10_000,
      fundingAccount: 'account_cash',
    });
    const reviewed = plan({
      strategy: 'DELTA',
      original: [original],
      target: [target(original, 10_000)],
      baseHash: sha('a'),
      targetHash: sha('b'),
    });

    expect(reviewed.status).toBe('READY');
    expect(reviewed.deltaPosting.lines).toEqual([]);
    expect(
      buildPostedCorrectionExecutionJournalDrafts({
        plan: reviewed,
        currentBusinessJournals: [target(original, 10_000)],
      }),
    ).toEqual([]);
  });

  it('fails closed when current business journals no longer equal Current Effective Posting', () => {
    const original = posted({
      entryStableId: 'journal_1',
      key: 'expense:document:1',
      occurredAt: '2026-09-15T16:00:00.000Z',
      amountCents: 10_000,
      fundingAccount: 'account_cash',
    });
    const reviewed = plan({
      strategy: 'DELTA',
      original: [original],
      target: [target(original, 12_000)],
    });

    expect(() =>
      buildPostedCorrectionExecutionJournalDrafts({
        plan: reviewed,
        currentBusinessJournals: [target(original, 9_000)],
      }),
    ).toThrow(
      'current business Journal set no longer matches Current Effective Posting',
    );
  });
});
