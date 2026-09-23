import type { AccountingFinancialProvider } from './core';

export type AccountingProviderPayout = {
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
