export type AccountingReportGroupBy = 'month' | 'quarter' | 'year';

export type AccountingManagementCategoryType =
  | 'INCOME'
  | 'EXPENSE'
  | 'ADJUSTMENT'
  | 'TRANSFER';

export type AccountingPnlSummary = {
  incomeCents: number;
  expenseCents: number;
  adjustmentCents: number;
  transferCents: number;
  netProfitCents: number;
};

export type AccountingPnlPeriod = {
  period: string;
  incomeCents: number;
  expenseCents: number;
  adjustmentCents: number;
  transferCents: number;
  netProfitCents: number;
  isClosed: boolean;
};

export type AccountingPnlReport = {
  groupBy: AccountingReportGroupBy;
  from: string | null;
  to: string | null;
  summary: AccountingPnlSummary;
  periods: AccountingPnlPeriod[];
  byCategory: Array<{
    categoryStableId: string;
    categoryName: string;
    type: AccountingManagementCategoryType;
    amountCents: number;
  }>;
  byCategoryTree: Array<{
    categoryStableId: string;
    categoryName: string;
    type: AccountingManagementCategoryType;
    parentStableId: string | null;
    amountCents: number;
  }>;
  bySource: Array<{
    source: string;
    amountCents: number;
  }>;
  adjustmentBreakdown: Array<{
    source: string;
    sourceFactType: string | null;
    journalCount: number;
    revenueNetCents: number;
    expenseNetCents: number;
    netProfitEffectCents: number;
  }>;
  trends: {
    currentMonthNetCents: number;
    lastMonthNetCents: number;
    quarterToDateNetCents: number;
  };
  closeStatus: {
    currentMonth: boolean;
    lastMonth: boolean;
  };
};

export type AccountingCashflowReport = {
  from: string | null;
  to: string | null;
  operatingCents: number;
  investingCents: number;
  financingCents: number;
  netCashflowCents: number;
};
