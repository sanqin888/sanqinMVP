import { BadRequestException } from '@nestjs/common';
import { AccountingFinancialProvider } from './accounting-contracts';
import { AccountingProviderPayoutController } from './accounting-provider-payout.controller';
import { AccountingProviderPayoutService } from './accounting-provider-payout.service';

function makeController() {
  const payouts = {
    listPayouts: jest.fn().mockResolvedValue([]),
    recordPayout: jest.fn().mockResolvedValue({ payoutStableId: 'payout_1' }),
  };
  const controller = new AccountingProviderPayoutController(
    payouts as unknown as AccountingProviderPayoutService,
  );
  return { controller, payouts };
}

describe('AccountingProviderPayoutController', () => {
  it('keeps history reads bounded and parses provider filters', async () => {
    const { controller, payouts } = makeController();

    await controller.listPayouts('uber_eats', ' 4750_Yonge_Street ', '50');

    expect(payouts.listPayouts).toHaveBeenCalledWith({
      provider: AccountingFinancialProvider.UBER_EATS,
      storeStableId: '4750_Yonge_Street',
      limit: 50,
    });
  });

  it('passes only the payout contract plus authenticated stable actor to the writer', async () => {
    const { controller, payouts } = makeController();

    await controller.recordPayout(
      {
        payoutStableId: 'payout_1',
        provider: 'CLOVER',
        storeStableId: '4750_Yonge_Street',
        payoutDate: '2026-09-23',
        destinationBankAccountStableId: 'account_primary_bank',
        amountCents: 12345,
        providerReference: 'clover-deposit-1',
      },
      { user: { userStableId: 'user_accountant_1' } } as never,
    );

    expect(payouts.recordPayout).toHaveBeenCalledWith(
      {
        payoutStableId: 'payout_1',
        provider: AccountingFinancialProvider.CLOVER,
        storeStableId: '4750_Yonge_Street',
        payoutDate: '2026-09-23',
        destinationBankAccountStableId: 'account_primary_bank',
        amountCents: 12345,
        currency: 'CAD',
        providerReference: 'clover-deposit-1',
      },
      'user_accountant_1',
    );
  });

  it('rejects a write without a provider before reaching the service', () => {
    const { controller, payouts } = makeController();

    expect(() =>
      controller.recordPayout(
        {
          payoutStableId: 'payout_1',
          storeStableId: '4750_Yonge_Street',
          payoutDate: '2026-09-23',
          destinationBankAccountStableId: 'account_primary_bank',
          amountCents: 12345,
        },
        { user: { userStableId: 'user_accountant_1' } } as never,
      ),
    ).toThrow(BadRequestException);
    expect(payouts.recordPayout).not.toHaveBeenCalled();
  });
});
