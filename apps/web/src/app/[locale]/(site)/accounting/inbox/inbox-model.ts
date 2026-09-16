export type AccountingCategory = {
  categoryStableId: string;
  name: string;
  type: 'INCOME' | 'EXPENSE' | 'ADJUSTMENT' | 'TRANSFER';
  parentStableId: string | null;
};

export type AccountingAccount = {
  accountStableId: string;
  name: string;
  currency: string;
};

export type AccountingFinancialProvider = 'CLOVER' | 'UBER_EATS' | 'FANTUAN';

export type AccountingImageRetentionProfile =
  | 'SPACE_SAVER'
  | 'BALANCED'
  | 'HIGH_QUALITY'
  | 'NEAR_ORIGINAL';

export type AccountingImageRetentionDerivativePreview = {
  url: string;
  contentHash?: string;
  byteSize: number;
  mimeType: string;
  width: number;
  height: number;
  profile: AccountingImageRetentionProfile;
  maxDimension: number;
  quality: number;
  savingsPercent: number;
};

export type AccountingImageRetentionCandidatePreview = {
  state: 'CANDIDATE_READY';
  artifactStableId: string;
  original: {
    url: string;
    byteSize: number;
    mimeType: string | null;
    width: number;
    height: number;
  };
  candidate: AccountingImageRetentionDerivativePreview & {
    contentHash: string;
    mimeType: 'image/webp';
  };
};

export type AccountingImageRetentionQueueItem = {
  inboxItemStableId: string;
  artifactStableId: string;
  originalFilename: string | null;
  retentionState: 'ORIGINAL_PRESENT' | 'CANDIDATE_READY' | 'PURGE_PENDING';
  createdAt: string;
  updatedAt: string;
  original: {
    url: string;
    byteSize: number | null;
    mimeType: string | null;
    width: number | null;
    height: number | null;
  };
  derivative: AccountingImageRetentionDerivativePreview | null;
};

export type AccountingImageRetentionAccepted = {
  state: 'COMPRESSED_ONLY';
  artifactStableId: string;
  originalPurgedAt: string | null;
  retained: {
    url: string;
    contentHash: string;
    byteSize: number;
    mimeType: string;
    width: number | null;
    height: number | null;
    profile: AccountingImageRetentionProfile | null;
    maxDimension: number | null;
    quality: number | null;
    savingsPercent: number;
  };
};

export type AccountingInboxClassification =
  | 'EXPENSE_DOCUMENT'
  | 'PROVIDER_FINANCIAL_DOCUMENT'
  | 'OTHER_DOCUMENT'
  | 'UNKNOWN';

export type AccountingInboxStatus =
  | 'PENDING_REVIEW'
  | 'QUARANTINED'
  | 'DUPLICATE'
  | 'CONFIRMED'
  | 'ERROR'
  | 'DISCARDED';

export type AccountingInboxParsedFinancialLine = {
  rawName?: string | null;
  component: string;
  postingTreatment:
    | 'POSTABLE'
    | 'CONTROL_TOTAL'
    | 'RECONCILIATION_ONLY'
    | 'UNCLASSIFIED';
  taxRole: 'NONE' | 'SALES_TAX' | 'INPUT_TAX' | 'OTHER_TAX';
  amountCents: number;
};

export type AccountingInboxParseResult = {
  date?: string | null;
  subtotalCents?: number | null;
  taxCents?: number | null;
  totalCents?: number | null;
  sourceCurrency?: string | null;
  sourceCurrencyEvidence?: 'EXPLICIT_TEXT' | 'AMBIGUOUS' | 'UNKNOWN';
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
  csvStructureUnrecognized?: boolean;
  structuredExpenseCsv?: boolean;
  structuredExpenseRowCount?: number;
  structuredExpenseInvalidRowCount?: number;
  structuredExpenseRowsTruncated?: boolean;
  requiresBatchExpenseImport?: boolean;
  structuredExpenseRows?: Array<{
    rowNumber: number;
    occurredAt: string;
    totalCents: number;
    description: string | null;
    counterparty: string | null;
  }>;
  providerRecognition?: boolean;
  providerFinancial?: boolean;
  recognitionRuleStableId?: string;
  recognitionRuleVersion?: number;
  matchedRequiredKeywords?: string[];
  matchedOptionalKeywords?: string[];
  providerRecognitionAmbiguousRuleStableIds?: string[];
  excludedBeforeFinancialHistory?: boolean;
  financialHistoryRequiredFrom?: string;
  provider?: AccountingFinancialProvider;
  documentType?: 'BATCH_CONTROL' | 'STATEMENT' | 'API_REPORT' | 'OTHER';
  businessIdentityKey?: string;
  providerMerchantRef?: string | null;
  providerDocumentRef?: string | null;
  periodStart?: string | null;
  periodEnd?: string | null;
  lineCount?: number;
  lines?: AccountingInboxParsedFinancialLine[];
  extractedText?: string;
};

export type AccountingProviderFinancialLine = {
  lineStableId: string;
  lineNo: number;
  rawName: string | null;
  component: string;
  postingTreatment:
    | 'POSTABLE'
    | 'CONTROL_TOTAL'
    | 'RECONCILIATION_ONLY'
    | 'UNCLASSIFIED';
  taxRole: 'NONE' | 'SALES_TAX' | 'INPUT_TAX' | 'OTHER_TAX';
  amountCents: number;
  occurredAt: string | null;
};

export type AccountingProviderFinancialDocument = {
  documentStableId: string;
  provider: AccountingFinancialProvider;
  documentType: 'BATCH_CONTROL' | 'STATEMENT' | 'API_REPORT' | 'OTHER';
  revision: number;
  storeStableId: string | null;
  providerMerchantRef: string | null;
  providerDocumentRef: string | null;
  periodStart: string | null;
  periodEnd: string | null;
  settledAt: string | null;
  payoutAt: string | null;
  currency: string;
  parserName: string;
  parserVersion: string;
  lines: AccountingProviderFinancialLine[];
};

export type AccountingInboxItem = {
  inboxItemStableId: string;
  status: AccountingInboxStatus;
  classification: AccountingInboxClassification;
  selectedProvider: AccountingFinancialProvider | null;
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
    financialDocument: AccountingProviderFinancialDocument | null;
    parseRuns: Array<{
      parseRunStableId: string;
      status: 'PENDING' | 'SUCCESS' | 'ERROR' | 'SKIPPED';
      resultJson: AccountingInboxParseResult | null;
      errorMessage: string | null;
    }>;
  };
};

export type AccountingManualUploadResult = {
  artifactStableId: string;
  storedUrl: string | null;
  duplicateOfArtifactStableId: string | null;
  replayed: boolean;
  duplicateStorageCleanupComplete: boolean | null;
  inboxItem: {
    inboxItemStableId: string;
    status: AccountingInboxStatus;
  } | null;
};

export type AccountingManualUploadLibraryItem = {
  inboxItemStableId: string;
  artifactStableId: string;
  status: AccountingInboxStatus;
  classification: AccountingInboxClassification;
  selectedProvider: AccountingFinancialProvider | null;
  materializedEntityType:
    | 'EXPENSE_DOCUMENT'
    | 'PROVIDER_FINANCIAL_DOCUMENT'
    | null;
  materializedEntityStableId: string | null;
  originalFilename: string | null;
  kind: 'PDF' | 'IMAGE' | 'CSV' | 'TEXT' | 'OTHER' | 'EMAIL_BODY';
  byteSize: number | null;
  contentUrl: string | null;
  retentionState:
    | 'ORIGINAL_PRESENT'
    | 'CANDIDATE_READY'
    | 'PURGE_PENDING'
    | 'COMPRESSED_ONLY'
    | null;
  duplicateOf: {
    artifactStableId: string;
    originalFilename: string | null;
    status: AccountingInboxStatus | null;
  } | null;
  canDiscard: boolean;
  canPermanentDelete: boolean;
  createdAt: string;
  updatedAt: string;
  reviewedAt: string | null;
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
