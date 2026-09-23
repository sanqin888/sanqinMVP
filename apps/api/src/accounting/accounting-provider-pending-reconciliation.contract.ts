import type { AccountingFinancialProvider } from './accounting-contracts';

export type AccountingProviderCoverageStatusV1 =
  | 'COMPLETE'
  | 'INCOMPLETE'
  | 'UNKNOWN'
  | 'NOT_APPLICABLE';

export type AccountingProviderPendingWarningV1 =
  | 'NEGATIVE_PENDING_BALANCE'
  | 'OTHER_LEDGER_MOVEMENT_PRESENT'
  | 'PAYOUT_DIRECTION_UNEXPECTED';

export type AccountingProviderPendingReconciliationRowV1 = {
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
    status: AccountingProviderCoverageStatusV1;
    financialHistoryRequiredFrom: string | null;
    financialCompleteThrough: string | null;
  };
  warnings: AccountingProviderPendingWarningV1[];
};

export type AccountingProviderPendingReconciliationReportV1 = {
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
  providers: AccountingProviderPendingReconciliationRowV1[];
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
