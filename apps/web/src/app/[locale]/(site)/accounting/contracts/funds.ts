export type AccountingAccountTransferPurpose =
  | 'ACTUAL_TRANSFER'
  | 'ACCOUNT_ATTRIBUTION_CORRECTION';

export type AccountingAccountTransfer = {
  transferStableId: string;
  journalEntryStableId: string;
  transferDate: string;
  purpose: AccountingAccountTransferPurpose;
  amountCents: number;
  currency: 'CAD';
  note: string | null;
  fromAccount: {
    accountStableId: string;
    name: string;
    type: 'BANK' | 'CASH';
  };
  toAccount: {
    accountStableId: string;
    name: string;
    type: 'BANK' | 'CASH';
  };
  createdByActorRef: string;
  createdAt: string;
};
