import { AccountingAccountClass } from './accounting-contracts';
import { AccountingChartService } from './accounting-chart.service';
import {
  CLOVER_FEE_PAYABLE_ACCOUNT_NAME,
  CLOVER_FEE_PAYABLE_ACCOUNT_STABLE_ID,
} from './accounting-provider-fee-clearing.contract';

describe('AccountingChartService provider fee clearing', () => {
  it('provisions the dedicated Clover fee payable account idempotently', async () => {
    const account = {
      accountStableId: CLOVER_FEE_PAYABLE_ACCOUNT_STABLE_ID,
      name: CLOVER_FEE_PAYABLE_ACCOUNT_NAME,
      type: null,
      accountClass: AccountingAccountClass.LIABILITY,
      currency: 'CAD',
      isActive: true,
    };
    const prisma = {
      accountingAccount: {
        upsert: jest.fn().mockResolvedValue(account),
        findUnique: jest.fn().mockResolvedValue(account),
      },
    };
    const service = new AccountingChartService(prisma as never);

    await expect(
      service.provisionProviderFeeClearingAccounts(),
    ).resolves.toEqual(account);

    expect(prisma.accountingAccount.upsert).toHaveBeenCalledWith({
      where: {
        accountStableId: CLOVER_FEE_PAYABLE_ACCOUNT_STABLE_ID,
      },
      create: account,
      update: {
        name: CLOVER_FEE_PAYABLE_ACCOUNT_NAME,
        type: null,
        accountClass: AccountingAccountClass.LIABILITY,
        currency: 'CAD',
        isActive: true,
      },
    });
  });
});
