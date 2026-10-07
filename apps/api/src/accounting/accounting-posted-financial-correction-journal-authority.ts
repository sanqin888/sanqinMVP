import {
  AccountingJournalEntryKind,
  AccountingJournalSource,
} from './accounting-contracts';
import {
  ACCOUNTING_POSTED_FINANCIAL_CORRECTION_SOURCE_FACT_TYPE,
  AccountingPostedCorrectionJournalOutputRole,
  AccountingPostedCorrectionTargetKind,
  type AccountingPostedCorrectionPostingVectorV1,
} from './accounting-posted-financial-correction.contract';
import type {
  AccountingPostedCorrectionExecutionJournalDraftV1,
} from './accounting-posted-financial-correction-execution.policy';
import {
  hashPostedCorrectionPostingVector,
  normalizePostedCorrectionPostingVector,
} from './accounting-posted-financial-correction.policy';
import { hashAccountingJson } from './accounting-inbox-core.policy';
import {
  AccountingJournalPolicyError,
  hashJournalCreatePayload,
  type AccountingJournalCreateInput,
  type NormalizedJournalCreate,
} from './accounting-journal-policy';

export type AccountingPostedCorrectionJournalWriteAuthorityV1 = {
  version: 1;
  role: 'POSTED_FINANCIAL_CORRECTION';
  correctionStableId: string;
  correctionRevisionStableId: string;
  correctionRevision: number;
  targetKind: AccountingPostedCorrectionTargetKind;
  targetStableId: string;
  targetVersion: number;
  planHash: string;
  outputRole: AccountingPostedCorrectionJournalOutputRole;
  sequence: number;
  basisJournalIdempotencyKey: string;
  anchor: {
    source: AccountingJournalSource;
    storeStableId: string | null;
    occurredAt: string;
    currency: string;
  };
  postingVector: AccountingPostedCorrectionPostingVectorV1;
};

export type AccountingPostedCorrectionJournalWritePlanV1 = {
  journal: AccountingJournalCreateInput;
  authority: AccountingPostedCorrectionJournalWriteAuthorityV1;
};

const requireValue = (
  raw: unknown,
  field: string,
  maxLength = 500,
): string => {
  if (typeof raw !== 'string') {
    throw new AccountingJournalPolicyError(`${field} must be a string`);
  }
  const value = raw.trim();
  if (!value) throw new AccountingJournalPolicyError(`${field} is required`);
  if (value.length > maxLength) {
    throw new AccountingJournalPolicyError(
      `${field} must not exceed ${maxLength} characters`,
    );
  }
  return value;
};

const optionalValue = (raw: unknown, field: string): string | null => {
  if (raw == null) return null;
  if (typeof raw !== 'string') {
    throw new AccountingJournalPolicyError(`${field} must be a string`);
  }
  return raw.trim() || null;
};

const requirePositiveInteger = (value: number, field: string): number => {
  if (!Number.isSafeInteger(value) || value < 1) {
    throw new AccountingJournalPolicyError(
      `${field} must be a positive integer`,
    );
  }
  return value;
};

const requireSha256 = (raw: unknown, field: string): string => {
  const value = requireValue(raw, field, 64).toLowerCase();
  if (!/^[a-f0-9]{64}$/.test(value)) {
    throw new AccountingJournalPolicyError(
      `${field} must be a lowercase SHA-256 hex digest`,
    );
  }
  return value;
};

const requireTargetKind = (
  value: AccountingPostedCorrectionTargetKind,
): AccountingPostedCorrectionTargetKind => {
  if (!Object.values(AccountingPostedCorrectionTargetKind).includes(value)) {
    throw new AccountingJournalPolicyError(
      'posted correction targetKind is unsupported',
    );
  }
  return value;
};

const requireOutputRole = (
  value: AccountingPostedCorrectionJournalOutputRole,
): AccountingPostedCorrectionJournalOutputRole => {
  if (
    !Object.values(AccountingPostedCorrectionJournalOutputRole).includes(value)
  ) {
    throw new AccountingJournalPolicyError(
      'posted correction outputRole is unsupported',
    );
  }
  return value;
};

const requireSource = (
  value: AccountingJournalSource,
): AccountingJournalSource => {
  if (!Object.values(AccountingJournalSource).includes(value)) {
    throw new AccountingJournalPolicyError(
      'posted correction Journal source is unsupported',
    );
  }
  return value;
};

const requireCurrency = (raw: unknown): string => {
  const currency = requireValue(raw, 'anchor.currency', 3).toUpperCase();
  if (!/^[A-Z]{3}$/.test(currency)) {
    throw new AccountingJournalPolicyError(
      'anchor.currency must be a 3-letter code',
    );
  }
  return currency;
};

const requireOccurredAt = (raw: unknown): string => {
  const value = requireValue(raw, 'anchor.occurredAt', 100);
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) {
    throw new AccountingJournalPolicyError(
      'anchor.occurredAt must be a valid date',
    );
  }
  return parsed.toISOString();
};

export const buildPostedCorrectionJournalIdempotencyKey = (input: {
  correctionStableId: string;
  outputRole: AccountingPostedCorrectionJournalOutputRole;
  sequence: number;
}): string => {
  const correctionStableId = requireValue(
    input.correctionStableId,
    'correctionStableId',
    250,
  );
  const outputRole = requireOutputRole(input.outputRole);
  const sequence = requirePositiveInteger(input.sequence, 'sequence');
  return `posted-correction:${correctionStableId}:${outputRole.toLowerCase()}:${sequence}:v1`;
};

export const normalizePostedCorrectionJournalWriteAuthority = (
  raw: AccountingPostedCorrectionJournalWriteAuthorityV1,
): AccountingPostedCorrectionJournalWriteAuthorityV1 => {
  if (raw.version !== 1 || raw.role !== 'POSTED_FINANCIAL_CORRECTION') {
    throw new AccountingJournalPolicyError(
      'posted correction Journal write authority must use version 1',
    );
  }
  const postingVector = normalizePostedCorrectionPostingVector(
    raw.postingVector,
    'postingVector',
  );
  if (postingVector.lines.length < 2) {
    throw new AccountingJournalPolicyError(
      'posted correction Journal requires a non-empty balanced posting vector',
    );
  }
  const currency = requireCurrency(raw.anchor.currency);
  if (currency !== postingVector.currency) {
    throw new AccountingJournalPolicyError(
      'posted correction anchor currency must match its posting vector',
    );
  }

  return {
    version: 1,
    role: 'POSTED_FINANCIAL_CORRECTION',
    correctionStableId: requireValue(
      raw.correctionStableId,
      'correctionStableId',
      250,
    ),
    correctionRevisionStableId: requireValue(
      raw.correctionRevisionStableId,
      'correctionRevisionStableId',
      250,
    ),
    correctionRevision: requirePositiveInteger(
      raw.correctionRevision,
      'correctionRevision',
    ),
    targetKind: requireTargetKind(raw.targetKind),
    targetStableId: requireValue(raw.targetStableId, 'targetStableId', 250),
    targetVersion: requirePositiveInteger(raw.targetVersion, 'targetVersion'),
    planHash: requireSha256(raw.planHash, 'planHash'),
    outputRole: requireOutputRole(raw.outputRole),
    sequence: requirePositiveInteger(raw.sequence, 'sequence'),
    basisJournalIdempotencyKey: requireValue(
      raw.basisJournalIdempotencyKey,
      'basisJournalIdempotencyKey',
      500,
    ),
    anchor: {
      source: requireSource(raw.anchor.source),
      storeStableId: optionalValue(
        raw.anchor.storeStableId,
        'anchor.storeStableId',
      ),
      occurredAt: requireOccurredAt(raw.anchor.occurredAt),
      currency,
    },
    postingVector,
  };
};

const correctionMemo = (
  authority: AccountingPostedCorrectionJournalWriteAuthorityV1,
): string =>
  [
    'Posted correction',
    authority.correctionStableId,
    authority.outputRole,
    `#${authority.sequence}`,
  ].join(' ');

export const buildPostedCorrectionJournalWritePlan = (input: {
  correctionStableId: string;
  correctionRevisionStableId: string;
  correctionRevision: number;
  targetKind: AccountingPostedCorrectionTargetKind;
  targetStableId: string;
  targetVersion: number;
  planHash: string;
  draft: AccountingPostedCorrectionExecutionJournalDraftV1;
}): AccountingPostedCorrectionJournalWritePlanV1 => {
  const authority = normalizePostedCorrectionJournalWriteAuthority({
    version: 1,
    role: 'POSTED_FINANCIAL_CORRECTION',
    correctionStableId: input.correctionStableId,
    correctionRevisionStableId: input.correctionRevisionStableId,
    correctionRevision: input.correctionRevision,
    targetKind: input.targetKind,
    targetStableId: input.targetStableId,
    targetVersion: input.targetVersion,
    planHash: input.planHash,
    outputRole: input.draft.role,
    sequence: input.draft.sequence,
    basisJournalIdempotencyKey: input.draft.basisJournalIdempotencyKey,
    anchor: input.draft.anchor,
    postingVector: input.draft.postingVector,
  });
  const journal: AccountingJournalCreateInput = {
    idempotencyKey: buildPostedCorrectionJournalIdempotencyKey(authority),
    kind: AccountingJournalEntryKind.ADJUSTMENT,
    source: authority.anchor.source,
    sourceFactType: ACCOUNTING_POSTED_FINANCIAL_CORRECTION_SOURCE_FACT_TYPE,
    sourceFactStableId: authority.correctionStableId,
    sourceFactVersion: authority.correctionRevision,
    storeStableId: authority.anchor.storeStableId,
    occurredAt: authority.anchor.occurredAt,
    currency: authority.anchor.currency,
    memo: correctionMemo(authority),
    lines: authority.postingVector.lines.map((line) => ({
      accountStableId: line.accountStableId,
      categoryStableId: line.categoryStableId,
      debitCents: line.debitCents,
      creditCents: line.creditCents,
      memo: null,
    })),
  };
  return { journal, authority };
};

export const assertPostedCorrectionJournalAuthority = (
  journal: NormalizedJournalCreate,
  rawAuthority: AccountingPostedCorrectionJournalWriteAuthorityV1,
): void => {
  const authority = normalizePostedCorrectionJournalWriteAuthority(rawAuthority);
  if (journal.kind !== AccountingJournalEntryKind.ADJUSTMENT) {
    throw new AccountingJournalPolicyError(
      'posted correction Journal kind must be ADJUSTMENT',
    );
  }
  if (journal.source !== authority.anchor.source) {
    throw new AccountingJournalPolicyError(
      'posted correction Journal source does not match its authority',
    );
  }
  if (
    journal.sourceFactType !==
      ACCOUNTING_POSTED_FINANCIAL_CORRECTION_SOURCE_FACT_TYPE ||
    journal.sourceFactStableId !== authority.correctionStableId ||
    journal.sourceFactVersion !== authority.correctionRevision
  ) {
    throw new AccountingJournalPolicyError(
      'posted correction Journal source fact does not match its authority',
    );
  }
  if (
    journal.idempotencyKey !==
    buildPostedCorrectionJournalIdempotencyKey(authority)
  ) {
    throw new AccountingJournalPolicyError(
      'posted correction Journal idempotency key does not match its authority',
    );
  }
  if (
    journal.storeStableId !== authority.anchor.storeStableId ||
    journal.occurredAt.toISOString() !== authority.anchor.occurredAt ||
    journal.currency !== authority.anchor.currency
  ) {
    throw new AccountingJournalPolicyError(
      'posted correction Journal anchor does not match its authority',
    );
  }
  if (journal.memo !== correctionMemo(authority)) {
    throw new AccountingJournalPolicyError(
      'posted correction Journal memo does not match its authority',
    );
  }

  const actualPosting = normalizePostedCorrectionPostingVector(
    {
      version: 1,
      currency: journal.currency,
      lines: journal.lines.map((line) => ({
        accountStableId: line.accountStableId,
        categoryStableId: line.categoryStableId,
        debitCents: line.debitCents,
        creditCents: line.creditCents,
      })),
    },
    'journalPosting',
  );
  if (
    hashPostedCorrectionPostingVector(actualPosting) !==
    hashPostedCorrectionPostingVector(authority.postingVector)
  ) {
    throw new AccountingJournalPolicyError(
      'posted correction Journal lines do not match its reviewed posting vector',
    );
  }
};

export const hashPostedCorrectionJournalWrite = (
  journal: NormalizedJournalCreate,
  rawAuthority: AccountingPostedCorrectionJournalWriteAuthorityV1,
): string => {
  const authority = normalizePostedCorrectionJournalWriteAuthority(rawAuthority);
  assertPostedCorrectionJournalAuthority(journal, authority);
  return hashAccountingJson({
    journalHash: hashJournalCreatePayload(journal),
    authority,
  });
};
