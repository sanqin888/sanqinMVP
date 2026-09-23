import type { AccountingFinancialProvider } from './core';

export type AccountingProviderPayoutBankRowDecisionKind =
  | 'EXCLUDED'
  | 'READY_FOR_POSTING'
  | 'MATCH_EXISTING_PAYOUT';

export type AccountingProviderPayoutBankRowDecision = {
  decisionStableId: string;
  rowNumber: number;
  rowFingerprint: string;
  occurredOn: string;
  amountCents: number;
  description: string | null;
  providerHint: AccountingFinancialProvider | null;
  decision: AccountingProviderPayoutBankRowDecisionKind;
  matchedPayoutStableId: string | null;
  confirmedByActorRef: string;
  confirmedAt: string;
};

export type AccountingProviderPayoutBankRowScope = {
  version: 1;
  scope: 'PROVIDER_PAYOUT_BANK_ROW_DECISIONS';
  artifactStableId: string;
  storeStableId: string;
  destinationBankAccountStableId: string;
  currency: 'CAD';
  confirmed: boolean;
  decisions: AccountingProviderPayoutBankRowDecision[];
};
