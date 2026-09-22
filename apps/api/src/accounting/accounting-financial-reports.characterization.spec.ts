import {
  AccountingAccountClass,
  AccountingAccountType,
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
          {
            entryStableId: 'expense_journal_1',
            kind: AccountingJournalEntryKind.STANDARD,
            source: AccountingJournalSource.EXPENSE_DOCUMENT,
            occurredAt,
            currency: 'CAD',
            memo: 'ingredients',
            createdAt: occurredAt,
            updatedAt: occurredAt,
            lines: [
              {
                lineNo: 1,
                debitCents: 500,
                creditCents: 0,
                memo: null,
                account: account(
                  'account_general_operating_expense',
                  '一般经营费用',
                  AccountingAccountClass.EXPENSE,
                ),
                category: {
                  categoryStableId: 'expense_food',
                  name: '食材',
                  type: AccountingTxType.EXPENSE,
                },
              },
              {
                lineNo: 2,
                debitCents: 65,
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
                creditCents: 565,
                memo: null,
                account: account(
                  'account_primary_bank',
                  '主要银行账户',
                  AccountingAccountClass.ASSET,
                ),
                category: null,
              },
            ],
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
        },
      }),
    );
  });

  it('applies funding-account policy only to Expense v2 management facts', async () => {
    const occurredAt = new Date('2026-09-18T16:00:00.000Z');
    const expenseEntry = (params: {
      entryStableId: string;
      sourceFactType: string;
      sourceFactVersion: number;
      amountCents: number;
      taxCents: number;
      fundingAccountStableId: string;
      includeInManagement: boolean;
      memo: string;
    }) => ({
      entryStableId: params.entryStableId,
      kind: AccountingJournalEntryKind.STANDARD,
      source: AccountingJournalSource.EXPENSE_DOCUMENT,
      sourceFactType: params.sourceFactType,
      sourceFactVersion: params.sourceFactVersion,
      occurredAt,
      currency: 'CAD',
      memo: params.memo,
      createdAt: occurredAt,
      updatedAt: occurredAt,
      lines: [
        {
          lineNo: 1,
          debitCents: params.amountCents,
          creditCents: 0,
          memo: null,
          account: {
            accountStableId: 'account_general_operating_expense',
            name: '一般经营费用',
            type: null,
            accountClass: AccountingAccountClass.EXPENSE,
            includeFundedExpensesInManagementReports: true,
          },
          category: {
            categoryStableId: 'expense_food',
            name: '食材',
            type: AccountingTxType.EXPENSE,
          },
        },
        {
          lineNo: 2,
          debitCents: params.taxCents,
          creditCents: 0,
          memo: null,
          account: {
            accountStableId: 'account_hst_recoverable',
            name: 'HST/GST 待抵扣',
            type: null,
            accountClass: AccountingAccountClass.ASSET,
            includeFundedExpensesInManagementReports: true,
          },
          category: null,
        },
        {
          lineNo: 3,
          debitCents: 0,
          creditCents: params.amountCents + params.taxCents,
          memo: null,
          account: {
            accountStableId: params.fundingAccountStableId,
            name: params.fundingAccountStableId,
            type: AccountingAccountType.BANK,
            accountClass: AccountingAccountClass.ASSET,
            includeFundedExpensesInManagementReports:
              params.includeInManagement,
          },
          category: null,
        },
      ],
    });
    const prisma = {
      accountingJournalEntry: {
        findMany: jest.fn().mockResolvedValue([
          expenseEntry({
            entryStableId: 'expense_v2_included',
            sourceFactType: 'accounting.expense_document.v2',
            sourceFactVersion: 2,
            amountCents: 1000,
            taxCents: 130,
            fundingAccountStableId: 'account_primary_bank',
            includeInManagement: true,
            memo: 'included v2 expense',
          }),
          expenseEntry({
            entryStableId: 'expense_v2_excluded',
            sourceFactType: 'accounting.expense_document.v2',
            sourceFactVersion: 2,
            amountCents: 2000,
            taxCents: 260,
            fundingAccountStableId: 'account_cibc',
            includeInManagement: false,
            memo: 'excluded v2 expense',
          }),
          expenseEntry({
            entryStableId: 'expense_v1_legacy',
            sourceFactType: 'accounting.expense_document.v1',
            sourceFactVersion: 1,
            amountCents: 3000,
            taxCents: 390,
            fundingAccountStableId: 'account_cibc',
            includeInManagement: false,
            memo: 'legacy v1 expense',
          }),
        ]),
      },
      accountingCategory: {
        findMany: jest.fn().mockResolvedValue([
          {
            categoryStableId: 'expense_food',
            name: '食材',
            type: AccountingTxType.EXPENSE,
            parent: null,
          },
        ]),
      },
      accountingInboxItem: {
        count: jest.fn().mockResolvedValue(0),
      },
      accountingPeriodClose: {
        findFirst: jest.fn().mockResolvedValue(null),
      },
      accountingAuditLog: {
        create: jest.fn().mockResolvedValue({}),
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

    const pnl = await service.pnlReport({ groupBy: 'month' });
    expect(pnl.summary.expenseCents).toBe(4000);
    expect(pnl.byCategory).toEqual([
      expect.objectContaining({
        categoryStableId: 'expense_food',
        amountCents: 4000,
      }),
    ]);

    const dashboard = await service.dashboard('2026-09-01', '2026-09-30');
    expect(dashboard.summary.expenseCents).toBe(4000);
    expect(dashboard.summary.taxCents).toBe(780);

    const canonicalCsv = await service.exportTxCsv({}, 'user_stable_1');
    expect(canonicalCsv).toContain('included v2 expense');
    expect(canonicalCsv).toContain('excluded v2 expense');
    expect(canonicalCsv).toContain('legacy v1 expense');
  });

  it('interprets date-only report ranges in the configured business timezone', async () => {
    const prisma = {
      accountingJournalEntry: {
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
          {
            memo: 'operating supplies',
            lines: [
              {
                debitCents: 200,
                creditCents: 0,
                memo: null,
                account: { name: 'Operating Expense', type: null },
                category: { name: '厨房用品' },
              },
              {
                debitCents: 0,
                creditCents: 200,
                memo: null,
                account: {
                  name: 'Primary Bank',
                  type: AccountingAccountType.BANK,
                },
                category: null,
              },
            ],
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
          kind: {
            notIn: [
              AccountingJournalEntryKind.TRANSFER,
              AccountingJournalEntryKind.OPENING_BALANCE,
            ],
          },
        },
      }),
    );
  });
});
