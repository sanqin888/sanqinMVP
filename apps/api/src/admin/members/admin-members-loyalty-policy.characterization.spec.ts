import { AdminMembersService } from './admin-members.service';

type AdminMembersPolicyTestSeam = {
  getTierThresholds(): Promise<{
    SILVER: number;
    GOLD: number;
    PLATINUM: number;
  }>;
};

describe('AdminMembersService loyalty policy characterization', () => {
  it(
    'reads tier progress thresholds through the Benefits policy boundary',
    async () => {
      const prisma = {};
      const loyaltyPolicyReader = {
        getLoyaltyPolicySnapshot: jest.fn().mockResolvedValue({
          earnPtPerDollar: 0.01,
          redeemDollarPerPoint: 1,
          referralPtPerDollar: 0.01,
          tierThresholdCents: {
            SILVER: 125000,
            GOLD: 950000,
            PLATINUM: 2750000,
          },
          tierMultipliers: {
            BRONZE: 1,
            SILVER: 2,
            GOLD: 3,
            PLATINUM: 5,
          },
        }),
      };
      const service = new AdminMembersService(
        prisma as never,
        {} as never,
        loyaltyPolicyReader as never,
        {} as never,
        {} as never,
        {} as never,
        {} as never,
      );

      await expect(
        (service as unknown as AdminMembersPolicyTestSeam).getTierThresholds(),
      ).resolves.toEqual({
        SILVER: 125000,
        GOLD: 950000,
        PLATINUM: 2750000,
      });
      expect(
        loyaltyPolicyReader.getLoyaltyPolicySnapshot,
      ).toHaveBeenCalledTimes(1);
      expect('businessConfig' in prisma).toBe(false);
    },
  );
});
