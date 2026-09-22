import {
  AccountingAccountClass,
  AccountingAccountType,
  AccountingJournalEntryKind,
  AccountingJournalSource,
  AccountingTxType,
} from './accounting-contracts';
import {
  classifyAccountingCashflowContext,
  projectAccountingJournalReportEntry,
  type AccountingFinancialReportJournalEntry,
} from './accounting-financial-report-policy';

const at = new Date('2026-06-15T16:00:00.000Z');

const account = (
  accountStableId: string,
  name: string,
  accountClass: AccountingAccountClass,
  type: AccountingAccountType | null = null,
) => ({ accountStableId, name, accountClass, type });

const entry = (
  params: Partial<AccountingFinancialReportJournalEntry> &
    Pick<AccountingFinancialReportJournalEntry, 'lines'>,
): AccountingFinancialReportJournalEntry => ({
  entryStableId: 'journal_1',
  kind: AccountingJournalEntryKind.STANDARD,
  source: AccountingJournalSource.ORDER,
  occurredAt: at,
  currency: 'CAD',
  memo: 'test journal',
  createdAt: at,
  updatedAt: at,
  ...params,
});

describe('Accounting canonical financial report policy', () => {
  it('projects canonical sales as net revenue', () => {
    const projected = projectAccountingJournalReportEntry(
      entry({
        lines: [
          {
            lineNo: 1,
            debitCents: 0,
            creditCents: 1000,
            memo: null,
            account: account(
              'account_sales_revenue',
              '餐品销售收入',
              AccountingAccountClass.REVENUE,
            ),
            category: null,
          },
          {
            lineNo: 2,
            debitCents: 100,
            creditCents: 0,
            memo: null,
            account: account(
              'account_sales_discounts',
              '销售折扣',
              AccountingAccountClass.REVENUE,
            ),
            category: null,
          },
          {
            lineNo: 3,
            debitCents: 0,
            creditCents: 50,
            memo: null,
            account: account(
              'account_delivery_revenue',
              '配送收入',
              AccountingAccountClass.REVENUE,
            ),
            category: null,
          },
          {
            lineNo: 4,
            debitCents: 0,
            creditCents: 123,
            memo: null,
            account: account(
              'account_hst_payable',
              'HST/GST 应缴',
              AccountingAccountClass.LIABILITY,
            ),
            category: null,
          },
        ],
      }),
    );

    expect(
      projected.facts.reduce((sum, fact) => sum + fact.amountCents, 0),
    ).toBe(950);
    expect(projected.facts).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          type: AccountingTxType.INCOME,
          amountCents: 1000,
          categoryStableId: 'income_sales',
        }),
        expect.objectContaining({
          type: AccountingTxType.INCOME,
          amountCents: -100,
          categoryStableId: 'income_sales',
        }),
        expect.objectContaining({
          type: AccountingTxType.INCOME,
          amountCents: 50,
          categoryStableId: 'income_delivery',
        }),
      ]),
    );
    expect(projected.journalInputTaxCents).toBe(0);
  });

  it('projects canonical ORDER adjustments as one signed P&L adjustment', () => {
    const projected = projectAccountingJournalReportEntry(
      entry({
        kind: AccountingJournalEntryKind.ADJUSTMENT,
        source: AccountingJournalSource.ORDER,
        lines: [
          {
            lineNo: 1,
            debitCents: 200,
            creditCents: 0,
            memo: null,
            account: account(
              'account_sales_revenue',
              '餐品销售收入',
              AccountingAccountClass.REVENUE,
            ),
            category: null,
          },
          {
            lineNo: 2,
            debitCents: 0,
            creditCents: 20,
            memo: null,
            account: account(
              'account_sales_discounts',
              '销售折扣',
              AccountingAccountClass.REVENUE,
            ),
            category: null,
          },
        ],
      }),
    );

    expect(projected.facts).toEqual([
      expect.objectContaining({
        type: AccountingTxType.ADJUSTMENT,
        amountCents: -180,
        categoryStableId: 'adjustment_general',
      }),
    ]);
  });

  it('projects provider statement P&L and input tax', () => {
    const projected = projectAccountingJournalReportEntry(
      entry({
        kind: AccountingJournalEntryKind.ADJUSTMENT,
        source: AccountingJournalSource.PLATFORM_STATEMENT,
        lines: [
          {
            lineNo: 1,
            debitCents: 0,
            creditCents: 300,
            memo: null,
            account: account(
              'account_sales_revenue',
              '餐品销售收入',
              AccountingAccountClass.REVENUE,
            ),
            category: null,
          },
          {
            lineNo: 2,
            debitCents: 50,
            creditCents: 0,
            memo: null,
            account: account(
              'account_platform_commission_expense',
              '平台佣金',
              AccountingAccountClass.EXPENSE,
            ),
            category: null,
          },
          {
            lineNo: 3,
            debitCents: 6,
            creditCents: 0,
            memo: null,
            account: account(
              'account_hst_recoverable',
              'HST/GST 待抵扣',
              AccountingAccountClass.ASSET,
            ),
            category: null,
          },
        ],
      }),
    );

    expect(projected.facts).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          type: AccountingTxType.INCOME,
          amountCents: 300,
        }),
        expect.objectContaining({
          type: AccountingTxType.EXPENSE,
          amountCents: 50,
          categoryStableId: 'expense_platform_fee',
        }),
      ]),
    );
    expect(projected.facts).toHaveLength(2);
    expect(projected.journalInputTaxCents).toBe(6);
  });

  it('projects Expense Journals into P&L and recoverable input tax', () => {
    const projected = projectAccountingJournalReportEntry(
      entry({
        source: AccountingJournalSource.EXPENSE_DOCUMENT,
        lines: [
          {
            lineNo: 1,
            debitCents: 100,
            creditCents: 0,
            memo: null,
            account: account(
              'account_general_operating_expense',
              '一般经营费用',
              AccountingAccountClass.EXPENSE,
            ),
            category: {
              categoryStableId: 'expense_telecom',
              name: '通讯',
              type: AccountingTxType.EXPENSE,
            },
          },
          {
            lineNo: 2,
            debitCents: 13,
            creditCents: 0,
            memo: null,
            account: account(
              'account_hst_recoverable',
              'HST/GST 待抵扣',
              AccountingAccountClass.ASSET,
            ),
            category: null,
          },
          {
            lineNo: 3,
            debitCents: 0,
            creditCents: 113,
            memo: null,
            account: account(
              'account_primary_bank',
              '主要银行账户',
              AccountingAccountClass.ASSET,
              AccountingAccountType.BANK,
            ),
            category: null,
          },
        ],
      }),
    );

    expect(projected.facts).toEqual([
      expect.objectContaining({
        type: AccountingTxType.EXPENSE,
        amountCents: 100,
        categoryStableId: 'expense_telecom',
        source: AccountingJournalSource.EXPENSE_DOCUMENT,
      }),
    ]);
    expect(projected.journalInputTaxCents).toBe(13);
    expect(projected.expenseInputTaxCents).toBe(0);
  });

  it('keeps transfer magnitude visible without changing P&L or cashflow', () => {
    const projected = projectAccountingJournalReportEntry(
      entry({
        kind: AccountingJournalEntryKind.TRANSFER,
        source: AccountingJournalSource.MANUAL,
        lines: [
          {
            lineNo: 1,
            debitCents: 500,
            creditCents: 0,
            memo: null,
            account: account(
              'account_primary_bank',
              '主要银行账户',
              AccountingAccountClass.ASSET,
              AccountingAccountType.BANK,
            ),
            category: null,
          },
          {
            lineNo: 2,
            debitCents: 0,
            creditCents: 500,
            memo: null,
            account: account(
              'account_store_cash',
              '门店现金',
              AccountingAccountClass.ASSET,
              AccountingAccountType.CASH,
            ),
            category: null,
          },
        ],
      }),
    );

    expect(projected.facts).toEqual([
      expect.objectContaining({
        type: AccountingTxType.TRANSFER,
        amountCents: 500,
        categoryStableId: 'transfer_internal',
      }),
    ]);
  });

  it('classifies cashflow context without coupling it to P&L fact arithmetic', () => {
    expect(
      classifyAccountingCashflowContext(['equipment investment', 'Bank']),
    ).toBe('INVESTING');
    expect(
      classifyAccountingCashflowContext(['owner equity contribution', 'Bank']),
    ).toBe('FINANCING');
    expect(
      classifyAccountingCashflowContext(['provider settlement', 'Bank']),
    ).toBe('OPERATING');
  });
});
