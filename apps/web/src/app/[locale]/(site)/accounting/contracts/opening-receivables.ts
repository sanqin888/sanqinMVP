export type AccountingOpeningReceivableSettlement = {
  version: 1;
  settlementStableId: string;
  openingReceivableStableId: string;
  storeStableId: string;
  settlementOn: string;
  counterpartyName: string;
  amountCents: number;
  currency: 'CAD';
  collectionAccountStableId: string;
  reference: string | null;
  factHash: string;
  journalEntryStableId: string;
  replacementForSettlementStableId: string | null;
  replacedBySettlementStableId: string | null;
  reversalStableId: string | null;
  reversalJournalEntryStableId: string | null;
  reversedAt: string | null;
  note: string | null;
  createdByActorRef: string;
  createdAt: string;
};

export type AccountingOpeningReceivableStatus =
  | 'OPEN'
  | 'PARTIALLY_SETTLED'
  | 'SETTLED'
  | 'REVERSED';

export type AccountingOpeningReceivable = {
  version: 1;
  openingReceivableStableId: string;
  storeStableId: string;
  openingDate: string;
  counterpartyName: string;
  reference: string | null;
  amountCents: number;
  openingAmountCents: number;
  settledAmountCents: number;
  outstandingAmountCents: number;
  currency: 'CAD';
  factHash: string;
  journalEntryStableId: string;
  replacementForOpeningReceivableStableId: string | null;
  replacedByOpeningReceivableStableId: string | null;
  reversalStableId: string | null;
  reversalJournalEntryStableId: string | null;
  reversedAt: string | null;
  note: string | null;
  createdByActorRef: string;
  createdAt: string;
  status: AccountingOpeningReceivableStatus;
  settlements: AccountingOpeningReceivableSettlement[];
};

export type AccountingOpeningReceivablesList =
  AccountingOpeningReceivable[];

export type AccountingOpeningReceivableFormOptions = {
  version: 1;
  store: {
    storeStableId: string;
    storeName: string;
    timezone: string;
  };
  collectionAccounts: Array<{
    accountStableId: string;
    name: string;
  }>;
};

export type CreateAccountingOpeningReceivableInput = {
  requestId: string;
  storeStableId: string;
  counterpartyName: string;
  reference?: string | null;
  amountCents: number;
  currency?: string;
  replacementForOpeningReceivableStableId?: string | null;
  note?: string | null;
};

export type CreateAccountingOpeningReceivableSettlementInput = {
  requestId: string;
  openingReceivableStableId: string;
  settlementOn: string;
  amountCents: number;
  currency?: string;
  collectionAccountStableId: string;
  reference?: string | null;
  replacementForSettlementStableId?: string | null;
  note?: string | null;
};

export type AccountingOpeningReceivableReversalResult = {
  version: 1;
  target: 'OPENING_RECEIVABLE' | 'SETTLEMENT';
  targetStableId: string;
  reversalStableId: string;
  reversalJournalEntryStableId: string;
  reversalFactHash: string;
  reversalReason: string;
  reversedAt: string;
  reversedByActorRef: string;
};
