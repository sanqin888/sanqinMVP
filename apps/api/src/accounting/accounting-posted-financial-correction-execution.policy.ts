import { AccountingJournalEntryKind } from './accounting-contracts';
import type {
  AccountingJournalCreateInput,
  AccountingJournalLineInput,
} from './accounting-journal-policy';
import {
  AccountingPostedCorrectionJournalOutputRole,
  AccountingPostedCorrectionStrategy,
  type AccountingPostedCorrectionPostingVectorV1,
  type AccountingPostedCorrectionPreviewPlanV1,
  type AccountingPostedCorrectionTargetJournalSnapshotV1,
} from './accounting-posted-financial-correction.contract';
import {
  buildPostedCorrectionTargetJournalSetSnapshot,
  calculatePostedCorrectionDelta,
  hashPostedCorrectionPostingVector,
} from './accounting-posted-financial-correction.policy';

export class AccountingPostedFinancialCorrectionExecutionPolicyError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'AccountingPostedFinancialCorrectionExecutionPolicyError';
  }
}

export type AccountingPostedCorrectionExecutionJournalAnchorV1 = {
  source: AccountingPostedCorrectionTargetJournalSnapshotV1['source'];
  storeStableId: string | null;
  occurredAt: string;
  currency: string;
};

export type AccountingPostedCorrectionExecutionJournalDraftV1 = {
  role: AccountingPostedCorrectionJournalOutputRole;
  sequence: number;
  basisJournalIdempotencyKey: string;
  anchor: AccountingPostedCorrectionExecutionJournalAnchorV1;
  postingVector: AccountingPostedCorrectionPostingVectorV1;
};

const toJournalCreateInput = (
  journal: AccountingPostedCorrectionTargetJournalSnapshotV1,
): AccountingJournalCreateInput => ({
  idempotencyKey: journal.idempotencyKey,
  kind: journal.kind,
  source: journal.source,
  sourceFactType: journal.sourceFactType,
  sourceFactStableId: journal.sourceFactStableId,
  sourceFactVersion: journal.sourceFactVersion,
  storeStableId: journal.storeStableId,
  occurredAt: journal.occurredAt,
  currency: journal.currency,
  memo: journal.memo,
  lines: journal.lines.map<AccountingJournalLineInput>((line) => ({
    accountStableId: line.accountStableId,
    categoryStableId: line.categoryStableId,
    debitCents: line.debitCents,
    creditCents: line.creditCents,
    memo: line.memo,
  })),
});

const journalPostingVector = (
  journal: AccountingPostedCorrectionTargetJournalSnapshotV1,
): AccountingPostedCorrectionPostingVectorV1 =>
  buildPostedCorrectionTargetJournalSetSnapshot({
    currency: journal.currency,
    journals: [toJournalCreateInput(journal)],
  }).postingVector;

const anchorOf = (
  journal: AccountingPostedCorrectionTargetJournalSnapshotV1,
): AccountingPostedCorrectionExecutionJournalAnchorV1 => ({
  source: journal.source,
  storeStableId: journal.storeStableId,
  occurredAt: journal.occurredAt,
  currency: journal.currency,
});

const sameDeltaStructure = (
  current: AccountingPostedCorrectionTargetJournalSnapshotV1,
  target: AccountingPostedCorrectionTargetJournalSnapshotV1,
): boolean =>
  current.kind === target.kind &&
  current.source === target.source &&
  current.sourceFactType === target.sourceFactType &&
  current.sourceFactStableId === target.sourceFactStableId &&
  current.sourceFactVersion === target.sourceFactVersion &&
  current.storeStableId === target.storeStableId &&
  current.occurredAt === target.occurredAt &&
  current.currency === target.currency;

const vectorForDrafts = (
  currency: string,
  drafts: AccountingPostedCorrectionExecutionJournalDraftV1[],
): AccountingPostedCorrectionPostingVectorV1 =>
  buildPostedCorrectionTargetJournalSetSnapshot({
    currency,
    journals: drafts.map((draft) => ({
      idempotencyKey: `correction-execution-draft:${draft.role}:${draft.sequence}`,
      kind: AccountingJournalEntryKind.ADJUSTMENT,
      source: draft.anchor.source,
      storeStableId: draft.anchor.storeStableId,
      occurredAt: draft.anchor.occurredAt,
      currency: draft.anchor.currency,
      lines: draft.postingVector.lines,
    })),
  }).postingVector;

const assertAggregate = (
  field: string,
  currency: string,
  drafts: AccountingPostedCorrectionExecutionJournalDraftV1[],
  expected: AccountingPostedCorrectionPostingVectorV1,
): void => {
  const actual = vectorForDrafts(currency, drafts);
  if (
    hashPostedCorrectionPostingVector(actual) !==
    hashPostedCorrectionPostingVector(expected)
  ) {
    throw new AccountingPostedFinancialCorrectionExecutionPolicyError(
      `${field} output journals do not match the reviewed posting vector`,
    );
  }
};

const currentBusinessSet = (
  currency: string,
  journals: AccountingJournalCreateInput[],
) =>
  buildPostedCorrectionTargetJournalSetSnapshot({
    currency,
    journals,
  });

const orderedByIdempotencyKey = (
  journals: AccountingPostedCorrectionTargetJournalSnapshotV1[],
) =>
  [...journals].sort((left, right) =>
    left.idempotencyKey.localeCompare(right.idempotencyKey),
  );

const buildDeltaDrafts = (
  currentJournals: AccountingPostedCorrectionTargetJournalSnapshotV1[],
  targetJournals: AccountingPostedCorrectionTargetJournalSnapshotV1[],
): AccountingPostedCorrectionExecutionJournalDraftV1[] => {
  const currentByKey = new Map(
    currentJournals.map((journal) => [journal.idempotencyKey, journal] as const),
  );
  const targetByKey = new Map(
    targetJournals.map((journal) => [journal.idempotencyKey, journal] as const),
  );
  const currentKeys = [...currentByKey.keys()].sort();
  const targetKeys = [...targetByKey.keys()].sort();
  if (currentKeys.join('\u0000') !== targetKeys.join('\u0000')) {
    throw new AccountingPostedFinancialCorrectionExecutionPolicyError(
      'DELTA correction changed the owner Journal set identity; use REVERSAL_REPOST',
    );
  }

  const drafts: AccountingPostedCorrectionExecutionJournalDraftV1[] = [];
  for (const key of currentKeys) {
    const current = currentByKey.get(key);
    const target = targetByKey.get(key);
    if (!current || !target) {
      throw new AccountingPostedFinancialCorrectionExecutionPolicyError(
        'DELTA correction Journal pairing is incomplete',
      );
    }
    if (!sameDeltaStructure(current, target)) {
      throw new AccountingPostedFinancialCorrectionExecutionPolicyError(
        `DELTA correction changed structural Journal authority for ${key}; use REVERSAL_REPOST`,
      );
    }

    const postingVector = calculatePostedCorrectionDelta({
      current: journalPostingVector(current),
      target: journalPostingVector(target),
    });
    if (postingVector.lines.length === 0) continue;
    drafts.push({
      role: AccountingPostedCorrectionJournalOutputRole.DELTA,
      sequence: drafts.length + 1,
      basisJournalIdempotencyKey: key,
      anchor: anchorOf(target),
      postingVector,
    });
  }
  return drafts;
};

const buildReversalDrafts = (
  currentJournals: AccountingPostedCorrectionTargetJournalSnapshotV1[],
): AccountingPostedCorrectionExecutionJournalDraftV1[] =>
  orderedByIdempotencyKey(currentJournals).map((journal, index) => ({
    role: AccountingPostedCorrectionJournalOutputRole.REVERSAL,
    sequence: index + 1,
    basisJournalIdempotencyKey: journal.idempotencyKey,
    anchor: anchorOf(journal),
    postingVector: calculatePostedCorrectionDelta({
      current: journalPostingVector(journal),
      target: {
        version: 1,
        currency: journal.currency,
        lines: [],
      },
    }),
  }));

const buildRepostDrafts = (
  targetJournals: AccountingPostedCorrectionTargetJournalSnapshotV1[],
): AccountingPostedCorrectionExecutionJournalDraftV1[] =>
  orderedByIdempotencyKey(targetJournals).map((journal, index) => ({
    role: AccountingPostedCorrectionJournalOutputRole.REPOST,
    sequence: index + 1,
    basisJournalIdempotencyKey: journal.idempotencyKey,
    anchor: anchorOf(journal),
    postingVector: journalPostingVector(journal),
  }));

export const buildPostedCorrectionExecutionJournalDrafts = (input: {
  plan: AccountingPostedCorrectionPreviewPlanV1;
  currentBusinessJournals: AccountingJournalCreateInput[];
}): AccountingPostedCorrectionExecutionJournalDraftV1[] => {
  const { plan } = input;
  const currency = plan.currentEffectiveJournalSet.currency;
  if (plan.targetJournalSet.currency !== currency) {
    throw new AccountingPostedFinancialCorrectionExecutionPolicyError(
      'reviewed correction Journal sets use different currencies',
    );
  }

  const currentSet = currentBusinessSet(currency, input.currentBusinessJournals);
  if (
    hashPostedCorrectionPostingVector(currentSet.postingVector) !==
    hashPostedCorrectionPostingVector(
      plan.currentEffectiveJournalSet.postingVector,
    )
  ) {
    throw new AccountingPostedFinancialCorrectionExecutionPolicyError(
      'current business Journal set no longer matches Current Effective Posting',
    );
  }

  const strategy = plan.authority.strategy;
  if (strategy === AccountingPostedCorrectionStrategy.DELTA) {
    const drafts = buildDeltaDrafts(
      currentSet.journals,
      plan.targetJournalSet.journals,
    );
    assertAggregate('DELTA', currency, drafts, plan.deltaPosting);
    if (plan.deltaPosting.lines.length > 0 && drafts.length === 0) {
      throw new AccountingPostedFinancialCorrectionExecutionPolicyError(
        'financial DELTA requires at least one correction Journal',
      );
    }
    return drafts;
  }

  const reversalDrafts = buildReversalDrafts(currentSet.journals);
  if (!plan.reversalPosting) {
    throw new AccountingPostedFinancialCorrectionExecutionPolicyError(
      `${strategy} is missing its reviewed reversal posting`,
    );
  }
  assertAggregate(
    'REVERSAL',
    currency,
    reversalDrafts,
    plan.reversalPosting,
  );

  if (strategy === AccountingPostedCorrectionStrategy.REVERSAL_ONLY) {
    return reversalDrafts;
  }

  if (strategy !== AccountingPostedCorrectionStrategy.REVERSAL_REPOST) {
    throw new AccountingPostedFinancialCorrectionExecutionPolicyError(
      `unsupported correction strategy: ${strategy}`,
    );
  }
  if (!plan.repostPosting) {
    throw new AccountingPostedFinancialCorrectionExecutionPolicyError(
      'REVERSAL_REPOST is missing its reviewed repost posting',
    );
  }
  const repostDrafts = buildRepostDrafts(plan.targetJournalSet.journals);
  assertAggregate('REPOST', currency, repostDrafts, plan.repostPosting);
  return [...reversalDrafts, ...repostDrafts];
};
