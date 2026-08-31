import { BadRequestException } from '@nestjs/common';
import { LoyaltyPolicyValidationError } from '../../loyalty/public-api';
import { AdminLoyaltyPolicyController } from './admin-loyalty-policy.controller';

const settings = {
  earnPtPerDollar: 0.01,
  redeemDollarPerPoint: 1,
  referralPtPerDollar: 0.01,
  tierMultiplierBronze: 1,
  tierMultiplierSilver: 2,
  tierMultiplierGold: 3,
  tierMultiplierPlatinum: 5,
  tierThresholdSilver: 100000,
  tierThresholdGold: 1000000,
  tierThresholdPlatinum: 3000000,
};

describe('AdminLoyaltyPolicyController', () => {
  it('reads editable settings through the Benefits settings reader', async () => {
    const reader = {
      getLoyaltyPolicySettings: jest.fn().mockResolvedValue(settings),
    };
    const controller = new AdminLoyaltyPolicyController(
      reader as never,
      {} as never,
    );

    await expect(controller.getLoyaltyPolicy()).resolves.toEqual(settings);
    expect(reader.getLoyaltyPolicySettings).toHaveBeenCalledTimes(1);
  });

  it('delegates the policy patch to the Benefits writer', async () => {
    const writer = {
      updateLoyaltyPolicy: jest.fn().mockResolvedValue(settings),
    };
    const controller = new AdminLoyaltyPolicyController(
      {} as never,
      writer as never,
    );
    const patch = { earnPtPerDollar: 0.01 };

    await expect(controller.updateLoyaltyPolicy(patch)).resolves.toEqual(
      settings,
    );
    expect(writer.updateLoyaltyPolicy).toHaveBeenCalledWith(patch);
  });

  it('maps Benefits validation errors to a bad request response', async () => {
    const writer = {
      updateLoyaltyPolicy: jest
        .fn()
        .mockRejectedValue(
          new LoyaltyPolicyValidationError('earnPtPerDollar must be >= 0'),
        ),
    };
    const controller = new AdminLoyaltyPolicyController(
      {} as never,
      writer as never,
    );

    await expect(
      controller.updateLoyaltyPolicy({ earnPtPerDollar: -1 }),
    ).rejects.toBeInstanceOf(BadRequestException);
  });
});
