export const ACCOUNTING_OPENING_RECEIVABLE_SETTLEMENT_SOURCE_FACT_TYPE =
  'accounting.opening_receivable_settlement.v1';
export const ACCOUNTING_OPENING_RECEIVABLE_SETTLEMENT_SOURCE_FACT_VERSION = 1;
export const ACCOUNTING_OPENING_RECEIVABLE_SETTLEMENT_REVERSAL_SOURCE_FACT_TYPE =
  'accounting.opening_receivable_settlement_reversal.v1';

export type CreateAccountingOpeningReceivableSettlementInputV1 = {
  requestId: string;
  openingReceivableStableId: string;
  settlementOn: string;
  amountCents: number;
  collectionAccountStableId: string;
  currency?: string;
  reference?: string | null;
  replacementForSettlementStableId?: string | null;
  note?: string | null;
};

export type AccountingOpeningReceivableSettlementFactV1 = {
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
  note: string | null;
};

export type AccountingOpeningReceivableSettlementViewV1 = {
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

export type AccountingOpeningReceivableReversalTargetV1 =
  | 'OPENING_RECEIVABLE'
  | 'SETTLEMENT';

export type AccountingOpeningReceivableReversalViewV1 = {
  version: 1;
  target: AccountingOpeningReceivableReversalTargetV1;
  targetStableId: string;
  reversalStableId: string;
  reversalJournalEntryStableId: string;
  reversalFactHash: string;
  reversalReason: string;
  reversedAt: string;
  reversedByActorRef: string;
};
