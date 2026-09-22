export type AccountingCategory = {
  categoryStableId: string;
  name: string;
  type: 'INCOME' | 'EXPENSE' | 'ADJUSTMENT' | 'TRANSFER';
  isActive: boolean;
  parentStableId: string | null;
  sortOrder: number;
};

export type AccountingAccount = {
  accountStableId: string;
  name: string;
  type: 'CASH' | 'BANK' | 'PLATFORM_WALLET';
  accountClass: 'ASSET' | 'LIABILITY' | 'EQUITY' | 'REVENUE' | 'EXPENSE';
  currency: string;
  includeFundedExpensesInManagementReports: boolean;
};
