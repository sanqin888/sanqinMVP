import type { AccountingOpeningReceivableSettlementViewV1 } from './accounting-opening-receivable-settlement.contract';

export const ACCOUNTING_OPENING_RECEIVABLE_SOURCE_FACT_TYPE =
  'accounting.opening_receivable.v1';
export const ACCOUNTING_OPENING_RECEIVABLE_SOURCE_FACT_VERSION = 1;

export const ACCOUNTING_OPENING_RECEIVABLE_AR_ACCOUNT_STABLE_ID =
  'account_accounts_receivable';
export const ACCOUNTING_OPENING_BALANCE_EQUITY_ACCOUNT_STABLE_ID =
  'account_opening_balance_equity';

export type CreateAccountingOpeningReceivableInputV1 = {
  requestId: string;
  storeStableId: string;
  counterpartyName: string;
  reference?: string | null;
  amountCents: number;
  currency?: string;
  note?: string | null;
};

export type AccountingOpeningReceivableFactV1 = {
  version: 1;
  openingReceivableStableId: string;
  storeStableId: string;
  openingDate: string;
  counterpartyName: string;
  reference: string | null;
  amountCents: number;
  currency: 'CAD';
  note: string | null;
};

export type AccountingOpeningReceivableViewV1 = {
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
  note: string | null;
  createdByActorRef: string;
  createdAt: string;
  settlements: AccountingOpeningReceivableSettlementViewV1[];
};
