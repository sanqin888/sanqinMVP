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
