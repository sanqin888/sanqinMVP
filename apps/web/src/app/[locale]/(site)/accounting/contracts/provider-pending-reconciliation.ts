import type { AccountingFinancialProvider } from './core';

export type AccountingProviderCoverageStatus =
  | 'COMPLETE'
  | 'INCOMPLETE'
  | 'UNKNOWN'
  | 'NOT_APPLICABLE';

export type AccountingProviderPendingWarning =
  | 'NEGATIVE_PENDING_BALANCE'
  | 'OTHER_LEDGER_MOVEMENT_PRESENT'
  | 'PAYOUT_DIRECTION_UNEXPECTED';

export type AccountingProviderPendingReconciliationRow = {
  provider: AccountingFinancialProvider;
  pendingAccountStableId: string;
  openingBalanceCents: number;
  canonicalOrderMovementCents: number;
  providerStatementMovementCents: number;
  authorityAdjustmentMovementCents: number;
  otherMovementCents: number;
  payoutReductionCents: number;
  periodNetMovementCents: number;
  closingBalanceCents: number;
  arithmeticDeltaCents: number;
  entryCounts: {
    canonicalOrder: number;
    providerStatement: number;
    authorityAdjustment: number;
    payout: number;
    other: number;
  };
  coverage: {
    status: AccountingProviderCoverageStatus;
    financialHistoryRequiredFrom: string | null;
    financialCompleteThrough: string | null;
  };
  warnings: AccountingProviderPendingWarning[];
};

export type AccountingProviderPendingReconciliationReport = {
  version: 1;
  scope: 'PROVIDER_PENDING_ROLL_FORWARD';
  timezone: string;
  accountingStartDate: string;
  currency: 'CAD';
  storeStableId: string;
  requestedFrom: string;
  requestedTo: string;
  effectiveFrom: string;
  effectiveTo: string;
  providers: AccountingProviderPendingReconciliationRow[];
  totals: {
    openingBalanceCents: number;
    canonicalOrderMovementCents: number;
    providerStatementMovementCents: number;
    authorityAdjustmentMovementCents: number;
    otherMovementCents: number;
    payoutReductionCents: number;
    periodNetMovementCents: number;
    closingBalanceCents: number;
    arithmeticDeltaCents: number;
  };
};
