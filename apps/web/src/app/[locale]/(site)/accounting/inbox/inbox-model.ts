export type AccountingCategory = {
  categoryStableId: string;
  name: string;
  type: 'INCOME' | 'EXPENSE' | 'ADJUSTMENT' | 'TRANSFER';
  parentStableId: string | null;
};

export type AccountingAccount = {
  accountStableId: string;
  name: string;
};

export type AccountingInboxParseResult = {
  date?: string | null;
  subtotalCents?: number | null;
  taxCents?: number | null;
  totalCents?: number | null;
  suggestedCategoryStableId?: string | null;
  suggestedCategoryName?: string | null;
  confidence?: 'HIGH' | 'MEDIUM' | 'LOW';
  requiresSplit?: boolean;
  inputKind?: 'PDF' | 'IMAGE' | 'EMAIL_BODY' | 'CSV';
  reviewDisposition?: 'LIKELY_BILL' | 'UNRECOGNIZED' | 'LIKELY_NOT_BILL';
  reviewReason?: string;
  ocrEngine?: 'TESSERACT';
  ocrStatus?: 'SUCCESS' | 'ERROR';
  providerParserPending?: boolean;
  extractedText?: string;
};

export type AccountingInboxItem = {
  inboxItemStableId: string;
  status:
    | 'PENDING_REVIEW'
    | 'QUARANTINED'
    | 'DUPLICATE'
    | 'CONFIRMED'
    | 'ERROR'
    | 'DISCARDED';
  classification:
    | 'EXPENSE_DOCUMENT'
    | 'PROVIDER_FINANCIAL_DOCUMENT'
    | 'UNKNOWN';
  trustDecision: 'TRUSTED' | 'UNTRUSTED' | 'NOT_APPLICABLE';
  materializedEntityType:
    | 'EXPENSE_DOCUMENT'
    | 'PROVIDER_FINANCIAL_DOCUMENT'
    | null;
  materializedEntityStableId: string | null;
  createdAt: string;
  artifact: {
    artifactStableId: string;
    acquisitionMode: 'EMAIL' | 'MANUAL_UPLOAD' | 'PROVIDER_API';
    kind: 'EMAIL_BODY' | 'PDF' | 'IMAGE' | 'CSV' | 'TEXT' | 'OTHER';
    originalFilename: string | null;
    storedUrl: string | null;
    bodyText: string | null;
    senderEmail: string | null;
    emailSubject: string | null;
    parseRuns: Array<{
      parseRunStableId: string;
      status: 'PENDING' | 'SUCCESS' | 'ERROR' | 'SKIPPED';
      resultJson: AccountingInboxParseResult | null;
      errorMessage: string | null;
    }>;
  };
};

export type AccountingTrustedSender = {
  trustedSenderStableId: string;
  email: string;
  label: string | null;
  isActive: boolean;
};

export type AccountingExpenseReviewRow = {
  key: string;
  categoryStableId: string;
  amount: string;
  tax: string;
};

export const money = (cents: number | null | undefined) =>
  `$${((cents ?? 0) / 100).toFixed(2)}`;

export const toCents = (value: string) => {
  const parsed = Number.parseFloat(value);
  return Number.isFinite(parsed) ? Math.round(parsed * 100) : 0;
};

export const toDollars = (cents: number | null | undefined) =>
  ((cents ?? 0) / 100).toFixed(2);

export const makeReviewKey = () =>
  `${Date.now()}-${Math.random().toString(16).slice(2)}`;

export function latestParse(
  item: AccountingInboxItem,
): AccountingInboxParseResult {
  return item.artifact.parseRuns[0]?.resultJson ?? {};
}
