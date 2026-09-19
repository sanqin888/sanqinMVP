import {
  AccountingAccountClass,
  AccountingAccountType,
  AccountingDocumentStatus,
  AccountingJournalEntryKind,
  AccountingJournalSource,
  AccountingTxType,
} from './accounting-contracts';
import { AccountingFinancialReportsService } from './accounting-financial-reports.service';

describe('AccountingFinancialReportsService canonical fact characterization', () => {
  it('combines Journal and confirmed Expense facts once', async () => {
    const occurredAt = new Date('2026-06-15T16:00:00.000Z');
    const account = (
      accountStableId: string,
      name: string,
      accountClass: AccountingAccountClass,
    ) => ({ accountStableId, name, type: null, accountClass });
    const prisma = {
      accountingJournalEntry: {
        findMany: jest.fn().mockResolvedValue([
          {
            entryStableId: 'sale_1',
            kind: AccountingJournalEntryKind.STANDARD,
            source: AccountingJournalSource.ORDER,
            occurredAt,
            currency: 'CAD',
            memo: 'sale',
            createdAt: occurredAt,
            updatedAt: occurredAt,
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
            ],
          },
          {
            entryStableId: 'refund_1',
            kind: AccountingJournalEntryKind.ADJUSTMENT,
            source: AccountingJournalSource.ORDER,
            occurredAt,
            currency: 'CAD',
            memo: 'refund',
            createdAt: occurredAt,
            updatedAt: occurredAt,
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
            ],
          },
          {
            entryStableId: 'provider_1',
            kind: AccountingJournalEntryKind.ADJUSTMENT,
            source: AccountingJournalSource.PLATFORM_STATEMENT,
            occurredAt,
            currency: 'CAD',
            memo: 'provider settlement',
            createdAt: occurredAt,
            updatedAt: occurredAt,
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
            ],
          },
        ]),
      },
      accountingTransaction: {
        findMany: jest.fn().mockResolvedValue([
          {
            txStableId: 'expense_1',
            amountCents: 500,
            taxCents: 65,
            occurredAt,
            currency: 'CAD',
            memo: 'ingredients',
            createdAt: occurredAt,
            updatedAt: occurredAt,
            category: {
              categoryStableId: 'expense_food',
              name: '食材',
              type: AccountingTxType.EXPENSE,
            },
          },
        ]),
      },
      accountingCategory: {
        findMany: jest.fn().mockResolvedValue([
          {
            categoryStableId: 'income_sales',
            name: '餐品销售',
            type: AccountingTxType.INCOME,
            parent: null,
          },
          {
            categoryStableId: 'expense_platform_fee',
            name: '平台佣金',
            type: AccountingTxType.EXPENSE,
            parent: null,
          },
          {
            categoryStableId: 'expense_food',
            name: '食材',
            type: AccountingTxType.EXPENSE,
            parent: null,
          },
          {
            categoryStableId: 'adjustment_general',
            name: '会计调整',
            type: AccountingTxType.ADJUSTMENT,
            parent: null,
          },
        ]),
      },
    };
    const period = {
      clampAccountingFromDate: jest.fn((value: Date | undefined) =>
        Promise.resolve(value),
      ),
      getBusinessTimezone: jest.fn().mockResolvedValue('America/Toronto'),
      toPeriodKey: jest.fn().mockReturnValue('2026-06'),
      listPeriodCloseStatus: jest.fn().mockResolvedValue([]),
    };
    const service = new AccountingFinancialReportsService(
      prisma as never,
      period as never,
    );

    const report = await service.pnlReport({ groupBy: 'month' });

    expect(report.summary).toEqual({
      incomeCents: 1200,
      expenseCents: 550,
      adjustmentCents: -200,
      transferCents: 0,
      netProfitCents: 450,
    });
    expect(report.bySource).toEqual(
      expect.arrayContaining([
        { source: AccountingJournalSource.ORDER, amountCents: 700 },
        {
          source: AccountingJournalSource.PLATFORM_STATEMENT,
          amountCents: 350,
        },
        {
          source: AccountingJournalSource.EXPENSE_DOCUMENT,
          amountCents: 500,
        },
      ]),
    );
    expect(prisma.accountingJournalEntry.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          deletedAt: null,
          source: { not: AccountingJournalSource.EXPENSE_DOCUMENT },
        },
      }),
    );
    expect(prisma.accountingTransaction.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          deletedAt: null,
          type: AccountingTxType.EXPENSE,
          document: { status: AccountingDocumentStatus.CONFIRMED },
        },
      }),
    );
  });

  it('interprets date-only report ranges in the configured business timezone', async () => {
    const prisma = {
      accountingJournalEntry: {
        findMany: jest.fn().mockResolvedValue([]),
      },
      accountingTransaction: {
        findMany: jest.fn().mockResolvedValue([]),
      },
      accountingCategory: {
        findMany: jest.fn().mockResolvedValue([]),
      },
    };
    const period = {
      clampAccountingFromDate: jest.fn((value: Date | undefined) =>
        Promise.resolve(value),
      ),
      getBusinessTimezone: jest.fn().mockResolvedValue('America/Toronto'),
      toPeriodKey: jest.fn().mockReturnValue('2026-09'),
      listPeriodCloseStatus: jest.fn().mockResolvedValue([]),
    };
    const service = new AccountingFinancialReportsService(
      prisma as never,
      period as never,
    );

    await service.pnlReport({
      from: '2026-09-01',
      to: '2026-09-19',
      groupBy: 'month',
    });

    const expectedRange = {
      gte: new Date('2026-09-01T04:00:00.000Z'),
      lte: new Date('2026-09-20T03:59:59.999Z'),
    };
    expect(prisma.accountingJournalEntry.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          deletedAt: null,
          source: { not: AccountingJournalSource.EXPENSE_DOCUMENT },
          occurredAt: expectedRange,
        },
      }),
    );
    expect(prisma.accountingTransaction.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          deletedAt: null,
          type: AccountingTxType.EXPENSE,
          document: { status: AccountingDocumentStatus.CONFIRMED },
          occurredAt: expectedRange,
        },
      }),
    );
  });

  it('derives cashflow from CASH/BANK movements only', async () => {
    const prisma = {
      accountingJournalEntry: {
        findMany: jest.fn().mockResolvedValue([
          {
            memo: 'cash sale',
            lines: [
              {
                debitCents: 1130,
                creditCents: 0,
                memo: null,
                account: {
                  name: 'Store Cash',
                  type: AccountingAccountType.CASH,
                },
                category: null,
              },
              {
                debitCents: 0,
                creditCents: 1000,
                memo: null,
                account: { name: 'Sales Revenue', type: null },
                category: { name: '餐品销售' },
              },
            ],
          },
          {
            memo: 'card sale still awaiting settlement',
            lines: [
              {
                debitCents: 1130,
                creditCents: 0,
                memo: null,
                account: {
                  name: 'Clover Pending',
                  type: AccountingAccountType.PLATFORM_WALLET,
                },
                category: null,
              },
              {
                debitCents: 0,
                creditCents: 1000,
                memo: null,
                account: { name: 'Sales Revenue', type: null },
                category: { name: '餐品销售' },
              },
            ],
          },
          {
            memo: 'provider settlement',
            lines: [
              {
                debitCents: 900,
                creditCents: 0,
                memo: null,
                account: {
                  name: 'Primary Bank',
                  type: AccountingAccountType.BANK,
                },
                category: null,
              },
              {
                debitCents: 0,
                creditCents: 900,
                memo: null,
                account: {
                  name: 'Uber Eats Pending',
                  type: AccountingAccountType.PLATFORM_WALLET,
                },
                category: null,
              },
            ],
          },
          {
            memo: 'equipment investment',
            lines: [
              {
                debitCents: 500,
                creditCents: 0,
                memo: null,
                account: { name: 'Equipment', type: null },
                category: { name: '投资设备' },
              },
              {
                debitCents: 0,
                creditCents: 500,
                memo: null,
                account: {
                  name: 'Primary Bank',
                  type: AccountingAccountType.BANK,
                },
                category: null,
              },
            ],
          },
          {
            memo: 'owner equity contribution',
            lines: [
              {
                debitCents: 1000,
                creditCents: 0,
                memo: null,
                account: {
                  name: 'Primary Bank',
                  type: AccountingAccountType.BANK,
                },
                category: null,
              },
              {
                debitCents: 0,
                creditCents: 1000,
                memo: null,
                account: { name: 'Owner Equity', type: null },
                category: null,
              },
            ],
          },
        ]),
      },
      accountingExpensePaymentAllocation: {
        findMany: jest.fn().mockResolvedValue([
          {
            amountCents: 200,
            account: {
              name: 'Primary Bank',
              type: AccountingAccountType.BANK,
            },
            expenseDocument: {
              memo: 'operating supplies',
              transactions: [{ memo: null, category: { name: '厨房用品' } }],
            },
          },
          {
            amountCents: 100,
            account: {
              name: 'Uber Eats Pending',
              type: AccountingAccountType.PLATFORM_WALLET,
            },
            expenseDocument: {
              memo: 'platform deduction',
              transactions: [{ memo: null, category: { name: '平台佣金' } }],
            },
          },
        ]),
      },
    };
    const period = {
      clampAccountingFromDate: jest.fn((value: Date | undefined) =>
        Promise.resolve(value),
      ),
    };
    const service = new AccountingFinancialReportsService(
      prisma as never,
      period as never,
    );

    const report = await service.cashflowOverview({});

    expect(report).toEqual({
      from: null,
      to: null,
      operatingCents: 1830,
      investingCents: -500,
      financingCents: 1000,
      netCashflowCents: 2330,
    });
    expect(prisma.accountingJournalEntry.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          deletedAt: null,
          source: { not: AccountingJournalSource.EXPENSE_DOCUMENT },
          kind: {
            notIn: [
              AccountingJournalEntryKind.TRANSFER,
              AccountingJournalEntryKind.OPENING_BALANCE,
            ],
          },
        },
      }),
    );
    expect(
      prisma.accountingExpensePaymentAllocation.findMany,
    ).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          expenseDocument: {
            status: AccountingDocumentStatus.CONFIRMED,
          },
        },
      }),
    );
  });
});
