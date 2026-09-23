import type { AccountingFinancialProvider } from './accounting-contracts';
import type { AccountingProviderPayoutBankMatchDeposit } from './accounting-provider-payout-bank-match.contract';

export type AccountingProviderPayoutBankRowDecisionKind =
  | 'EXCLUDED'
  | 'READY_FOR_POSTING'
  | 'MATCH_EXISTING_PAYOUT';

export type ConfirmAccountingProviderPayoutBankRowScopeInput = {
  artifactStableId: string;
  storeStableId: string;
  destinationBankAccountStableId: string;
  includedRowNumbers: number[];
};

export type AccountingProviderPayoutBankRowDecisionView = {
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

export type AccountingProviderPayoutBankRowScopeView = {
  version: 1;
  scope: 'PROVIDER_PAYOUT_BANK_ROW_DECISIONS';
  artifactStableId: string;
  storeStableId: string;
  destinationBankAccountStableId: string;
  currency: 'CAD';
  confirmed: boolean;
  decisions: AccountingProviderPayoutBankRowDecisionView[];
};

export type AccountingProviderPayoutBankRowDecisionDraft = {
  decisionStableId: string;
  rowNumber: number;
  rowFingerprint: string;
  occurredOn: string;
  amountCents: number;
  description: string | null;
  providerHint: AccountingFinancialProvider | null;
  decision: AccountingProviderPayoutBankRowDecisionKind;
  matchedPayoutStableId: string | null;
};

export type AccountingProviderPayoutBankRowDecisionPolicyInput = {
  artifactStableId: string;
  storeStableId: string;
  destinationBankAccountStableId: string;
  deposits: AccountingProviderPayoutBankMatchDeposit[];
  includedRowNumbers: number[];
};
