import { PosLoyaltyPolicyController } from './pos-summary.controller';

describe('PosLoyaltyPolicyController', () => {
  it('reads the runtime policy through the Benefits public reader', async () => {
    const snapshot = {
      earnPtPerDollar: 0.01,
      redeemDollarPerPoint: 1,
      referralPtPerDollar: 0.01,
      tierThresholdCents: {
        SILVER: 100000,
        GOLD: 1000000,
        PLATINUM: 3000000,
      },
      tierMultipliers: {
        BRONZE: 1,
        SILVER: 2,
        GOLD: 3,
        PLATINUM: 5,
      },
    };
    const reader = {
      getLoyaltyPolicySnapshot: jest.fn().mockResolvedValue(snapshot),
    };
    const controller = new PosLoyaltyPolicyController(reader as never);

    await expect(controller.getPolicy()).resolves.toEqual(snapshot);
    expect(reader.getLoyaltyPolicySnapshot).toHaveBeenCalledTimes(1);
  });
});
