export const ACCOUNTING_OPENING_RECEIVABLE_SETTLEMENT_SOURCE_FACT_TYPE =
  'accounting.opening_receivable_settlement.v1';
export const ACCOUNTING_OPENING_RECEIVABLE_SETTLEMENT_SOURCE_FACT_VERSION = 1;

export type CreateAccountingOpeningReceivableSettlementInputV1 = {
  requestId: string;
  openingReceivableStableId: string;
  settlementOn: string;
  amountCents: number;
  collectionAccountStableId: string;
  currency?: string;
  reference?: string | null;
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
  note: string | null;
  createdByActorRef: string;
  createdAt: string;
};
