// Accounting-owned application/wire contracts. Keep persistence mapping in
// infrastructure; these values must not depend on Prisma-generated types.

type ValueOf<T> = T[keyof T];

export const AccountingTxType = {
  INCOME: 'INCOME',
  EXPENSE: 'EXPENSE',
  ADJUSTMENT: 'ADJUSTMENT',
  TRANSFER: 'TRANSFER',
} as const;
export type AccountingTxType = ValueOf<typeof AccountingTxType>;

export const AccountingAccountType = {
  CASH: 'CASH',
  BANK: 'BANK',
  PLATFORM_WALLET: 'PLATFORM_WALLET',
} as const;
export type AccountingAccountType = ValueOf<typeof AccountingAccountType>;

export const AccountingAccountClass = {
  ASSET: 'ASSET',
  LIABILITY: 'LIABILITY',
  EQUITY: 'EQUITY',
  REVENUE: 'REVENUE',
  EXPENSE: 'EXPENSE',
} as const;
export type AccountingAccountClass = ValueOf<typeof AccountingAccountClass>;

export const AccountingJournalEntryKind = {
  STANDARD: 'STANDARD',
  ADJUSTMENT: 'ADJUSTMENT',
  TRANSFER: 'TRANSFER',
  OPENING_BALANCE: 'OPENING_BALANCE',
} as const;
export type AccountingJournalEntryKind = ValueOf<
  typeof AccountingJournalEntryKind
>;

export const AccountingJournalSource = {
  MANUAL: 'MANUAL',
  EXPENSE_DOCUMENT: 'EXPENSE_DOCUMENT',
  ORDER: 'ORDER',
  PAYMENT: 'PAYMENT',
  PLATFORM_STATEMENT: 'PLATFORM_STATEMENT',
  SYSTEM: 'SYSTEM',
} as const;
export type AccountingJournalSource = ValueOf<typeof AccountingJournalSource>;

export const AccountingSourceType = {
  MANUAL: 'MANUAL',
  OTHER: 'OTHER',
} as const;
export type AccountingSourceType = ValueOf<typeof AccountingSourceType>;

export const AccountingDocumentSource = {
  MANUAL: 'MANUAL',
  GMAIL: 'GMAIL',
} as const;
export type AccountingDocumentSource = ValueOf<typeof AccountingDocumentSource>;

export const AccountingDocumentStatus = {
  PENDING_REVIEW: 'PENDING_REVIEW',
  CONFIRMED: 'CONFIRMED',
  DUPLICATE: 'DUPLICATE',
  ERROR: 'ERROR',
  DISCARDED: 'DISCARDED',
} as const;
export type AccountingDocumentStatus = ValueOf<typeof AccountingDocumentStatus>;

export const AccountingArtifactAcquisitionMode = {
  EMAIL: 'EMAIL',
  MANUAL_UPLOAD: 'MANUAL_UPLOAD',
  PROVIDER_API: 'PROVIDER_API',
} as const;
export type AccountingArtifactAcquisitionMode = ValueOf<
  typeof AccountingArtifactAcquisitionMode
>;

export const AccountingArtifactKind = {
  EMAIL_BODY: 'EMAIL_BODY',
  PDF: 'PDF',
  IMAGE: 'IMAGE',
  CSV: 'CSV',
  TEXT: 'TEXT',
  OTHER: 'OTHER',
} as const;
export type AccountingArtifactKind = ValueOf<typeof AccountingArtifactKind>;

export const AccountingInboxClassification = {
  EXPENSE_DOCUMENT: 'EXPENSE_DOCUMENT',
  PROVIDER_FINANCIAL_DOCUMENT: 'PROVIDER_FINANCIAL_DOCUMENT',
  OTHER_DOCUMENT: 'OTHER_DOCUMENT',
  UNKNOWN: 'UNKNOWN',
} as const;
export type AccountingInboxClassification = ValueOf<
  typeof AccountingInboxClassification
>;

export const AccountingInboxMaterializedEntityType = {
  EXPENSE_DOCUMENT: 'EXPENSE_DOCUMENT',
  PROVIDER_FINANCIAL_DOCUMENT: 'PROVIDER_FINANCIAL_DOCUMENT',
} as const;
export type AccountingInboxMaterializedEntityType = ValueOf<
  typeof AccountingInboxMaterializedEntityType
>;

export const AccountingInboxStatus = {
  PENDING_REVIEW: 'PENDING_REVIEW',
  QUARANTINED: 'QUARANTINED',
  DUPLICATE: 'DUPLICATE',
  CONFIRMED: 'CONFIRMED',
  ERROR: 'ERROR',
  DISCARDED: 'DISCARDED',
} as const;
export type AccountingInboxStatus = ValueOf<typeof AccountingInboxStatus>;

export const AccountingInboxTrustDecision = {
  TRUSTED: 'TRUSTED',
  UNTRUSTED: 'UNTRUSTED',
  NOT_APPLICABLE: 'NOT_APPLICABLE',
} as const;
export type AccountingInboxTrustDecision = ValueOf<
  typeof AccountingInboxTrustDecision
>;

export const AccountingParseStatus = {
  PENDING: 'PENDING',
  SUCCESS: 'SUCCESS',
  ERROR: 'ERROR',
  SKIPPED: 'SKIPPED',
} as const;
export type AccountingParseStatus = ValueOf<typeof AccountingParseStatus>;

export const AccountingArtifactBinaryRetentionState = {
  ORIGINAL_PRESENT: 'ORIGINAL_PRESENT',
  CANDIDATE_READY: 'CANDIDATE_READY',
  PURGE_PENDING: 'PURGE_PENDING',
  COMPRESSED_ONLY: 'COMPRESSED_ONLY',
} as const;
export type AccountingArtifactBinaryRetentionState = ValueOf<
  typeof AccountingArtifactBinaryRetentionState
>;

export const AccountingFinancialProvider = {
  CLOVER: 'CLOVER',
  UBER_EATS: 'UBER_EATS',
  FANTUAN: 'FANTUAN',
} as const;
export type AccountingFinancialProvider = ValueOf<
  typeof AccountingFinancialProvider
>;

export const AccountingProviderRecognitionMatchMode = {
  ANY: 'ANY',
  ALL: 'ALL',
} as const;
export type AccountingProviderRecognitionMatchMode = ValueOf<
  typeof AccountingProviderRecognitionMatchMode
>;

export const AccountingFinancialDocumentType = {
  BATCH_CONTROL: 'BATCH_CONTROL',
  STATEMENT: 'STATEMENT',
  API_REPORT: 'API_REPORT',
  OTHER: 'OTHER',
} as const;
export type AccountingFinancialDocumentType = ValueOf<
  typeof AccountingFinancialDocumentType
>;

export const AccountingFinancialComponent = {
  SALES: 'SALES',
  SALES_TAX: 'SALES_TAX',
  REFUND: 'REFUND',
  TIP: 'TIP',
  COMMISSION: 'COMMISSION',
  COMMISSION_TAX: 'COMMISSION_TAX',
  PROCESSING_FEE: 'PROCESSING_FEE',
  PROCESSING_FEE_TAX: 'PROCESSING_FEE_TAX',
  PROMOTION: 'PROMOTION',
  SUBSIDY: 'SUBSIDY',
  ADVERTISING: 'ADVERTISING',
  ADVERTISING_TAX: 'ADVERTISING_TAX',
  ADVERTISING_CREDIT: 'ADVERTISING_CREDIT',
  CHARGEBACK: 'CHARGEBACK',
  CHARGEBACK_TAX: 'CHARGEBACK_TAX',
  PLATFORM_OTHER_FEE: 'PLATFORM_OTHER_FEE',
  PLATFORM_OTHER_FEE_TAX: 'PLATFORM_OTHER_FEE_TAX',
  ADJUSTMENT: 'ADJUSTMENT',
  PAYOUT: 'PAYOUT',
  CONTROL_TOTAL: 'CONTROL_TOTAL',
  OTHER: 'OTHER',
} as const;
export type AccountingFinancialComponent = ValueOf<
  typeof AccountingFinancialComponent
>;

export const AccountingFinancialPostingTreatment = {
  POSTABLE: 'POSTABLE',
  CONTROL_TOTAL: 'CONTROL_TOTAL',
  RECONCILIATION_ONLY: 'RECONCILIATION_ONLY',
  UNCLASSIFIED: 'UNCLASSIFIED',
} as const;
export type AccountingFinancialPostingTreatment = ValueOf<
  typeof AccountingFinancialPostingTreatment
>;

export const AccountingFinancialTaxRole = {
  NONE: 'NONE',
  SALES_TAX: 'SALES_TAX',
  INPUT_TAX: 'INPUT_TAX',
  OTHER_TAX: 'OTHER_TAX',
} as const;
export type AccountingFinancialTaxRole = ValueOf<
  typeof AccountingFinancialTaxRole
>;
