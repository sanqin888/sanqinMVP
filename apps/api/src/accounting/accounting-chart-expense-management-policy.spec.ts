import {
  AccountingAccountClass,
  AccountingAccountType,
} from './accounting-contracts';
import { AccountingChartService } from './accounting-chart.service';

describe('AccountingChartService expense management policy', () => {
  it('persists the policy explicitly when creating an operational account', async () => {
    const create = jest.fn().mockResolvedValue({
      accountStableId: 'account_cibc',
      name: 'CIBC',
      type: AccountingAccountType.BANK,
      accountClass: AccountingAccountClass.ASSET,
      currency: 'CAD',
      includeFundedExpensesInManagementReports: false,
    });
    const service = new AccountingChartService({
      accountingAccount: { create },
    } as never);

    await expect(
      service.createAccount({
        name: ' CIBC ',
        type: AccountingAccountType.BANK,
        currency: 'cad',
        includeFundedExpensesInManagementReports: false,
      }),
    ).resolves.toEqual(
      expect.objectContaining({
        accountStableId: 'account_cibc',
        includeFundedExpensesInManagementReports: false,
      }),
    );

    expect(create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          name: 'CIBC',
          type: AccountingAccountType.BANK,
          accountClass: AccountingAccountClass.ASSET,
          currency: 'CAD',
          includeFundedExpensesInManagementReports: false,
        }) as unknown,
      }),
    );
  });

  it('updates only the management-expense policy for an active operational account', async () => {
    const update = jest.fn().mockResolvedValue({
      accountStableId: 'account_cibc',
      name: 'CIBC',
      type: AccountingAccountType.BANK,
      accountClass: AccountingAccountClass.ASSET,
      currency: 'CAD',
      includeFundedExpensesInManagementReports: false,
    });
    const service = new AccountingChartService({
      accountingAccount: {
        findUnique: jest.fn().mockResolvedValue({
          id: 'account-db-id',
          accountClass: AccountingAccountClass.ASSET,
          type: AccountingAccountType.BANK,
          isActive: true,
        }),
        update,
      },
    } as never);

    await expect(
      service.updateAccountExpenseManagementPolicy('account_cibc', false),
    ).resolves.toEqual(
      expect.objectContaining({
        accountStableId: 'account_cibc',
        includeFundedExpensesInManagementReports: false,
      }),
    );

    expect(update).toHaveBeenCalledWith({
      where: { id: 'account-db-id' },
      data: { includeFundedExpensesInManagementReports: false },
      select: {
        accountStableId: true,
        name: true,
        type: true,
        accountClass: true,
        currency: true,
        includeFundedExpensesInManagementReports: true,
      },
    });
  });

  it('rejects policy mutation for a non-operational account', async () => {
    const service = new AccountingChartService({
      accountingAccount: {
        findUnique: jest.fn().mockResolvedValue({
          id: 'account-db-id',
          accountClass: AccountingAccountClass.LIABILITY,
          type: null,
          isActive: true,
        }),
      },
    } as never);

    await expect(
      service.updateAccountExpenseManagementPolicy(
        'account_hst_payable',
        false,
      ),
    ).rejects.toThrow(
      'expense management policy requires an active operational ASSET account',
    );
  });
});
