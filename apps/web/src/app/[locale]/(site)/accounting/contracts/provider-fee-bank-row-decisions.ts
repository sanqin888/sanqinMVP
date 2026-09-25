import type { AccountingFinancialProvider } from './core';

export type AccountingProviderFeeBankWithdrawalPreview = {
  version: 1;
  scope: 'PROVIDER_FEE_BANK_WITHDRAWAL_PREVIEW';
  artifactStableId: string;
  filename: string;
  storeStableId: string;
  bankAccountStableId: string;
  currency: 'CAD';
  withdrawals: Array<{
    rowNumber: number;
    occurredOn: string;
    amountCents: number;
    description: string | null;
    providerHint: AccountingFinancialProvider | null;
  }>;
  source: {
    withdrawalRowCount: number;
    cloverWithdrawalRowCount: number;
    ignoredWithdrawalRowCount: number;
    invalidRowCount: number;
  };
};

export type AccountingProviderFeeBankRowDecision = {
  decisionStableId: string;
  rowNumber: number;
  rowFingerprint: string;
  occurredOn: string;
  amountCents: number;
  description: string | null;
  providerHint: AccountingFinancialProvider | null;
  decision: 'EXCLUDED' | 'READY_FOR_CLEARING' | 'CLEARED';
  journalEntryStableId: string | null;
  confirmedByActorRef: string;
  confirmedAt: string;
};

export type AccountingProviderFeeBankRowScope = {
  version: 1;
  scope: 'PROVIDER_FEE_BANK_ROW_DECISIONS';
  artifactStableId: string;
  storeStableId: string;
  bankAccountStableId: string;
  currency: 'CAD';
  confirmed: boolean;
  decisions: AccountingProviderFeeBankRowDecision[];
};
