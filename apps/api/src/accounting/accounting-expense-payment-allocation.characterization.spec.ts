import { AccountingSourceType, AccountingTxType } from '@prisma/client';
import { AccountingPeriodService } from './accounting-period.service';
import { AccountingService } from './accounting.service';

describe('Accounting Expense payment allocation characterization', () => {
  it('reports document-backed Expense cash outflow from payment allocations, not category splits', async () => {
    const prisma = {
      accountingAutomationConfig: {
        findUnique: jest.fn().mockResolvedValue(null),
      },
      accountingTransaction: {
        findMany: jest.fn().mockResolvedValue([
          {
            type: AccountingTxType.EXPENSE,
            source: AccountingSourceType.MANUAL,
            amountCents: 3439,
            taxCents: 0,
            documentId: 'expense-document-db-id',
            account: {
              accountStableId: 'account_should_not_be_used',
              name: 'Retired split account',
              type: 'BANK',
            },
            toAccount: null,
          },
          {
            type: AccountingTxType.EXPENSE,
            source: AccountingSourceType.MANUAL,
            amountCents: 100,
            taxCents: 13,
            documentId: null,
            account: {
              accountStableId: 'account_petty_cash',
              name: 'Petty Cash',
              type: 'CASH',
            },
            toAccount: null,
          },
        ]),
      },
      accountingExpensePaymentAllocation: {
        findMany: jest.fn().mockResolvedValue([
          {
            amountCents: 2000,
            account: { accountStableId: 'account_rbc', name: 'RBC Debit' },
          },
          {
            amountCents: 2238,
            account: { accountStableId: 'account_cash', name: 'Cash' },
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
    const service = new AccountingService(
      prisma as never,
      period,
      {} as never,
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
          accountStableId: 'account_petty_cash',
          accountName: 'Petty Cash',
          inflowCents: 0,
          outflowCents: 113,
          balanceChangeCents: -113,
        },
      ]),
    );
    expect(result).not.toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          accountStableId: 'account_should_not_be_used',
        }),
      ]),
    );
    expect(
      prisma.accountingExpensePaymentAllocation.findMany,
    ).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          expenseDocument: {
            status: 'CONFIRMED',
          },
        },
      }),
    );
  });
});
