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
    splitStableId: string;
    categoryStableId: string;
    categoryName: string;
    amountCents: number;
    taxCents: number;
    sortOrder: number;
  }>;
};
