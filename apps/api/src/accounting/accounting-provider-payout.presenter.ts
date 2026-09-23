import type { AccountingFinancialProvider } from './accounting-contracts';
import type { AccountingProviderPayoutView } from './accounting-provider-payout.contracts';

export type AccountingProviderPayoutViewRecord = {
  payoutStableId: string;
  provider: AccountingFinancialProvider;
  storeStableId: string;
  payoutDate: Date;
  destinationBankAccountStableId: string;
  amountCents: number;
  currency: string;
  providerReference: string | null;
  journalEntryStableId: string | null;
  createdByActorRef: string;
  createdAt: Date;
  updatedAt: Date;
};

export const accountingProviderPayoutDto = (
  row: AccountingProviderPayoutViewRecord,
): AccountingProviderPayoutView => ({
  payoutStableId: row.payoutStableId,
  provider: row.provider,
  storeStableId: row.storeStableId,
  payoutDate: row.payoutDate.toISOString().slice(0, 10),
  destinationBankAccountStableId: row.destinationBankAccountStableId,
  amountCents: row.amountCents,
  currency: row.currency,
  providerReference: row.providerReference,
  journalEntryStableId: row.journalEntryStableId,
  createdByActorRef: row.createdByActorRef,
  createdAt: row.createdAt.toISOString(),
  updatedAt: row.updatedAt.toISOString(),
});
