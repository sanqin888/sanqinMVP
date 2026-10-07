import type { AccountingInboxItem } from './inbox';

export type AccountingExpenseRecordsPage = {
  items: AccountingExpenseDocument[];
  total: number;
  limit: number;
  offset: number;
};

export type AccountingExpenseDocument = {
  documentStableId: string;
  source: 'MANUAL' | 'GMAIL';
  status: 'PENDING_REVIEW' | 'CONFIRMED' | 'DUPLICATE' | 'ERROR' | 'DISCARDED';
  fundingAttributionVersion: 1 | 2;
  occurredAt: string | null;
  subtotalCents: number | null;
  taxCents: number | null;
  totalCents: number | null;
  currency: string;
  emailSubject: string | null;
  attachmentUrls: string[];
  sourceEvidence: {
    artifactStableId: string;
    kind: AccountingInboxItem['artifact']['kind'];
    originalFilename: string | null;
  } | null;
  extractedText: string | null;
  extraction: unknown;
  memo: string | null;
  createdAt: string;
  confirmedAt: string | null;
  correctionState: {
    canonicalPosted: boolean;
    activeCorrectionStatus: 'DRAFT' | 'READY' | null;
    hasPostedCorrections: boolean;
    correctionCount: number;
  };
  paymentAllocations: Array<{
    paymentAllocationStableId: string;
    accountStableId: string;
    accountName: string;
    amountCents: number;
    sortOrder: number;
  }>;
  splits: Array<{
    splitStableId: string;
    categoryStableId: string;
    categoryName: string;
    amountCents: number;
    taxCents: number;
    paidFromAccountStableId: string | null;
    paidFromAccountName: string | null;
    sortOrder: number;
  }>;
};

export type ExpensePostedCorrectionReasonCode =
  | 'EXTRACTION_ERROR'
  | 'AMOUNT_ERROR'
  | 'CLASSIFICATION_ERROR'
  | 'MISSING_COMPONENT'
  | 'BUSINESS_FACT_ERROR'
  | 'OTHER';

export type ExpensePostedCorrectionStatus =
  | 'DRAFT'
  | 'READY'
  | 'POSTED'
  | 'CANCELLED';

export type ExpensePostedCorrectionDraftSplit = {
  splitStableId: string;
  categoryStableId: string;
  amountCents: number;
  taxCents: number;
  paidFromAccountStableId?: string | null;
};

export type ExpensePostedCorrectionDraftAllocation = {
  paymentAllocationStableId: string;
  accountStableId: string;
  amountCents: number;
};

export type ExpensePostedCorrectionDraftInput = {
  version: 1;
  expectedBaseAuthorityHash: string;
  totalCents: number;
  memo?: string | null;
  splits: ExpensePostedCorrectionDraftSplit[];
  paymentAllocations?: ExpensePostedCorrectionDraftAllocation[];
};

export type ExpensePostedCorrectionPreview = {
  version: 1;
  status: 'READY' | 'NOOP';
  planHash: string;
  authority: {
    strategy: 'DELTA' | 'REVERSAL_REPOST' | 'REVERSAL_ONLY';
    reasonCode: ExpensePostedCorrectionReasonCode;
    baseAuthorityHash: string;
    targetAuthorityHash: string;
    baseJournalSetHash: string;
    targetJournalSetHash: string;
  };
  deltaPosting: {
    version: 1;
    currency: string;
    lines: Array<{
      accountStableId: string;
      categoryStableId: string | null;
      debitCents: number;
      creditCents: number;
    }>;
  };
};

export type ExpensePostedCorrectionJournal = {
  entryStableId: string;
  occurredAt: string;
  currency: string;
  memo: string | null;
  lines: Array<{
    lineNo: number;
    accountStableId: string;
    accountName: string;
    categoryStableId: string | null;
    categoryName: string | null;
    debitCents: number;
    creditCents: number;
  }>;
};

export type ExpensePostedCorrectionCase = {
  correctionStableId: string;
  version: number;
  targetVersion: 1 | 2;
  status: ExpensePostedCorrectionStatus;
  reasonCode: ExpensePostedCorrectionReasonCode;
  note: string | null;
  strategy: 'DELTA' | 'REVERSAL_REPOST' | 'REVERSAL_ONLY' | null;
  planHash: string | null;
  readyPreview: ExpensePostedCorrectionPreview | null;
  createdByActorRef: string;
  readyByActorRef: string | null;
  readyAt: string | null;
  postedByActorRef: string | null;
  postedAt: string | null;
  cancelledByActorRef: string | null;
  cancelledAt: string | null;
  createdAt: string;
  updatedAt: string;
  revisions: Array<{
    correctionRevisionStableId: string;
    revision: number;
    targetAuthoritySchema: string;
    targetAuthorityHash: string;
    draftInput: ExpensePostedCorrectionDraftInput;
    createdByActorRef: string;
    createdAt: string;
  }>;
  journalOutputs: Array<{
    outputStableId: string;
    role: 'DELTA' | 'REVERSAL' | 'REPOST';
    sequence: number;
    journal: ExpensePostedCorrectionJournal;
  }>;
};

export type ExpensePostedCorrectionRecord = {
  version: 1;
  status: 'READY' | 'BLOCKED';
  blockReason: string | null;
  document: {
    documentStableId: string;
    status: string;
    fundingAttributionVersion: 1 | 2;
    occurredAt: string | null;
    currency: string;
    confirmedAt: string | null;
  };
  originalPersisted: {
    subtotalCents: number | null;
    taxCents: number | null;
    totalCents: number | null;
    memo: string | null;
    splits: Array<{
      splitStableId: string;
      categoryStableId: string;
      categoryName: string;
      amountCents: number;
      taxCents: number;
      paidFromAccountStableId: string | null;
      paidFromAccountName: string | null;
    }>;
    paymentAllocations: Array<{
      paymentAllocationStableId: string;
      accountStableId: string;
      accountName: string;
      amountCents: number;
    }>;
  };
  originalJournals: ExpensePostedCorrectionJournal[];
  currentEffective: {
    targetAuthorityHash: string;
    draftInput: ExpensePostedCorrectionDraftInput;
  } | null;
  corrections: ExpensePostedCorrectionCase[];
};

export type ExpensePostedCorrectionExecutionResult = {
  replayed: boolean;
  record: ExpensePostedCorrectionRecord;
};
