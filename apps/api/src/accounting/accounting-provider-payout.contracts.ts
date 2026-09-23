import type { AccountingFinancialProvider } from './accounting-contracts';

export type CreateAccountingProviderPayoutInput = {
  payoutStableId: string;
  provider: AccountingFinancialProvider;
  storeStableId: string;
  payoutDate: string;
  destinationBankAccountStableId: string;
  amountCents: number;
  currency?: string;
  providerReference?: string | null;
};

export type AccountingProviderPayoutView = {
  payoutStableId: string;
  provider: AccountingFinancialProvider;
  storeStableId: string;
  payoutDate: string;
  destinationBankAccountStableId: string;
  amountCents: number;
  currency: string;
  providerReference: string | null;
  journalEntryStableId: string | null;
  createdByActorRef: string;
  createdAt: string;
  updatedAt: string;
};
