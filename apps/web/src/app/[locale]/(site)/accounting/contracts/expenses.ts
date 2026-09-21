import type { AccountingInboxItem } from './inbox';

export type AccountingExpenseReviewEffective = {
  version: 1;
  occurredAt: string;
  totalCents: number;
  sourceCurrency: string | null;
  paymentAllocations: Array<{
    accountStableId: string;
    amountCents: number;
  }>;
  memo: string | null;
  splits: Array<{
    categoryStableId: string;
    amountCents: number;
    taxCents: number;
  }>;
};

export type AccountingExpenseReviewRevision = {
  reviewRevisionStableId: string;
  revision: number;
  status: 'DRAFT' | 'CONFIRMED' | 'SUPERSEDED';
  sourceInboxVersion: number;
  sourceParseRunStableId: string | null;
  sourceResultHash: string | null;
  reviewHash: string;
  note: string | null;
  effective: AccountingExpenseReviewEffective;
  createdByUserStableId: string;
  confirmedByUserStableId: string | null;
  confirmedAt: string | null;
  createdAt: string;
  updatedAt: string;
};

export type AccountingExpenseReviewDraftInput = {
  expectedInboxVersion: number;
  note?: string | null;
  effective: Omit<AccountingExpenseReviewEffective, 'version'>;
};

export type AccountingExpenseDocument = {
  documentStableId: string;
  source: 'MANUAL' | 'GMAIL';
  status: 'PENDING_REVIEW' | 'CONFIRMED' | 'DUPLICATE' | 'ERROR' | 'DISCARDED';
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
  paymentAllocations: Array<{
    paymentAllocationStableId: string;
    accountStableId: string;
    accountName: string;
    amountCents: number;
    sortOrder: number;
  }>;
  splits: Array<{
    txStableId: string;
    categoryStableId: string;
    categoryName: string;
    amountCents: number;
    taxCents: number;
  }>;
};
