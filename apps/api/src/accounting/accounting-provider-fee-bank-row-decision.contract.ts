import type { AccountingFinancialProvider } from './accounting-contracts';

export type AccountingProviderFeeBankRowDecisionKind =
  | 'EXCLUDED'
  | 'READY_FOR_CLEARING'
  | 'CLEARED';

export type AccountingProviderFeeBankWithdrawalView = {
  rowNumber: number;
  occurredOn: string;
  amountCents: number;
  description: string | null;
  providerHint: AccountingFinancialProvider | null;
};

export type AccountingProviderFeeBankWithdrawalPreview = {
  version: 1;
  scope: 'PROVIDER_FEE_BANK_WITHDRAWAL_PREVIEW';
  artifactStableId: string;
  filename: string;
  storeStableId: string;
  bankAccountStableId: string;
  currency: 'CAD';
  withdrawals: AccountingProviderFeeBankWithdrawalView[];
  source: {
    withdrawalRowCount: number;
    cloverWithdrawalRowCount: number;
    ignoredWithdrawalRowCount: number;
    invalidRowCount: number;
  };
};

export type AccountingProviderFeeBankRowDecisionView = {
  decisionStableId: string;
  rowNumber: number;
  rowFingerprint: string;
  occurredOn: string;
  amountCents: number;
  description: string | null;
  providerHint: AccountingFinancialProvider | null;
  decision: AccountingProviderFeeBankRowDecisionKind;
  journalEntryStableId: string | null;
  confirmedByActorRef: string;
  confirmedAt: string;
};

export type AccountingProviderFeeBankRowScopeView = {
  version: 1;
  scope: 'PROVIDER_FEE_BANK_ROW_DECISIONS';
  artifactStableId: string;
  storeStableId: string;
  bankAccountStableId: string;
  currency: 'CAD';
  confirmed: boolean;
  decisions: AccountingProviderFeeBankRowDecisionView[];
};

export type ConfirmAccountingProviderFeeBankRowScopeInput = {
  artifactStableId: string;
  storeStableId: string;
  bankAccountStableId: string;
  includedRowNumbers: number[];
};
