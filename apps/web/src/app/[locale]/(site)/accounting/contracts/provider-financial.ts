import type { AccountingFinancialProvider } from './core';

export type AccountingFinancialDocumentType =
  | 'BATCH_CONTROL'
  | 'STATEMENT'
  | 'API_REPORT'
  | 'OTHER';

export type AccountingFinancialComponent =
  | 'SALES'
  | 'SALES_TAX'
  | 'REFUND'
  | 'TIP'
  | 'COMMISSION'
  | 'COMMISSION_TAX'
  | 'PROCESSING_FEE'
  | 'PROCESSING_FEE_TAX'
  | 'PROMOTION'
  | 'SUBSIDY'
  | 'ADVERTISING'
  | 'ADVERTISING_TAX'
  | 'ADVERTISING_CREDIT'
  | 'CHARGEBACK'
  | 'CHARGEBACK_TAX'
  | 'PLATFORM_OTHER_FEE'
  | 'PLATFORM_OTHER_FEE_TAX'
  | 'ADJUSTMENT'
  | 'PAYOUT'
  | 'CONTROL_TOTAL'
  | 'OTHER';

export type AccountingFinancialPostingTreatment =
  | 'POSTABLE'
  | 'CONTROL_TOTAL'
  | 'RECONCILIATION_ONLY'
  | 'UNCLASSIFIED';

export type AccountingFinancialTaxRole =
  | 'NONE'
  | 'SALES_TAX'
  | 'INPUT_TAX'
  | 'OTHER_TAX';

export type AccountingProviderFinancialLine = {
  lineStableId: string;
  lineNo: number;
  rawName: string | null;
  component: AccountingFinancialComponent;
  postingTreatment: AccountingFinancialPostingTreatment;
  taxRole: AccountingFinancialTaxRole;
  amountCents: number;
  occurredAt: string | null;
};

export type AccountingProviderFinancialDocument = {
  documentStableId: string;
  provider: AccountingFinancialProvider;
  documentType: AccountingFinancialDocumentType;
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

export type AccountingProviderFinancialCorrectionReason =
  | 'EXTRACTION_CORRECTION'
  | 'SEMANTIC_CLASSIFICATION';

export type AccountingProviderFinancialReviewStatus =
  | 'DRAFT'
  | 'CONFIRMED'
  | 'SUPERSEDED';

export type AccountingProviderFinancialReviewCorrection = {
  correctionStableId: string;
  sourceLineStableId: string;
  reason: AccountingProviderFinancialCorrectionReason;
  note: string | null;
  effectiveRawCode: string | null;
  effectiveRawName: string | null;
  effectiveComponent: AccountingFinancialComponent;
  effectivePostingTreatment: AccountingFinancialPostingTreatment;
  effectiveTaxRole: AccountingFinancialTaxRole;
  effectiveAmountCents: number;
};

export type AccountingProviderFinancialReviewRevision = {
  reviewRevisionStableId: string;
  revision: number;
  status: AccountingProviderFinancialReviewStatus;
  reviewHash: string;
  note: string | null;
  createdByUserStableId: string;
  confirmedByUserStableId: string | null;
  confirmedAt: string | null;
  createdAt: string;
  updatedAt: string;
  corrections: AccountingProviderFinancialReviewCorrection[];
};

export type AccountingProviderFinancialReviewCorrectionInput = {
  sourceLineStableId: string;
  reason: AccountingProviderFinancialCorrectionReason;
  note?: string | null;
  rawCode?: string | null;
  rawName?: string | null;
  component?: AccountingFinancialComponent;
  postingTreatment?: AccountingFinancialPostingTreatment;
  taxRole?: AccountingFinancialTaxRole;
  amountCents?: number;
};

export type AccountingProviderFinancialReviewDraftInput = {
  expectedDocumentRevision: number;
  note?: string | null;
  corrections: AccountingProviderFinancialReviewCorrectionInput[];
};

export type AccountingProviderFinancialConfirmationResult = {
  inboxItemStableId: string;
  documentStableId: string;
  provider?: AccountingFinancialProvider;
  documentType?: AccountingFinancialDocumentType;
  revision?: number;
  confirmed: true;
  replayed: boolean;
};
