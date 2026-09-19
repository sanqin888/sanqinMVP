import type { AccountingFinancialProvider } from './core';

export type AccountingFinancialDocumentType =
  | 'BATCH_CONTROL'
  | 'STATEMENT'
  | 'API_REPORT'
  | 'OTHER';

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
