import type {
  AccountingJournalEntryKind,
  AccountingJournalSource,
} from './accounting-contracts';

type ValueOf<T> = T[keyof T];

export const ACCOUNTING_POSTED_FINANCIAL_CORRECTION_SOURCE_FACT_TYPE =
  'accounting.posted_financial_correction.v1';
export const ACCOUNTING_POSTED_FINANCIAL_CORRECTION_READY_PREVIEW_SCHEMA =
  'accounting.posted_financial_correction_preview.v1';

export const AccountingPostedCorrectionStatus = {
  DRAFT: 'DRAFT',
  READY: 'READY',
  POSTED: 'POSTED',
  CANCELLED: 'CANCELLED',
} as const;
export type AccountingPostedCorrectionStatus = ValueOf<
  typeof AccountingPostedCorrectionStatus
>;

export const AccountingPostedCorrectionTargetKind = {
  PROVIDER_SETTLEMENT: 'PROVIDER_SETTLEMENT',
  EXPENSE: 'EXPENSE',
} as const;
export type AccountingPostedCorrectionTargetKind = ValueOf<
  typeof AccountingPostedCorrectionTargetKind
>;

export const AccountingPostedCorrectionStrategy = {
  DELTA: 'DELTA',
  REVERSAL_REPOST: 'REVERSAL_REPOST',
  REVERSAL_ONLY: 'REVERSAL_ONLY',
} as const;
export type AccountingPostedCorrectionStrategy = ValueOf<
  typeof AccountingPostedCorrectionStrategy
>;

export const AccountingPostedCorrectionJournalOutputRole = {
  DELTA: 'DELTA',
  REVERSAL: 'REVERSAL',
  REPOST: 'REPOST',
} as const;
export type AccountingPostedCorrectionJournalOutputRole = ValueOf<
  typeof AccountingPostedCorrectionJournalOutputRole
>;

export const AccountingPostedCorrectionReasonCode = {
  EXTRACTION_ERROR: 'EXTRACTION_ERROR',
  AMOUNT_ERROR: 'AMOUNT_ERROR',
  CLASSIFICATION_ERROR: 'CLASSIFICATION_ERROR',
  MISSING_COMPONENT: 'MISSING_COMPONENT',
  DUPLICATE_POSTING: 'DUPLICATE_POSTING',
  BUSINESS_FACT_ERROR: 'BUSINESS_FACT_ERROR',
  OTHER: 'OTHER',
} as const;
export type AccountingPostedCorrectionReasonCode = ValueOf<
  typeof AccountingPostedCorrectionReasonCode
>;

export type AccountingPostedCorrectionPostingVectorLineV1 = {
  accountStableId: string;
  categoryStableId: string | null;
  debitCents: number;
  creditCents: number;
};

export type AccountingPostedCorrectionPostingVectorV1 = {
  version: 1;
  currency: string;
  lines: AccountingPostedCorrectionPostingVectorLineV1[];
};

export type AccountingPostedCorrectionJournalLineAnchorV1 = {
  lineNo: number;
  accountStableId: string;
  categoryStableId: string | null;
  debitCents: number;
  creditCents: number;
  memo: string | null;
};

export type AccountingPostedCorrectionPostedJournalAnchorV1 = {
  entryStableId: string;
  idempotencyKey: string;
  idempotencyHash: string;
  version: number;
  kind: AccountingJournalEntryKind;
  source: AccountingJournalSource;
  sourceFactType: string | null;
  sourceFactStableId: string | null;
  sourceFactVersion: number | null;
  storeStableId: string | null;
  occurredAt: string;
  currency: string;
  memo: string | null;
  lines: AccountingPostedCorrectionJournalLineAnchorV1[];
};

export type AccountingPostedCorrectionPostedJournalSetSnapshotV1 = {
  version: 1;
  currency: string;
  journals: AccountingPostedCorrectionPostedJournalAnchorV1[];
  postingVector: AccountingPostedCorrectionPostingVectorV1;
  journalSetHash: string;
};

export type AccountingPostedCorrectionTargetJournalSnapshotV1 = {
  idempotencyKey: string;
  journalHash: string;
  kind: AccountingJournalEntryKind;
  source: AccountingJournalSource;
  sourceFactType: string | null;
  sourceFactStableId: string | null;
  sourceFactVersion: number | null;
  storeStableId: string | null;
  occurredAt: string;
  currency: string;
  memo: string | null;
  lines: Array<{
    accountStableId: string;
    categoryStableId: string | null;
    debitCents: number;
    creditCents: number;
    memo: string | null;
  }>;
};

export type AccountingPostedCorrectionTargetJournalSetSnapshotV1 = {
  version: 1;
  currency: string;
  journals: AccountingPostedCorrectionTargetJournalSnapshotV1[];
  postingVector: AccountingPostedCorrectionPostingVectorV1;
  journalSetHash: string;
};

export type AccountingPostedCorrectionJournalAnchorRefV1 = {
  entryStableId: string;
  idempotencyKey: string;
  idempotencyHash: string;
  version: number;
};

export type AccountingPostedCorrectionPreviewAuthorityV1 = {
  version: 1;
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
  originalJournalSetHash: string;
  priorCorrectionJournalSetHash: string;
  baseJournalSetHash: string;
  targetJournalSetHash: string;
  currentEffectivePostingHash: string;
  targetPostingHash: string;
  deltaPostingHash: string;
  originalJournalAnchors: AccountingPostedCorrectionJournalAnchorRefV1[];
  priorCorrectionJournalAnchors: AccountingPostedCorrectionJournalAnchorRefV1[];
};

export type AccountingPostedCorrectionPreviewPlanV1 = {
  version: 1;
  status: 'READY' | 'NOOP';
  authority: AccountingPostedCorrectionPreviewAuthorityV1;
  originalJournalSet: AccountingPostedCorrectionPostedJournalSetSnapshotV1;
  priorCorrectionJournalSet: AccountingPostedCorrectionPostedJournalSetSnapshotV1;
  currentEffectiveJournalSet: AccountingPostedCorrectionPostedJournalSetSnapshotV1;
  targetJournalSet: AccountingPostedCorrectionTargetJournalSetSnapshotV1;
  deltaPosting: AccountingPostedCorrectionPostingVectorV1;
  reversalPosting: AccountingPostedCorrectionPostingVectorV1 | null;
  repostPosting: AccountingPostedCorrectionPostingVectorV1 | null;
  planHash: string;
};
