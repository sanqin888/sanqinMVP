import { LoyaltyService } from './loyalty.service';
import {
  DEFAULT_LOYALTY_POLICY,
  normalizeLoyaltyPolicy,
} from './loyalty-policy';

describe('Loyalty policy characterization', () => {
  it('preserves the existing default policy when config is absent', () => {
    expect(normalizeLoyaltyPolicy(null)).toEqual(DEFAULT_LOYALTY_POLICY);
  });

  it('returns the default policy without creating legacy config on a missing row', async () => {
    const prisma = {
      brandConfig: {
        findUnique: jest.fn().mockResolvedValue(null),
      },
    };
    const service = new LoyaltyService(prisma as never, {} as never);

    await expect(service.getLoyaltyPolicySnapshot()).resolves.toEqual(
      DEFAULT_LOYALTY_POLICY,
    );
    expect('businessConfig' in prisma).toBe(false);
  });

  it('preserves existing normalization rules for invalid loyalty policy values', () => {
    expect(
      normalizeLoyaltyPolicy({
        earnPtPerDollar: -1,
        redeemDollarPerPoint: 0,
        referralPtPerDollar: Number.NaN,
        tierMultiplierBronze: -1,
        tierMultiplierSilver: 0,
        tierMultiplierGold: Number.POSITIVE_INFINITY,
        tierMultiplierPlatinum: 4.5,
        tierThresholdSilver: -1,
        tierThresholdGold: 0,
        tierThresholdPlatinum: Number.NaN,
      }),
    ).toEqual({
      earnPtPerDollar: 0.01,
      redeemDollarPerPoint: 1,
      referralPtPerDollar: 0.01,
      tierThresholdCents: {
        SILVER: 100000,
        GOLD: 0,
        PLATINUM: 3000000,
      },
      tierMultipliers: {
        BRONZE: 1,
        SILVER: 0,
        GOLD: 3,
        PLATINUM: 4.5,
      },
    });
  });

  it('reads membership program rules from the Benefits policy snapshot backed by BrandConfig', async () => {
    const brandConfigFindUnique = jest.fn().mockResolvedValue({
      earnPtPerDollar: 0.02,
      redeemDollarPerPoint: 0.5,
      referralPtPerDollar: 0.03,
      tierMultiplierBronze: 1,
      tierMultiplierSilver: 1.5,
      tierMultiplierGold: 2,
      tierMultiplierPlatinum: 4,
      tierThresholdSilver: 120000,
      tierThresholdGold: 900000,
      tierThresholdPlatinum: 2500000,
    });
    const prisma = {
      brandConfig: {
        findUnique: brandConfigFindUnique,
      },
    };
    const service = new LoyaltyService(prisma as never, {} as never);

    await expect(service.getMembershipProgramRules()).resolves.toEqual({
      earnPtPerDollar: 0.02,
      redeemDollarPerPoint: 0.5,
      referralPtPerDollar: 0.03,
      referralValueRatePercent: 1.5,
      tierRules: [
        {
          tier: 'BRONZE',
          thresholdCents: 0,
          multiplier: 1,
          earnPtPerDollar: 0.02,
          earnValueRatePercent: 1,
        },
        {
          tier: 'SILVER',
          thresholdCents: 120000,
          multiplier: 1.5,
          earnPtPerDollar: 0.03,
          earnValueRatePercent: 1.5,
        },
        {
          tier: 'GOLD',
          thresholdCents: 900000,
          multiplier: 2,
          earnPtPerDollar: 0.04,
          earnValueRatePercent: 2,
        },
        {
          tier: 'PLATINUM',
          thresholdCents: 2500000,
          multiplier: 4,
          earnPtPerDollar: 0.08,
          earnValueRatePercent: 4,
        },
      ],
    });

    expect(brandConfigFindUnique).toHaveBeenCalledWith({
      where: { id: 1 },
      select: {
        earnPtPerDollar: true,
        redeemDollarPerPoint: true,
        referralPtPerDollar: true,
        tierMultiplierBronze: true,
        tierMultiplierSilver: true,
        tierMultiplierGold: true,
        tierMultiplierPlatinum: true,
        tierThresholdSilver: true,
        tierThresholdGold: true,
        tierThresholdPlatinum: true,
      },
    });
    expect('businessConfig' in prisma).toBe(false);
  });
});
