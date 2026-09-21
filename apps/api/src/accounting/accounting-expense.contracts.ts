export type AccountingExpenseSplitInput = {
  categoryStableId: string;
  amountCents: number;
  taxCents?: number;
};

export type AccountingExpensePaymentAllocationInput = {
  accountStableId: string;
  amountCents: number;
};

export type AccountingExpenseInput = {
  occurredAt: string;
  totalCents: number;
  sourceCurrency?: string | null;
  paymentAllocations?: AccountingExpensePaymentAllocationInput[];
  attachmentUrls?: string[];
  memo?: string | null;
  splits: AccountingExpenseSplitInput[];
};
