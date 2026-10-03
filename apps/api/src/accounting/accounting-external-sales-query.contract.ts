import type { AccountingExternalSaleGranularity } from './accounting-external-sales.contract';

export type AccountingExternalSaleStatusV1 =
  | 'OPEN'
  | 'PARTIALLY_SETTLED'
  | 'SETTLED'
  | 'REVERSED';

export type AccountingExternalSaleAccountOptionV1 = {
  accountStableId: string;
  name: string;
};

export type AccountingExternalSaleListItemV1 = {
  externalSaleStableId: string;
  storeStableId: string;
  classificationStableId: string;
  granularity: AccountingExternalSaleGranularity;
  occurredOn: string;
  counterpartyName: string;
  reference: string | null;
  currency: 'CAD';
  journalEntryStableId: string;
  replacementForExternalSaleStableId: string | null;
  replacedByExternalSaleStableId: string | null;
  reversalStableId: string | null;
  reversalJournalEntryStableId: string | null;
  reversedAt: string | null;
  totalReceivableCents: number;
  settledCents: number;
  outstandingCents: number;
  status: AccountingExternalSaleStatusV1;
};

export type AccountingExternalSaleSettlementListItemV1 = {
  settlementStableId: string;
  storeStableId: string;
  settlementOn: string;
  counterpartyName: string;
  reference: string | null;
  currency: 'CAD';
  journalEntryStableId: string;
  replacementForSettlementStableId: string | null;
  replacedBySettlementStableId: string | null;
  reversalStableId: string | null;
  reversalJournalEntryStableId: string | null;
  reversedAt: string | null;
  note: string | null;
  appliedReceivableCents: number;
  allocations: Array<{
    externalSaleStableId: string;
    amountCents: number;
  }>;
  components: Array<{
    accountStableId: string;
    role: 'COLLECTION' | 'EXPENSE' | 'HST_RECOVERABLE';
    amountCents: number;
    label: string;
  }>;
};

export type AccountingExternalSaleDetailV1 = AccountingExternalSaleListItemV1 & {
  periodStartOn: string | null;
  periodEndOn: string | null;
  note: string | null;
  createdByActorRef: string;
  createdAt: string;
  lines: Array<{
    lineStableId: string;
    description: string;
    productReference: string | null;
    quantity: string;
    unit: string;
    unitPriceCents: number;
    lineAmountCents: number;
    revenueAccountStableId: string;
    sortOrder: number;
  }>;
  adjustments: Array<{
    adjustmentStableId: string;
    label: string;
    amountCents: number;
    revenueAccountStableId: string;
    sortOrder: number;
  }>;
  taxes: Array<{
    taxStableId: string;
    taxCode: string;
    label: string;
    rateBasisPoints: number | null;
    amountCents: number;
    liabilityAccountStableId: string;
    sortOrder: number;
  }>;
  settlements: AccountingExternalSaleSettlementListItemV1[];
};

export type AccountingExternalSalesListV1 = {
  version: 1;
  sales: AccountingExternalSaleListItemV1[];
};

export type AccountingExternalSaleSettlementsListV1 = {
  version: 1;
  settlements: AccountingExternalSaleSettlementListItemV1[];
};

export type AccountingExternalSaleFormOptionsV1 = {
  version: 1;
  store: {
    storeStableId: string;
    storeName: string;
    timezone: string;
  };
  classificationSuggestions: string[];
  sale: {
    lineRevenueAccounts: AccountingExternalSaleAccountOptionV1[];
    positiveAdjustmentAccounts: AccountingExternalSaleAccountOptionV1[];
    negativeAdjustmentAccounts: AccountingExternalSaleAccountOptionV1[];
    taxOptions: Array<{
      taxCode: 'HST' | 'ZERO_RATED';
      label: string;
      liabilityAccountStableId: string;
    }>;
  };
  settlement: {
    collectionAccounts: AccountingExternalSaleAccountOptionV1[];
    expenseAccounts: AccountingExternalSaleAccountOptionV1[];
    hstRecoverableAccount: AccountingExternalSaleAccountOptionV1 | null;
  };
};
