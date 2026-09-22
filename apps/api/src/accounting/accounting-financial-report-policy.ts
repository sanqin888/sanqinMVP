import {
  AccountingAccountClass,
  type AccountingAccountType,
  AccountingJournalEntryKind,
  AccountingJournalSource,
  AccountingTxType,
} from './accounting-contracts';

export type AccountingFinancialReportCategory = {
  categoryStableId: string;
  name: string;
  type: AccountingTxType;
};

export type AccountingFinancialReportAccount = {
  accountStableId: string;
  name: string;
  type: AccountingAccountType | null;
  accountClass: AccountingAccountClass;
};

export type AccountingFinancialReportJournalLine = {
  lineNo: number;
  debitCents: number;
  creditCents: number;
  memo: string | null;
  account: AccountingFinancialReportAccount;
  category: AccountingFinancialReportCategory | null;
};

export type AccountingFinancialReportJournalEntry = {
  entryStableId: string;
  kind: AccountingJournalEntryKind;
  source: AccountingJournalSource;
  occurredAt: Date;
  currency: string;
  memo: string | null;
  createdAt: Date;
  updatedAt: Date;
  lines: AccountingFinancialReportJournalLine[];
};

export type AccountingFinancialReportFact = {
  stableId: string;
  type: AccountingTxType;
  amountCents: number;
  taxCents: number;
  source: AccountingJournalSource;
  occurredAt: Date;
  currency: string;
  categoryStableId: string;
  categoryName: string;
  accountStableId: string | null;
  accountName: string | null;
  memo: string | null;
  createdAt: Date;
  updatedAt: Date;
};

export type AccountingFinancialReportProjection = {
  facts: AccountingFinancialReportFact[];
  journalInputTaxCents: number;
  expenseInputTaxCents: number;
};

const FALLBACK_CATEGORIES = {
  incomeSales: {
    categoryStableId: 'income_sales',
    name: '餐品销售',
    type: AccountingTxType.INCOME,
  },
  incomeDelivery: {
    categoryStableId: 'income_delivery',
    name: '配送收入',
    type: AccountingTxType.INCOME,
  },
  incomeOther: {
    categoryStableId: 'income_other',
    name: '其他收入',
    type: AccountingTxType.INCOME,
  },
  expensePlatform: {
    categoryStableId: 'expense_platform_fee',
    name: '平台佣金',
    type: AccountingTxType.EXPENSE,
  },
  expenseMarketing: {
    categoryStableId: 'expense_marketing',
    name: '广告营销',
    type: AccountingTxType.EXPENSE,
  },
  expenseOther: {
    categoryStableId: 'expense_other',
    name: '其他支出',
    type: AccountingTxType.EXPENSE,
  },
  adjustment: {
    categoryStableId: 'adjustment_general',
    name: '会计调整',
    type: AccountingTxType.ADJUSTMENT,
  },
  transfer: {
    categoryStableId: 'transfer_internal',
    name: '账户转账',
    type: AccountingTxType.TRANSFER,
  },
} as const satisfies Record<string, AccountingFinancialReportCategory>;

const ACCOUNT_CATEGORY: Record<string, AccountingFinancialReportCategory> = {
  account_sales_revenue: FALLBACK_CATEGORIES.incomeSales,
  account_sales_discounts: FALLBACK_CATEGORIES.incomeSales,
  account_delivery_revenue: FALLBACK_CATEGORIES.incomeDelivery,
  account_card_surcharge_revenue: FALLBACK_CATEGORIES.incomeOther,
  account_tip_revenue: FALLBACK_CATEGORIES.incomeOther,
  account_other_operating_revenue: FALLBACK_CATEGORIES.incomeOther,
  account_platform_commission_expense: FALLBACK_CATEGORIES.expensePlatform,
  account_payment_processing_fee_expense: FALLBACK_CATEGORIES.expensePlatform,
  account_platform_promotion_expense: FALLBACK_CATEGORIES.expenseMarketing,
  account_advertising_expense: FALLBACK_CATEGORIES.expenseMarketing,
  account_general_operating_expense: FALLBACK_CATEGORIES.expenseOther,
  account_chargeback_adjustment_expense: FALLBACK_CATEGORIES.expenseOther,
};

function categoryForLine(
  line: AccountingFinancialReportJournalLine,
): AccountingFinancialReportCategory {
  if (line.category) return line.category;
  const mapped = ACCOUNT_CATEGORY[line.account.accountStableId];
  if (mapped) return mapped;
  return line.account.accountClass === AccountingAccountClass.REVENUE
    ? FALLBACK_CATEGORIES.incomeOther
    : FALLBACK_CATEGORIES.expenseOther;
}

function signedRevenue(line: AccountingFinancialReportJournalLine): number {
  return line.creditCents - line.debitCents;
}

function signedExpense(line: AccountingFinancialReportJournalLine): number {
  return line.debitCents - line.creditCents;
}

function factFromLine(params: {
  entry: AccountingFinancialReportJournalEntry;
  line: AccountingFinancialReportJournalLine;
  type: AccountingTxType;
  amountCents: number;
}): AccountingFinancialReportFact {
  const { entry, line, type, amountCents } = params;
  const category = categoryForLine(line);
  return {
    stableId: `journal:${entry.entryStableId}:${line.lineNo}`,
    type,
    amountCents,
    taxCents: 0,
    source: entry.source,
    occurredAt: entry.occurredAt,
    currency: entry.currency,
    categoryStableId: category.categoryStableId,
    categoryName: category.name,
    accountStableId: line.account.accountStableId,
    accountName: line.account.name,
    memo: line.memo ?? entry.memo,
    createdAt: entry.createdAt,
    updatedAt: entry.updatedAt,
  };
}

export function projectAccountingJournalReportEntry(
  entry: AccountingFinancialReportJournalEntry,
): AccountingFinancialReportProjection {
  if (entry.kind === AccountingJournalEntryKind.OPENING_BALANCE) {
    return { facts: [], journalInputTaxCents: 0, expenseInputTaxCents: 0 };
  }

  const journalInputTaxCents = entry.lines.reduce(
    (sum, line) =>
      line.account.accountStableId === 'account_hst_recoverable'
        ? sum + line.debitCents - line.creditCents
        : sum,
    0,
  );

  if (entry.kind === AccountingJournalEntryKind.TRANSFER) {
    const amountCents = entry.lines.reduce(
      (sum, line) => sum + line.debitCents,
      0,
    );
    if (amountCents === 0) {
      return { facts: [], journalInputTaxCents, expenseInputTaxCents: 0 };
    }
    return {
      facts: [
        {
          stableId: `journal:${entry.entryStableId}:transfer`,
          type: AccountingTxType.TRANSFER,
          amountCents,
          taxCents: 0,
          source: entry.source,
          occurredAt: entry.occurredAt,
          currency: entry.currency,
          categoryStableId: FALLBACK_CATEGORIES.transfer.categoryStableId,
          categoryName: FALLBACK_CATEGORIES.transfer.name,
          accountStableId: null,
          accountName: null,
          memo: entry.memo,
          createdAt: entry.createdAt,
          updatedAt: entry.updatedAt,
        },
      ],
      journalInputTaxCents,
      expenseInputTaxCents: 0,
    };
  }

  const treatAsNetAdjustment =
    entry.kind === AccountingJournalEntryKind.ADJUSTMENT &&
    entry.source !== AccountingJournalSource.PLATFORM_STATEMENT;

  if (treatAsNetAdjustment) {
    const revenueNetCents = entry.lines.reduce(
      (sum, line) =>
        line.account.accountClass === AccountingAccountClass.REVENUE
          ? sum + signedRevenue(line)
          : sum,
      0,
    );
    const expenseNetCents = entry.lines.reduce(
      (sum, line) =>
        line.account.accountClass === AccountingAccountClass.EXPENSE
          ? sum + signedExpense(line)
          : sum,
      0,
    );
    const adjustmentCents = revenueNetCents - expenseNetCents;
    if (adjustmentCents === 0) {
      return { facts: [], journalInputTaxCents, expenseInputTaxCents: 0 };
    }
    return {
      facts: [
        {
          stableId: `journal:${entry.entryStableId}:adjustment`,
          type: AccountingTxType.ADJUSTMENT,
          amountCents: adjustmentCents,
          taxCents: 0,
          source: entry.source,
          occurredAt: entry.occurredAt,
          currency: entry.currency,
          categoryStableId: FALLBACK_CATEGORIES.adjustment.categoryStableId,
          categoryName: FALLBACK_CATEGORIES.adjustment.name,
          accountStableId: null,
          accountName: null,
          memo: entry.memo,
          createdAt: entry.createdAt,
          updatedAt: entry.updatedAt,
        },
      ],
      journalInputTaxCents,
      expenseInputTaxCents: 0,
    };
  }

  const facts: AccountingFinancialReportFact[] = [];
  for (const line of entry.lines) {
    if (line.account.accountClass === AccountingAccountClass.REVENUE) {
      const amountCents = signedRevenue(line);
      if (amountCents !== 0) {
        facts.push(
          factFromLine({
            entry,
            line,
            type: AccountingTxType.INCOME,
            amountCents,
          }),
        );
      }
      continue;
    }
    if (line.account.accountClass === AccountingAccountClass.EXPENSE) {
      const amountCents = signedExpense(line);
      if (amountCents !== 0) {
        facts.push(
          factFromLine({
            entry,
            line,
            type: AccountingTxType.EXPENSE,
            amountCents,
          }),
        );
      }
    }
  }

  return { facts, journalInputTaxCents, expenseInputTaxCents: 0 };
}

export function classifyAccountingCashflowContext(
  values: Array<string | null | undefined>,
): 'OPERATING' | 'INVESTING' | 'FINANCING' {
  const text = values
    .filter((value): value is string => Boolean(value))
    .join(' ');
  if (/投资|invest/i.test(text)) return 'INVESTING';
  if (/融资|loan|equity|capital/i.test(text)) return 'FINANCING';
  return 'OPERATING';
}
