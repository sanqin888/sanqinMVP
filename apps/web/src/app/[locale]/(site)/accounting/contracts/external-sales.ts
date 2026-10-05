export type AccountingExternalSaleGranularity =
  | 'TRANSACTION'
  | 'DAILY_SUMMARY'
  | 'PERIOD_SUMMARY';

export type AccountingExternalSaleStatus =
  | 'OPEN'
  | 'PARTIALLY_SETTLED'
  | 'SETTLED'
  | 'REVERSED';

export type AccountingExternalSaleAccountOption = {
  accountStableId: string;
  name: string;
};

export type AccountingExternalSaleListItem = {
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
  status: AccountingExternalSaleStatus;
};

export type AccountingExternalSaleSettlement = {
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

export type AccountingExternalSaleDetail = AccountingExternalSaleListItem & {
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
  evidence?: Array<{
    evidenceStableId: string;
    artifactStableId: string;
    originalFilename: string | null;
    linkedAt: string;
  }>;
  settlements: AccountingExternalSaleSettlement[];
};

export type AccountingExternalSalesList = {
  version: 1;
  sales: AccountingExternalSaleListItem[];
};

export type AccountingExternalSaleSettlementsList = {
  version: 1;
  settlements: AccountingExternalSaleSettlement[];
};

export type AccountingExternalSaleFormOptions = {
  version: 1;
  store: {
    storeStableId: string;
    storeName: string;
    timezone: string;
  };
  classificationSuggestions: string[];
  sale: {
    lineRevenueAccounts: AccountingExternalSaleAccountOption[];
    positiveAdjustmentAccounts: AccountingExternalSaleAccountOption[];
    negativeAdjustmentAccounts: AccountingExternalSaleAccountOption[];
    taxOptions: Array<{
      taxCode: 'HST' | 'ZERO_RATED';
      label: string;
      liabilityAccountStableId: string;
    }>;
  };
  settlement: {
    collectionAccounts: AccountingExternalSaleAccountOption[];
    expenseAccounts: AccountingExternalSaleAccountOption[];
    hstRecoverableAccount: AccountingExternalSaleAccountOption | null;
  };
};

export type CreateAccountingExternalSaleInput = {
  requestId: string;
  storeStableId: string;
  classificationStableId: string;
  granularity: AccountingExternalSaleGranularity;
  occurredOn: string;
  periodStartOn?: string | null;
  periodEndOn?: string | null;
  counterpartyName: string;
  reference?: string | null;
  currency?: string;
  replacementForExternalSaleStableId?: string | null;
  lines: Array<{
    description: string;
    productReference?: string | null;
    quantity: string;
    unit: string;
    unitPriceCents: number;
    lineAmountCents: number;
    revenueAccountStableId: string;
  }>;
  adjustments?: Array<{
    label: string;
    amountCents: number;
    revenueAccountStableId: string;
  }>;
  taxes?: Array<{
    taxCode: string;
    label: string;
    rateBasisPoints?: number | null;
    amountCents: number;
    liabilityAccountStableId: string;
  }>;
  note?: string | null;
};

export type CreateAccountingExternalSaleSettlementInput = {
  requestId: string;
  storeStableId: string;
  settlementOn: string;
  counterpartyName: string;
  reference?: string | null;
  currency?: string;
  replacementForSettlementStableId?: string | null;
  allocations: Array<{
    externalSaleStableId: string;
    amountCents: number;
  }>;
  components: Array<{
    accountStableId: string;
    amountCents: number;
    label: string;
  }>;
  note?: string | null;
};

export type AccountingExternalSaleReconstructionPreview = {
  version: 1;
  planHash: string;
  status: 'READY' | 'BLOCKED';
  blockCode:
    | 'PRE_START_OPENING_BALANCE_REQUIRED'
    | 'PAID_AMOUNT_REQUIRES_SETTLEMENT_EVIDENCE'
    | null;
  accountingStartDate: string;
  evidence: {
    artifactStableId: string;
    contentHash: string;
    originalFilename: string;
  };
  source: {
    statementType: 'CUSTOMER_STATEMENT';
    counterpartyName: string;
    periodStartOn: string;
    periodEndOn: string;
    sourceRowCount: number;
    sourceQuantity: string;
    lineSubtotalCents: number;
    taxTotalCents: number;
    totalReceivableCents: number;
    paidAmountCents: number;
    balanceDueCents: number;
  };
  proposedSale: CreateAccountingExternalSaleInput;
  warnings: string[];
};

export type AccountingExternalSaleReconstructionExecution =
  AccountingExternalSaleReconstructionPreview & {
    execution: {
      externalSaleStableId: string;
      journalEntryStableId: string;
    };
  };

export type AccountingExternalSaleWriteResult = {
  version: 1;
  externalSaleStableId: string;
};

export type AccountingExternalSaleSettlementWriteResult = {
  version: 1;
  settlementStableId: string;
};

export type AccountingExternalSaleReversalResult = {
  version: 1;
  target: 'SALE' | 'SETTLEMENT';
  targetStableId: string;
  reversalStableId: string;
  reversalJournalEntryStableId: string;
  reversalFactHash: string;
  reversalReason: string;
  reversedAt: string;
  reversedByActorRef: string;
};
