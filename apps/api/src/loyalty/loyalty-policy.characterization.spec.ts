import { LoyaltyService } from './loyalty.service';
import type { LoyaltyPolicySnapshot } from './loyalty-policy.contract';
import {
  DEFAULT_LOYALTY_POLICY,
  normalizeLoyaltyPolicy,
} from './loyalty-policy';

type LoyaltyTransactionalPolicyTestSeam = {
  getLoyaltyPolicySnapshotWithTx(tx: unknown): Promise<LoyaltyPolicySnapshot>;
};

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

  it('reads transaction policy from BrandConfig through tx', async () => {
    const brandConfigFindUnique = jest.fn().mockResolvedValue({
      earnPtPerDollar: 0.02,
      redeemDollarPerPoint: 0.75,
      referralPtPerDollar: 0.015,
      tierMultiplierBronze: 1,
      tierMultiplierSilver: 2,
      tierMultiplierGold: 3,
      tierMultiplierPlatinum: 5,
      tierThresholdSilver: 100000,
      tierThresholdGold: 1000000,
      tierThresholdPlatinum: 3000000,
    });
    const tx = {
      brandConfig: {
        findUnique: brandConfigFindUnique,
      },
    };
    const service = new LoyaltyService({} as never, {} as never);

    await expect(
      (
        service as unknown as LoyaltyTransactionalPolicyTestSeam
      ).getLoyaltyPolicySnapshotWithTx(tx),
    ).resolves.toEqual({
      earnPtPerDollar: 0.02,
      redeemDollarPerPoint: 0.75,
      referralPtPerDollar: 0.015,
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
    expect('businessConfig' in tx).toBe(false);
  });

  it('returns default transaction policy when transitional config is missing', async () => {
    const tx = {
      brandConfig: {
        findUnique: jest.fn().mockResolvedValue(null),
      },
    };
    const service = new LoyaltyService({} as never, {} as never);

    await expect(
      (
        service as unknown as LoyaltyTransactionalPolicyTestSeam
      ).getLoyaltyPolicySnapshotWithTx(tx),
    ).resolves.toEqual(DEFAULT_LOYALTY_POLICY);
    expect('businessConfig' in tx).toBe(false);
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

  it('keeps points and store balance redemption keys distinct for the same order', async () => {
    const seenKeys = new Set<string>();
    const ledgerCreate = jest.fn().mockImplementation(
      (args: {
        data: {
          orderId: string;
          type: string;
          sourceKey: string;
        };
      }) => {
        const key = `${args.data.orderId}:${args.data.type}:${args.data.sourceKey}`;
        if (seenKeys.has(key)) {
          throw new Error(`duplicate loyalty ledger key: ${key}`);
        }
        seenKeys.add(key);
        return Promise.resolve({ id: `ledger-${seenKeys.size}` });
      },
    );
    const account = {
      id: '11111111-1111-4111-8111-111111111111',
      userId: 'member-db-id',
      pointsMicro: 5_000_000n,
      balanceMicro: 20_000_000n,
      tier: 'BRONZE',
      lifetimeSpendCents: 0,
    };
    const tx = {
      brandConfig: {
        findUnique: jest.fn().mockResolvedValue({
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
        }),
      },
      loyaltyAccount: {
        upsert: jest.fn().mockResolvedValue(account),
        update: jest.fn().mockResolvedValue(account),
      },
      loyaltyLedger: {
        findUnique: jest.fn().mockResolvedValue(null),
        findFirst: jest.fn().mockResolvedValue(null),
        create: ledgerCreate,
      },
      loyaltyTenderReservation: {
        aggregate: jest.fn().mockResolvedValue({
          _sum: { pointsMicro: 0n, balanceMicro: 0n },
        }),
      },
      $queryRaw: jest.fn().mockResolvedValue([{ id: account.id }]),
    };
    const service = new LoyaltyService({} as never, {} as never);
    const orderId = '22222222-2222-4222-8222-222222222222';

    await expect(
      service.reserveRedeemForOrder({
        tx: tx as never,
        userId: account.userId,
        orderId,
        sourceKey: 'ORDER',
        requestedPoints: 1,
        subtotalAfterCoupon: 1000,
      }),
    ).resolves.toBe(100);

    await expect(
      service.deductBalanceForOrder({
        tx: tx as never,
        userId: account.userId,
        orderId,
        amountCents: 300,
      }),
    ).resolves.toBeUndefined();

    expect(ledgerCreate).toHaveBeenNthCalledWith(
      1,
      expect.objectContaining({
        data: expect.objectContaining({
          orderId,
          type: 'REDEEM_ON_ORDER',
          sourceKey: 'ORDER',
        }),
      }),
    );
    expect(ledgerCreate).toHaveBeenNthCalledWith(
      2,
      expect.objectContaining({
        data: expect.objectContaining({
          orderId,
          type: 'REDEEM_ON_ORDER',
          target: 'BALANCE',
          sourceKey: 'PAYMENT_BALANCE',
        }),
      }),
    );
    expect(seenKeys).toEqual(
      new Set([
        `${orderId}:REDEEM_ON_ORDER:ORDER`,
        `${orderId}:REDEEM_ON_ORDER:PAYMENT_BALANCE`,
      ]),
    );
  });
});
