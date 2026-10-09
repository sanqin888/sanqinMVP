import {
  AccountingPostedCorrectionReasonCode,
  AccountingPostedCorrectionStrategy,
  AccountingPostedCorrectionTargetKind,
  type AccountingPostedCorrectionJournalAnchorRefV1,
  type AccountingPostedCorrectionPostedJournalAnchorV1,
  type AccountingPostedCorrectionPostedJournalSetSnapshotV1,
  type AccountingPostedCorrectionPostingVectorLineV1,
  type AccountingPostedCorrectionPostingVectorV1,
  type AccountingPostedCorrectionPreviewAuthorityV1,
  type AccountingPostedCorrectionPreviewPlanV1,
  type AccountingPostedCorrectionTargetJournalSetSnapshotV1,
  type AccountingPostedCorrectionTargetJournalSnapshotV1,
} from './accounting-posted-financial-correction.contract';
import { hashAccountingJson } from './accounting-inbox-core.policy';
import {
  hashJournalCreatePayload,
  normalizeJournalCreate,
  type AccountingJournalCreateInput,
  type NormalizedJournalCreate,
} from './accounting-journal-policy';

export class AccountingPostedFinancialCorrectionPolicyError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'AccountingPostedFinancialCorrectionPolicyError';
  }
}

export type AccountingPostedCorrectionPreviewPlanInputV1 = {
  correctionStableId: string;
  targetKind: AccountingPostedCorrectionTargetKind;
  targetStableId: string;
  targetVersion: number;
  strategy: AccountingPostedCorrectionStrategy;
  reasonCode: AccountingPostedCorrectionReasonCode;
  baseAuthoritySchema: string;
  baseAuthorityHash: string;
  targetAuthoritySchema: string;
  targetAuthorityHash: string;
  schemaTransition?: {
    version: 1;
    fromSchema: string;
    fromHash: string;
    toSchema: string;
    equivalentBaseHash: string;
  };
  currency: string;
  originalJournals: AccountingPostedCorrectionPostedJournalAnchorV1[];
  priorCorrectionJournals: AccountingPostedCorrectionPostedJournalAnchorV1[];
  targetJournals: AccountingJournalCreateInput[];
};

type PostingVectorAccumulator = Map<
  string,
  {
    accountStableId: string;
    categoryStableId: string | null;
    signedCents: number;
  }
>;

const requireValue = (raw: string, field: string): string => {
  const value = raw?.trim();
  if (!value) {
    throw new AccountingPostedFinancialCorrectionPolicyError(
      `${field} is required`,
    );
  }
  return value;
};

const optionalValue = (raw: string | null | undefined): string | null => {
  if (raw == null) return null;
  const value = raw.trim();
  return value || null;
};

const requireCurrency = (raw: string): string => {
  const value = requireValue(raw, 'currency').toUpperCase();
  if (!/^[A-Z]{3}$/.test(value)) {
    throw new AccountingPostedFinancialCorrectionPolicyError(
      'currency must be a 3-letter code',
    );
  }
  return value;
};

const requireSha256 = (raw: string, field: string): string => {
  const value = requireValue(raw, field).toLowerCase();
  if (!/^[a-f0-9]{64}$/.test(value)) {
    throw new AccountingPostedFinancialCorrectionPolicyError(
      `${field} must be a lowercase SHA-256 hex digest`,
    );
  }
  return value;
};

const requirePositiveInteger = (value: number, field: string): number => {
  if (!Number.isSafeInteger(value) || value < 1) {
    throw new AccountingPostedFinancialCorrectionPolicyError(
      `${field} must be a positive integer`,
    );
  }
  return value;
};

const requireTargetKind = (
  value: AccountingPostedCorrectionTargetKind,
): AccountingPostedCorrectionTargetKind => {
  if (!Object.values(AccountingPostedCorrectionTargetKind).includes(value)) {
    throw new AccountingPostedFinancialCorrectionPolicyError(
      'targetKind is unsupported',
    );
  }
  return value;
};

const requireStrategy = (
  value: AccountingPostedCorrectionStrategy,
): AccountingPostedCorrectionStrategy => {
  if (!Object.values(AccountingPostedCorrectionStrategy).includes(value)) {
    throw new AccountingPostedFinancialCorrectionPolicyError(
      'strategy is unsupported',
    );
  }
  return value;
};

const requireReasonCode = (
  value: AccountingPostedCorrectionReasonCode,
): AccountingPostedCorrectionReasonCode => {
  if (!Object.values(AccountingPostedCorrectionReasonCode).includes(value)) {
    throw new AccountingPostedFinancialCorrectionPolicyError(
      'reasonCode is unsupported',
    );
  }
  return value;
};

const requireMinorUnits = (value: number, field: string): number => {
  if (!Number.isSafeInteger(value) || value < 0) {
    throw new AccountingPostedFinancialCorrectionPolicyError(
      `${field} must be a non-negative safe integer`,
    );
  }
  return value;
};

const addSafeInteger = (left: number, right: number, field: string): number => {
  const value = left + right;
  if (!Number.isSafeInteger(value)) {
    throw new AccountingPostedFinancialCorrectionPolicyError(
      `${field} exceeds safe integer range`,
    );
  }
  return value;
};

const postingVectorKey = (
  accountStableId: string,
  categoryStableId: string | null,
): string => `${accountStableId}\u0000${categoryStableId ?? ''}`;

const addPostingVectorAmount = (
  accumulator: PostingVectorAccumulator,
  line: {
    accountStableId: string;
    categoryStableId: string | null;
    debitCents: number;
    creditCents: number;
  },
  multiplier: 1 | -1 = 1,
) => {
  const key = postingVectorKey(line.accountStableId, line.categoryStableId);
  const existing = accumulator.get(key);
  const signedCents = addSafeInteger(
    line.debitCents,
    -line.creditCents,
    'posting vector line',
  );
  const adjusted = multiplier === 1 ? signedCents : -signedCents;
  if (!Number.isSafeInteger(adjusted)) {
    throw new AccountingPostedFinancialCorrectionPolicyError(
      'posting vector line exceeds safe integer range',
    );
  }
  const next = addSafeInteger(
    existing?.signedCents ?? 0,
    adjusted,
    'posting vector aggregate',
  );
  accumulator.set(key, {
    accountStableId: line.accountStableId,
    categoryStableId: line.categoryStableId,
    signedCents: next,
  });
};

const finalizePostingVector = (
  currency: string,
  accumulator: PostingVectorAccumulator,
): AccountingPostedCorrectionPostingVectorV1 => {
  let debitTotal = 0;
  let creditTotal = 0;
  const lines = [...accumulator.values()]
    .filter((line) => line.signedCents !== 0)
    .sort(
      (left, right) =>
        left.accountStableId.localeCompare(right.accountStableId) ||
        (left.categoryStableId ?? '').localeCompare(
          right.categoryStableId ?? '',
        ),
    )
    .map<AccountingPostedCorrectionPostingVectorLineV1>((line) => {
      const debitCents = line.signedCents > 0 ? line.signedCents : 0;
      const creditCents = line.signedCents < 0 ? -line.signedCents : 0;
      debitTotal = addSafeInteger(
        debitTotal,
        debitCents,
        'posting debit total',
      );
      creditTotal = addSafeInteger(
        creditTotal,
        creditCents,
        'posting credit total',
      );
      return {
        accountStableId: line.accountStableId,
        categoryStableId: line.categoryStableId,
        debitCents,
        creditCents,
      };
    });

  if (debitTotal !== creditTotal) {
    throw new AccountingPostedFinancialCorrectionPolicyError(
      `posting vector does not balance: debit(${debitTotal}) != credit(${creditTotal})`,
    );
  }

  return { version: 1, currency, lines };
};

const normalizePostedJournal = (
  journal: AccountingPostedCorrectionPostedJournalAnchorV1,
  expectedCurrency: string,
): AccountingPostedCorrectionPostedJournalAnchorV1 => {
  const currency = requireCurrency(journal.currency);
  if (currency !== expectedCurrency) {
    throw new AccountingPostedFinancialCorrectionPolicyError(
      `posted Journal currency mismatch for ${journal.entryStableId}`,
    );
  }

  const sourceFactType = optionalValue(journal.sourceFactType);
  const sourceFactStableId = optionalValue(journal.sourceFactStableId);
  if ((sourceFactType === null) !== (sourceFactStableId === null)) {
    throw new AccountingPostedFinancialCorrectionPolicyError(
      'sourceFactType and sourceFactStableId must be provided together',
    );
  }
  const sourceFactVersion =
    journal.sourceFactVersion == null
      ? null
      : requirePositiveInteger(journal.sourceFactVersion, 'sourceFactVersion');
  if (sourceFactVersion !== null && sourceFactStableId === null) {
    throw new AccountingPostedFinancialCorrectionPolicyError(
      'sourceFactVersion requires a source fact identity',
    );
  }

  if (!Array.isArray(journal.lines) || journal.lines.length < 2) {
    throw new AccountingPostedFinancialCorrectionPolicyError(
      'posted Journal requires at least two lines',
    );
  }

  const lineNos = new Set<number>();
  let debitTotal = 0;
  let creditTotal = 0;
  const lines = journal.lines
    .map((line) => {
      const lineNo = requirePositiveInteger(line.lineNo, 'lineNo');
      if (lineNos.has(lineNo)) {
        throw new AccountingPostedFinancialCorrectionPolicyError(
          `duplicate posted Journal lineNo: ${lineNo}`,
        );
      }
      lineNos.add(lineNo);
      const debitCents = requireMinorUnits(line.debitCents, 'debitCents');
      const creditCents = requireMinorUnits(line.creditCents, 'creditCents');
      if (
        (debitCents > 0 && creditCents > 0) ||
        (debitCents === 0 && creditCents === 0)
      ) {
        throw new AccountingPostedFinancialCorrectionPolicyError(
          'posted Journal line must contain exactly one positive debit or credit',
        );
      }
      debitTotal = addSafeInteger(
        debitTotal,
        debitCents,
        'posted Journal debit total',
      );
      creditTotal = addSafeInteger(
        creditTotal,
        creditCents,
        'posted Journal credit total',
      );
      return {
        lineNo,
        accountStableId: requireValue(
          line.accountStableId,
          'line.accountStableId',
        ),
        categoryStableId: optionalValue(line.categoryStableId),
        debitCents,
        creditCents,
        memo: optionalValue(line.memo),
      };
    })
    .sort((left, right) => left.lineNo - right.lineNo);

  if (debitTotal !== creditTotal) {
    throw new AccountingPostedFinancialCorrectionPolicyError(
      `posted Journal does not balance: debit(${debitTotal}) != credit(${creditTotal})`,
    );
  }

  const occurredAt = new Date(journal.occurredAt);
  if (Number.isNaN(occurredAt.getTime())) {
    throw new AccountingPostedFinancialCorrectionPolicyError(
      'occurredAt must be a valid date',
    );
  }

  return {
    entryStableId: requireValue(journal.entryStableId, 'entryStableId'),
    idempotencyKey: requireValue(journal.idempotencyKey, 'idempotencyKey'),
    idempotencyHash: requireSha256(journal.idempotencyHash, 'idempotencyHash'),
    version: requirePositiveInteger(journal.version, 'version'),
    kind: journal.kind,
    source: journal.source,
    sourceFactType,
    sourceFactStableId,
    sourceFactVersion,
    storeStableId: optionalValue(journal.storeStableId),
    occurredAt: occurredAt.toISOString(),
    currency,
    memo: optionalValue(journal.memo),
    lines,
  };
};

const postingVectorFromPostedJournals = (
  currency: string,
  journals: AccountingPostedCorrectionPostedJournalAnchorV1[],
): AccountingPostedCorrectionPostingVectorV1 => {
  const accumulator: PostingVectorAccumulator = new Map();
  for (const journal of journals) {
    for (const line of journal.lines) {
      addPostingVectorAmount(accumulator, line);
    }
  }
  return finalizePostingVector(currency, accumulator);
};

const postingVectorFromTargetJournals = (
  currency: string,
  journals: AccountingPostedCorrectionTargetJournalSnapshotV1[],
): AccountingPostedCorrectionPostingVectorV1 => {
  const accumulator: PostingVectorAccumulator = new Map();
  for (const journal of journals) {
    for (const line of journal.lines) {
      addPostingVectorAmount(accumulator, line);
    }
  }
  return finalizePostingVector(currency, accumulator);
};

export const buildPostedCorrectionPostedJournalSetSnapshot = (input: {
  currency: string;
  journals: AccountingPostedCorrectionPostedJournalAnchorV1[];
  requireNonEmpty?: boolean;
}): AccountingPostedCorrectionPostedJournalSetSnapshotV1 => {
  const currency = requireCurrency(input.currency);
  if (!Array.isArray(input.journals)) {
    throw new AccountingPostedFinancialCorrectionPolicyError(
      'posted journals must be an array',
    );
  }
  if (input.requireNonEmpty && input.journals.length === 0) {
    throw new AccountingPostedFinancialCorrectionPolicyError(
      'original posted Journal set must not be empty',
    );
  }

  const journals = input.journals
    .map((journal) => normalizePostedJournal(journal, currency))
    .sort((left, right) =>
      left.entryStableId.localeCompare(right.entryStableId),
    );
  const stableIds = new Set(journals.map((journal) => journal.entryStableId));
  if (stableIds.size !== journals.length) {
    throw new AccountingPostedFinancialCorrectionPolicyError(
      'posted Journal set contains duplicate entryStableId values',
    );
  }
  const idempotencyKeys = new Set(
    journals.map((journal) => journal.idempotencyKey),
  );
  if (idempotencyKeys.size !== journals.length) {
    throw new AccountingPostedFinancialCorrectionPolicyError(
      'posted Journal set contains duplicate idempotencyKey values',
    );
  }

  const postingVector = postingVectorFromPostedJournals(currency, journals);
  const journalSetHash = hashAccountingJson({
    version: 1,
    currency,
    journals,
  });

  return {
    version: 1,
    currency,
    journals,
    postingVector,
    journalSetHash,
  };
};

const normalizeTargetJournal = (
  input: AccountingJournalCreateInput,
  expectedCurrency: string,
): AccountingPostedCorrectionTargetJournalSnapshotV1 => {
  let normalized: NormalizedJournalCreate;
  try {
    normalized = normalizeJournalCreate(input);
  } catch (error) {
    throw new AccountingPostedFinancialCorrectionPolicyError(
      error instanceof Error
        ? error.message
        : 'target Journal normalization failed',
    );
  }
  if (normalized.currency !== expectedCurrency) {
    throw new AccountingPostedFinancialCorrectionPolicyError(
      `target Journal currency mismatch for ${normalized.idempotencyKey}`,
    );
  }
  return {
    idempotencyKey: normalized.idempotencyKey,
    journalHash: hashJournalCreatePayload(normalized),
    kind: normalized.kind,
    source: normalized.source,
    sourceFactType: normalized.sourceFactType,
    sourceFactStableId: normalized.sourceFactStableId,
    sourceFactVersion: normalized.sourceFactVersion,
    storeStableId: normalized.storeStableId,
    occurredAt: normalized.occurredAt.toISOString(),
    currency: normalized.currency,
    memo: normalized.memo,
    lines: normalized.lines,
  };
};

export const buildPostedCorrectionTargetJournalSetSnapshot = (input: {
  currency: string;
  journals: AccountingJournalCreateInput[];
}): AccountingPostedCorrectionTargetJournalSetSnapshotV1 => {
  const currency = requireCurrency(input.currency);
  if (!Array.isArray(input.journals)) {
    throw new AccountingPostedFinancialCorrectionPolicyError(
      'target journals must be an array',
    );
  }
  const journals = input.journals
    .map((journal) => normalizeTargetJournal(journal, currency))
    .sort((left, right) =>
      left.idempotencyKey.localeCompare(right.idempotencyKey),
    );
  const idempotencyKeys = new Set(
    journals.map((journal) => journal.idempotencyKey),
  );
  if (idempotencyKeys.size !== journals.length) {
    throw new AccountingPostedFinancialCorrectionPolicyError(
      'target Journal set contains duplicate idempotencyKey values',
    );
  }
  const postingVector = postingVectorFromTargetJournals(currency, journals);
  const journalSetHash = hashAccountingJson({
    version: 1,
    currency,
    journals,
  });
  return {
    version: 1,
    currency,
    journals,
    postingVector,
    journalSetHash,
  };
};

export const normalizePostedCorrectionPostingVector = (
  postingVector: AccountingPostedCorrectionPostingVectorV1,
  field = 'posting',
): AccountingPostedCorrectionPostingVectorV1 => {
  if (postingVector.version !== 1) {
    throw new AccountingPostedFinancialCorrectionPolicyError(
      `${field}.version must be 1`,
    );
  }
  const currency = requireCurrency(postingVector.currency);
  if (!Array.isArray(postingVector.lines)) {
    throw new AccountingPostedFinancialCorrectionPolicyError(
      `${field}.lines must be an array`,
    );
  }

  const accumulator: PostingVectorAccumulator = new Map();
  const dimensions = new Set<string>();
  for (const [index, line] of postingVector.lines.entries()) {
    const accountStableId = requireValue(
      line.accountStableId,
      `${field}.lines[${index}].accountStableId`,
    );
    const categoryStableId = optionalValue(line.categoryStableId);
    const debitCents = requireMinorUnits(
      line.debitCents,
      `${field}.lines[${index}].debitCents`,
    );
    const creditCents = requireMinorUnits(
      line.creditCents,
      `${field}.lines[${index}].creditCents`,
    );
    if (
      (debitCents > 0 && creditCents > 0) ||
      (debitCents === 0 && creditCents === 0)
    ) {
      throw new AccountingPostedFinancialCorrectionPolicyError(
        `${field}.lines[${index}] must contain exactly one positive debit or credit`,
      );
    }
    const key = postingVectorKey(accountStableId, categoryStableId);
    if (dimensions.has(key)) {
      throw new AccountingPostedFinancialCorrectionPolicyError(
        `${field} contains duplicate posting dimensions`,
      );
    }
    dimensions.add(key);
    addPostingVectorAmount(accumulator, {
      accountStableId,
      categoryStableId,
      debitCents,
      creditCents,
    });
  }
  return finalizePostingVector(currency, accumulator);
};

export const hashPostedCorrectionPostingVector = (
  postingVector: AccountingPostedCorrectionPostingVectorV1,
): string =>
  hashAccountingJson(
    normalizePostedCorrectionPostingVector(postingVector, 'posting'),
  );

export const calculatePostedCorrectionDelta = (input: {
  current: AccountingPostedCorrectionPostingVectorV1;
  target: AccountingPostedCorrectionPostingVectorV1;
}): AccountingPostedCorrectionPostingVectorV1 => {
  const current = normalizePostedCorrectionPostingVector(
    input.current,
    'current',
  );
  const target = normalizePostedCorrectionPostingVector(input.target, 'target');
  if (current.currency !== target.currency) {
    throw new AccountingPostedFinancialCorrectionPolicyError(
      'current and target posting vectors must use the same currency',
    );
  }

  const accumulator: PostingVectorAccumulator = new Map();
  for (const line of target.lines) {
    addPostingVectorAmount(accumulator, line, 1);
  }
  for (const line of current.lines) {
    addPostingVectorAmount(accumulator, line, -1);
  }
  return finalizePostingVector(current.currency, accumulator);
};

const anchorRefs = (
  journals: AccountingPostedCorrectionPostedJournalAnchorV1[],
): AccountingPostedCorrectionJournalAnchorRefV1[] =>
  journals.map((journal) => ({
    entryStableId: journal.entryStableId,
    idempotencyKey: journal.idempotencyKey,
    idempotencyHash: journal.idempotencyHash,
    version: journal.version,
  }));

export const buildPostedFinancialCorrectionPreviewPlan = (
  input: AccountingPostedCorrectionPreviewPlanInputV1,
): AccountingPostedCorrectionPreviewPlanV1 => {
  const correctionStableId = requireValue(
    input.correctionStableId,
    'correctionStableId',
  );
  const targetKind = requireTargetKind(input.targetKind);
  const targetStableId = requireValue(input.targetStableId, 'targetStableId');
  const targetVersion = requirePositiveInteger(
    input.targetVersion,
    'targetVersion',
  );
  const strategy = requireStrategy(input.strategy);
  const reasonCode = requireReasonCode(input.reasonCode);
  const baseAuthoritySchema = requireValue(
    input.baseAuthoritySchema,
    'baseAuthoritySchema',
  );
  const baseAuthorityHash = requireSha256(
    input.baseAuthorityHash,
    'baseAuthorityHash',
  );
  const targetAuthoritySchema = requireValue(
    input.targetAuthoritySchema,
    'targetAuthoritySchema',
  );
  const transition = input.schemaTransition;
  if (baseAuthoritySchema === targetAuthoritySchema) {
    if (transition) {
      throw new AccountingPostedFinancialCorrectionPolicyError(
        'same-schema corrections must not declare a schema transition',
      );
    }
  } else if (
    !transition ||
    transition.version !== 1 ||
    transition.fromSchema !== baseAuthoritySchema ||
    transition.fromHash !== baseAuthorityHash ||
    transition.toSchema !== targetAuthoritySchema ||
    !/^[a-f0-9]{64}$/.test(transition.equivalentBaseHash) ||
    transition.equivalentBaseHash === input.targetAuthorityHash
  ) {
    throw new AccountingPostedFinancialCorrectionPolicyError(
      'base and target authority must use the same correction-target schema or a verified owner schema transition',
    );
  }
  const targetAuthorityHash = requireSha256(
    input.targetAuthorityHash,
    'targetAuthorityHash',
  );
  const currency = requireCurrency(input.currency);
  if (!Array.isArray(input.targetJournals)) {
    throw new AccountingPostedFinancialCorrectionPolicyError(
      'targetJournals must be an array',
    );
  }

  if (
    strategy === AccountingPostedCorrectionStrategy.REVERSAL_ONLY &&
    input.targetJournals.length > 0
  ) {
    throw new AccountingPostedFinancialCorrectionPolicyError(
      'REVERSAL_ONLY must not include target Journals',
    );
  }
  if (
    strategy !== AccountingPostedCorrectionStrategy.REVERSAL_ONLY &&
    input.targetJournals.length === 0
  ) {
    throw new AccountingPostedFinancialCorrectionPolicyError(
      `${strategy} requires a complete target Journal set`,
    );
  }

  const originalJournalSet = buildPostedCorrectionPostedJournalSetSnapshot({
    currency,
    journals: input.originalJournals,
    requireNonEmpty: true,
  });
  const priorCorrectionJournalSet =
    buildPostedCorrectionPostedJournalSetSnapshot({
      currency,
      journals: input.priorCorrectionJournals,
    });
  const currentEffectiveJournalSet =
    buildPostedCorrectionPostedJournalSetSnapshot({
      currency,
      journals: [
        ...originalJournalSet.journals,
        ...priorCorrectionJournalSet.journals,
      ],
      requireNonEmpty: true,
    });
  const targetJournalSet = buildPostedCorrectionTargetJournalSetSnapshot({
    currency,
    journals: input.targetJournals,
  });
  const deltaPosting = calculatePostedCorrectionDelta({
    current: currentEffectiveJournalSet.postingVector,
    target: targetJournalSet.postingVector,
  });
  const reversalPosting =
    strategy === AccountingPostedCorrectionStrategy.DELTA
      ? null
      : calculatePostedCorrectionDelta({
          current: currentEffectiveJournalSet.postingVector,
          target: {
            version: 1,
            currency,
            lines: [],
          },
        });
  const repostPosting =
    strategy === AccountingPostedCorrectionStrategy.REVERSAL_REPOST
      ? targetJournalSet.postingVector
      : null;
  const authorityChanged = baseAuthorityHash !== targetAuthorityHash;
  const financiallyChanged = deltaPosting.lines.length > 0;
  if (financiallyChanged && !authorityChanged) {
    throw new AccountingPostedFinancialCorrectionPolicyError(
      'target posting changed without a matching target authority change',
    );
  }

  const authority: AccountingPostedCorrectionPreviewAuthorityV1 = {
    version: 1,
    correctionStableId,
    targetKind,
    targetStableId,
    targetVersion,
    strategy,
    reasonCode,
    baseAuthoritySchema,
    baseAuthorityHash,
    targetAuthoritySchema,
    targetAuthorityHash,
    ...(transition ? { schemaTransition: transition } : {}),
    originalJournalSetHash: originalJournalSet.journalSetHash,
    priorCorrectionJournalSetHash: priorCorrectionJournalSet.journalSetHash,
    baseJournalSetHash: currentEffectiveJournalSet.journalSetHash,
    targetJournalSetHash: targetJournalSet.journalSetHash,
    currentEffectivePostingHash: hashPostedCorrectionPostingVector(
      currentEffectiveJournalSet.postingVector,
    ),
    targetPostingHash: hashPostedCorrectionPostingVector(
      targetJournalSet.postingVector,
    ),
    deltaPostingHash: hashPostedCorrectionPostingVector(deltaPosting),
    originalJournalAnchors: anchorRefs(originalJournalSet.journals),
    priorCorrectionJournalAnchors: anchorRefs(
      priorCorrectionJournalSet.journals,
    ),
  };

  return {
    version: 1,
    status: authorityChanged || financiallyChanged ? 'READY' : 'NOOP',
    authority,
    originalJournalSet,
    priorCorrectionJournalSet,
    currentEffectiveJournalSet,
    targetJournalSet,
    deltaPosting,
    reversalPosting,
    repostPosting,
    planHash: hashAccountingJson(authority),
  };
};
