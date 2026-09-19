import type { AccountingCategory } from './chart';

export type AccountingReportGroupBy = 'month' | 'quarter' | 'year';

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
    type: AccountingCategory['type'];
    amountCents: number;
  }>;
  byCategoryTree: Array<{
    categoryStableId: string;
    categoryName: string;
    type: AccountingCategory['type'];
    parentStableId: string | null;
    amountCents: number;
  }>;
  bySource: Array<{
    source: string;
    amountCents: number;
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

export type AccountingAccountBalanceReport = Array<{
  accountStableId: string;
  accountName: string;
  inflowCents: number;
  outflowCents: number;
  balanceChangeCents: number;
}>;

export type AccountingDashboard = {
  from: string;
  to: string;
  summary: {
    incomeCents: number;
    expenseCents: number;
    adjustmentCents: number;
    netProfitCents: number;
    taxCents: number;
  };
  pending: {
    inboxItems: number;
  };
  topExpenseCategories: Array<{
    categoryStableId: string;
    name: string;
    amountCents: number;
  }>;
  lastClosedMonth: string | null;
};

export type AccountingOrderDimensionSlice = {
  from: string | null;
  to: string | null;
  byChannel: Array<{
    key: string;
    amountCents: number;
  }>;
  byPaymentMethod: Array<{
    key: string;
    amountCents: number;
  }>;
};
