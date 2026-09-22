export type AccountingExpenseSplitInput = {
  categoryStableId: string;
  amountCents: number;
  taxCents?: number;
  paidFromAccountStableId: string | null;
};

export type AccountingExpensePaymentAllocationInput = {
  accountStableId: string;
  amountCents: number;
};

export type AccountingExpenseInput = {
  occurredAt: string;
  totalCents: number;
  sourceCurrency?: string | null;
  attachmentUrls?: string[];
  memo?: string | null;
  splits: AccountingExpenseSplitInput[];
};

export type AccountingExpensePaymentCompletionInput = {
  paymentAllocations: AccountingExpensePaymentAllocationInput[];
};

export type AccountingExpenseSplitFundingCompletionInput = {
  splits: Array<{
    splitStableId: string;
    paidFromAccountStableId: string;
  }>;
};

export type AccountingExpensePaymentState = 'ASSIGNED' | 'UNASSIGNED';
