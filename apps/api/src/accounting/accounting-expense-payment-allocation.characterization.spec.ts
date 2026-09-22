import { AccountingPeriodService } from './accounting-period.service';
import { AccountingFinancialReportsService } from './accounting-financial-reports.service';

describe('Accounting Expense payment allocation characterization', () => {
  it('reports Expense cash outflow from canonical Journal lines only', async () => {
    const prisma = {
      accountingAutomationConfig: {
        findUnique: jest.fn().mockResolvedValue(null),
      },
      accountingJournalLine: {
        findMany: jest.fn().mockResolvedValue([
          {
            debitCents: 500,
            creditCents: 0,
            account: {
              accountStableId: 'account_store_cash',
              name: 'Store Cash',
              type: 'CASH',
            },
          },
          {
            debitCents: 0,
            creditCents: 2000,
            account: {
              accountStableId: 'account_rbc',
              name: 'RBC Debit',
              type: 'BANK',
            },
          },
          {
            debitCents: 0,
            creditCents: 2238,
            account: {
              accountStableId: 'account_cash',
              name: 'Cash',
              type: 'CASH',
            },
          },
        ]),
      },
    };
    const brandStoreConfigReader = {
      getConfiguredStoreSnapshot: jest.fn(),
    };
    const period = new AccountingPeriodService(
      prisma as never,
      brandStoreConfigReader as never,
    );
    const service = new AccountingFinancialReportsService(
      prisma as never,
      period,
    );

    const result = await service.accountBalanceReport();

    expect(result).toEqual(
      expect.arrayContaining([
        {
          accountStableId: 'account_rbc',
          accountName: 'RBC Debit',
          inflowCents: 0,
          outflowCents: 2000,
          balanceChangeCents: -2000,
        },
        {
          accountStableId: 'account_cash',
          accountName: 'Cash',
          inflowCents: 0,
          outflowCents: 2238,
          balanceChangeCents: -2238,
        },
        {
          accountStableId: 'account_store_cash',
          accountName: 'Store Cash',
          inflowCents: 500,
          outflowCents: 0,
          balanceChangeCents: 500,
        },
      ]),
    );
    expect(prisma.accountingJournalLine.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          entry: {
            deletedAt: null,
          },
        },
      }),
    );
  });
});
