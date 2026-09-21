import type { AccountingFinancialProvider } from './core';
import type {
  AccountingFinancialDocumentType,
  AccountingProviderFinancialDocument,
} from './provider-financial';

export type AccountingProviderRecognitionMatchMode = 'ANY' | 'ALL';

export type AccountingProviderRecognitionRule = {
  ruleStableId: string;
  provider: AccountingFinancialProvider;
  documentType: AccountingFinancialDocumentType;
  requiredKeywords: string[];
  optionalKeywords: string[];
  optionalMatchMode: AccountingProviderRecognitionMatchMode;
  priority: number;
  isActive: boolean;
  version: number;
  updatedByUserStableId: string | null;
  persisted: boolean;
  changed?: boolean;
};

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

export type AccountingExpenseAmountEvidence = {
  strategy: 'LAYOUT_INLINE' | 'LAYOUT_ROW_PAIR' | 'DERIVED_TOTAL_MINUS_TAX';
  labelLineId?: string;
  amountLineId?: string;
  page?: number;
};

export type AccountingInboxParseResult = {
  date?: string | null;
  subtotalCents?: number | null;
  taxCents?: number | null;
  totalCents?: number | null;
  financialConsistency?: 'MATCHED' | 'MISMATCH' | 'INSUFFICIENT';
  amountEvidence?: {
    subtotal?: AccountingExpenseAmountEvidence;
    tax?: AccountingExpenseAmountEvidence;
    total?: AccountingExpenseAmountEvidence;
  };
  sourceCurrency?: string | null;
  sourceCurrencyEvidence?: 'EXPLICIT_TEXT' | 'AMBIGUOUS' | 'UNKNOWN';
  suggestedCategoryStableId?: string | null;
  suggestedCategoryName?: string | null;
  confidence?: 'HIGH' | 'MEDIUM' | 'LOW';
  requiresSplit?: boolean;
  inputKind?: 'PDF' | 'IMAGE' | 'EMAIL_BODY' | 'CSV';
  reviewDisposition?: 'LIKELY_BILL' | 'UNRECOGNIZED' | 'LIKELY_NOT_BILL';
  reviewReason?: string;
  ocrEngine?: 'AWS_TEXTRACT' | 'TESSERACT';
  ocrStatus?: 'SUCCESS' | 'ERROR';
  ocrFallbackFrom?: 'AWS_TEXTRACT';
  textRecognitionEngine?: 'POPPLER' | 'AWS_TEXTRACT';
  textractEvidence?: {
    provider: 'AWS_TEXTRACT_ANALYZE_EXPENSE';
    currencySuggestion?: {
      code?: string | null;
      confidence?: number | null;
      ambiguous?: boolean;
    };
    financialConsistency?: 'MATCHED' | 'MISMATCH' | 'INSUFFICIENT';
    lineItemCount?: number;
    lineItemPriceCount?: number;
    lineItemsReconcileToSubtotal?: boolean | null;
    lineItemHints?: Array<{
      description?: string | null;
      priceCents: number;
      confidence?: number | null;
    }>;
    lineItemHintsTruncated?: boolean;
  };
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
  documentType?: AccountingFinancialDocumentType;
  businessIdentityKey?: string;
  providerMerchantRef?: string | null;
  providerDocumentRef?: string | null;
  periodStart?: string | null;
  periodEnd?: string | null;
  lineCount?: number;
  lines?: AccountingInboxParsedFinancialLine[];
  extractedText?: string;
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

export type AccountingManualUploadPermanentDeleteResult = {
  inboxItemStableId: string;
  deleted: true;
  deletedArtifactStableIds: string[];
  removedDuplicateCount: number;
  storageCleanupComplete: boolean;
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
