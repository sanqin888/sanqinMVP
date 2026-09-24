import type { AccountingFinancialProvider } from './core';

export type ProviderSettlementPostingState = {
  documentStableId: string;
  postingState: 'POSTED' | 'NOT_POSTED';
  existingJournalEntryStableId: string | null;
};

export type ProviderSettlementShadowPreview = {
  version: 3;
  range: {
    timezone: string;
    accountingStartDate: string;
    fromDate: string;
    toDateExclusive: string;
    storeStableId: string;
    provider: AccountingFinancialProvider | null;
  };
  coverage: Array<{
    coverageStableId: string;
    provider: AccountingFinancialProvider;
    financialHistoryRequiredFrom: string | null;
    financialCompleteThrough: string | null;
    liveOrderFactCutoverAt: string | null;
    orderDetailCoverageFrom: string | null;
    updatedAt: string;
  }>;
  counts: {
    providerDocuments: number;
    readyProviderDocuments: number;
    blockedProviderDocuments: number;
    preCutoverUberOrderFacts: number;
    preCutoverUberSaleJournals: number;
    readyUberOrderReversals: number;
    blockedUberOrderReversals: number;
  };
  amounts: {
    readyProviderDebitCents: number;
    readyProviderCreditCents: number;
    readyUberReversalDebitCents: number;
    readyUberReversalCreditCents: number;
  };
  providerDocuments: ProviderSettlementDocumentPlan[];
  uberPreCutoverOrderReversals: ProviderSettlementReversalPlan[];
  planHash: string;
};

export type ProviderSettlementDocumentPlan = {
  documentStableId: string;
  provider: AccountingFinancialProvider;
  documentType: string;
  businessIdentityKey: string;
  revision: number;
  providerDocumentRef: string | null;
  periodStart: string | null;
  periodEnd: string | null;
  currency: string;
  salesAuthority: string;
  latestRevisionInRequestedRange: boolean;
  reviewEvidence: {
    inboxItemStableId: string;
    status: string;
    materializedEntityType: string | null;
    materializedEntityStableId: string | null;
    reviewedAt: string | null;
    reviewedByUserStableId: string | null;
    version: number;
  } | null;
  humanReviewRevision: {
    reviewRevisionStableId: string;
    revision: number;
    reviewHash: string;
    confirmedAt: string | null;
    confirmedByUserStableId: string | null;
  } | null;
  coverageEvidence: {
    coverageStableId: string;
    financialHistoryRequiredFrom: string | null;
    financialCompleteThrough: string | null;
    liveOrderFactCutoverAt: string | null;
    orderDetailCoverageFrom: string | null;
    updatedAt: string;
  } | null;
  status: 'READY' | 'BLOCKED' | 'NOOP' | 'ALREADY_POSTED';
  blockReasons: string[];
  controlTotalChecks: Array<{
    key:
      | 'UBER_TOTAL_EARNINGS'
      | 'UBER_TOTAL_FEES'
      | 'UBER_TOTAL_MARKETING'
      | 'UBER_TOTAL_AMENDMENTS'
      | 'UBER_NET_TOTAL'
      | 'CLOVER_FEES_DETAIL';
    status: 'MATCHED' | 'MISMATCH' | 'INCOMPLETE';
    controlRawName: string;
    controlLineStableId: string | null;
    expectedCents: number | null;
    calculatedCents: number | null;
    deltaCents: number | null;
  }>;
  existingJournalEntryStableId: string | null;
  priorPostedRevision: number | null;
  decisions: Array<{
    lineStableId: string;
    lineNo: number;
    rawName: string | null;
    component: string;
    postingTreatment: string;
    amountCents: number;
    disposition: 'POSTABLE' | 'RECONCILIATION_ONLY' | 'CONTROL_TOTAL' | 'BLOCKED';
    reason: string;
    targetAccountStableId: string | null;
    targetCategoryStableId: string | null;
  }>;
  draftJournal: {
    idempotencyKey: string;
    kind: string;
    source: string;
    sourceFactType?: string | null;
    sourceFactStableId?: string | null;
    sourceFactVersion?: number | null;
    storeStableId?: string | null;
    occurredAt: string;
    currency: string;
    memo?: string | null;
    lines: Array<{
      accountStableId: string;
      categoryStableId?: string | null;
      debitCents?: number;
      creditCents?: number;
      memo?: string | null;
    }>;
  } | null;
  debitCents: number;
  creditCents: number;
};

export type ProviderSettlementReversalPlan = {
  originalJournalEntryStableId: string;
  orderStableId: string | null;
  occurredAt: string;
  status: 'READY' | 'BLOCKED' | 'ALREADY_REVERSED';
  blockReasons: string[];
  coveringDocumentStableIds: string[];
  coveredByDocumentStableId: string | null;
  debitCents: number;
  creditCents: number;
};

export type ProviderSettlementExecutionReport = ProviderSettlementShadowPreview & {
  execution: {
    replacementGroupsExecuted: number;
    journalEntriesPostedOrReplayed: number;
    providerDocumentsPostedOrReplayed: number;
    uberReversalsPostedOrReplayed: number;
    noopProviderDocumentsNotWritten: number;
    blockedProviderDocumentsNotWritten: number;
    alreadyPostedProviderDocumentsNotWritten: number;
    blockedUberReversalsNotWritten: number;
    alreadyReversedUberReversalsNotWritten: number;
  };
};
