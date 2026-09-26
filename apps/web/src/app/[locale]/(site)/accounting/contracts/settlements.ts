import type { AccountingFinancialProvider } from './core';

export type CloverAuthorityReplacementPreview = {
  version: 1;
  mode: 'READ_ONLY_PREVIEW';
  status: 'READY_FOR_HUMAN_REVIEW' | 'BLOCKED' | 'ALREADY_POSTED';
  provider: 'CLOVER';
  storeStableId: string;
  accountingStartDate: string;
  providerPaymentFactCutoverAt: string | null;
  planHash: string;
  globalIssues: string[];
  periods: Array<{
    statementDocumentStableId: string;
    statementPeriod: { from: string; to: string };
    authorityWindow: {
      from: string;
      to: string;
      truncatedAtAccountingStart: boolean;
      batchCount: number;
    };
    providerEvidence: {
      principalCents: number;
      tipsCents: number;
      surchargeCents: number | null;
      surchargeAuthority:
        | 'EXPLICIT_PROVIDER_EVIDENCE'
        | 'UNKNOWN_OR_PARTIAL_STATEMENT';
      surchargeSource: 'STATEMENT' | 'SALES_REPORT' | null;
      surchargeSourceDocumentStableId: string | null;
      refundCount: number;
      refundCents: number;
    };
    proposal: {
      status: 'READY' | 'BLOCKED' | 'ALREADY_POSTED';
      blockReasons: string[];
      pendingAuthorityDeltaCents: number;
      missingTipRevenueCents: number | null;
      missingSurchargeRevenueCents: number | null;
      storeCashReclassificationCents: number | null;
      existingJournalEntryStableId: string | null;
      draftJournal: {
        lines: Array<{
          accountStableId: string;
          debitCents?: number;
          creditCents?: number;
          memo?: string | null;
        }>;
      } | null;
    };
    pendingRollForward: {
      actualOpeningCents: number;
      actualPeriodMovementCents: number;
      actualClosingCents: number;
      simulatedOpeningAfterPriorAuthorityAdjustmentsCents: number;
      proposedAuthorityAdjustmentCents: number;
      simulatedProviderAuthorityClosingCents: number;
    };
  }>;
  totals: {
    providerPrincipalCents: number;
    orderPendingMovementCents: number;
    proposedPendingAuthorityAdjustmentCents: number;
    providerTipsCents: number;
    providerExplicitSurchargeCents: number;
    readyPeriods: number;
    blockedPeriods: number;
    alreadyPostedPeriods: number;
  };
};

export type CloverAuthorityReplacementExecution =
  CloverAuthorityReplacementPreview & {
    execution: {
      journalEntriesPostedOrReplayed: number;
      alreadyPostedPeriods: number;
    };
  };

export type CloverFeeReclassificationPreview = {
  documentStableId: string;
  revision: number;
  status: 'READY' | 'BLOCKED' | 'ALREADY_RECLASSIFIED' | 'NOOP';
  blockReasons: string[];
  originalJournalEntryStableId: string | null;
  existingCorrectionJournalEntryStableId: string | null;
  amountCents: number;
  planHash: string;
};

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
      | 'CLOVER_ACCOUNT_SUMMARY'
      | 'CLOVER_FEE_SUMMARY'
      | 'CLOVER_FEES_DETAIL'
      | 'CLOVER_SERVICE_CHARGES_DETAIL'
      | 'CLOVER_CARD_PROCESSING_FEES';
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
