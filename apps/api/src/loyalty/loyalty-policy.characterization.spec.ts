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
      loyaltyProgramPolicy: {
        findUnique: jest.fn().mockResolvedValue(null),
      },
    };
    const service = new LoyaltyService(prisma as never, {} as never);

    await expect(service.getLoyaltyPolicySnapshot()).resolves.toEqual(
      DEFAULT_LOYALTY_POLICY,
    );
    expect('businessConfig' in prisma).toBe(false);
    expect('brandConfig' in prisma).toBe(false);
  });

  it('returns the dedicated LoyaltyProgramPolicy snapshot without a BrandConfig read', async () => {
    const dedicatedPolicy = {
      earnPtPerDollar: 0.02,
      redeemDollarPerPoint: 1,
      referralPtPerDollar: 0.01,
      tierMultiplierBronze: 1,
      tierMultiplierSilver: 2,
      tierMultiplierGold: 4,
      tierMultiplierPlatinum: 5,
      tierThresholdSilver: 100000,
      tierThresholdGold: 1000000,
      tierThresholdPlatinum: 3000000,
    };
    const prisma = {
      loyaltyProgramPolicy: {
        findUnique: jest.fn().mockResolvedValue(dedicatedPolicy),
      },
    };
    const service = new LoyaltyService(prisma as never, {} as never);

    await expect(service.getLoyaltyPolicySnapshot()).resolves.toEqual({
      earnPtPerDollar: 0.02,
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
        GOLD: 4,
        PLATINUM: 5,
      },
    });
    expect('businessConfig' in prisma).toBe(false);
    expect('brandConfig' in prisma).toBe(false);
  });

  it('reads committed Store Balance tender from the Loyalty ledger', async () => {
    const aggregate = jest.fn().mockResolvedValue({
      _sum: { deltaMicro: -15_990_000n },
    });
    const service = new LoyaltyService(
      { loyaltyLedger: { aggregate } } as never,
      {} as never,
    );

    await expect(
      service.getSettledBalancePaymentCentsForOrder('order-db-id'),
    ).resolves.toBe(1599);
    expect(aggregate).toHaveBeenCalledWith({
      where: {
        orderId: 'order-db-id',
        type: 'REDEEM_ON_ORDER',
        target: 'BALANCE',
        deltaMicro: { lt: 0n },
      },
      _sum: { deltaMicro: true },
    });
  });

  it('reads transaction policy only from dedicated persistence through the same tx', async () => {
    const persistedPolicy = {
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
    };
    const loyaltyProgramPolicyFindUnique = jest
      .fn()
      .mockResolvedValue(persistedPolicy);
    const tx = {
      loyaltyProgramPolicy: {
        findUnique: loyaltyProgramPolicyFindUnique,
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
    expect(loyaltyProgramPolicyFindUnique).toHaveBeenCalledWith({
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
    expect('brandConfig' in tx).toBe(false);
  });

  it('returns default transaction policy when dedicated persistence is missing', async () => {
    const tx = {
      loyaltyProgramPolicy: {
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
    expect('brandConfig' in tx).toBe(false);
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

  it('reads membership program rules from the dedicated Benefits policy snapshot', async () => {
    const membershipPolicy = {
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
    };
    const loyaltyProgramPolicyFindUnique = jest
      .fn()
      .mockResolvedValue(membershipPolicy);
    const prisma = {
      loyaltyProgramPolicy: {
        findUnique: loyaltyProgramPolicyFindUnique,
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

    expect(loyaltyProgramPolicyFindUnique).toHaveBeenCalled();
    expect('businessConfig' in prisma).toBe(false);
    expect('brandConfig' in prisma).toBe(false);
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
      loyaltyProgramPolicy: {
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

    expect(seenKeys).toEqual(
      new Set([
        `${orderId}:REDEEM_ON_ORDER:ORDER`,
        `${orderId}:REDEEM_ON_ORDER:PAYMENT_BALANCE`,
      ]),
    );
  });

  it('rolls back mixed points and store balance with distinct refund ledger identities', async () => {
    type LedgerTarget = 'POINTS' | 'BALANCE';
    type LedgerRow = {
      id: string;
      accountId: string;
      orderId: string;
      type: string;
      target: LedgerTarget;
      sourceKey: string;
      deltaMicro: bigint;
      balanceAfterMicro: bigint;
      note?: string;
    };
    type LedgerWhere = Partial<
      Pick<LedgerRow, 'orderId' | 'type' | 'target' | 'sourceKey'>
    >;
    type LedgerCreateArgs = {
      data: Omit<LedgerRow, 'id' | 'target'> & { target?: LedgerTarget };
    };
    type AccountState = {
      id: string;
      userId: string;
      pointsMicro: bigint;
      balanceMicro: bigint;
      tier: string;
      lifetimeSpendCents: number;
    };

    const orderId = '22222222-2222-4222-8222-222222222222';
    const account: AccountState = {
      id: '11111111-1111-4111-8111-111111111111',
      userId: 'member-db-id',
      pointsMicro: 40_400_000n,
      balanceMicro: 95_000_000n,
      tier: 'BRONZE',
      lifetimeSpendCents: 1500,
    };
    const ledgerRows: LedgerRow[] = [
      {
        id: 'redeem-points',
        accountId: account.id,
        orderId,
        type: 'REDEEM_ON_ORDER',
        target: 'POINTS',
        sourceKey: 'ORDER',
        deltaMicro: -10_000_000n,
        balanceAfterMicro: 40_000_000n,
      },
      {
        id: 'redeem-balance',
        accountId: account.id,
        orderId,
        type: 'REDEEM_ON_ORDER',
        target: 'BALANCE',
        sourceKey: 'PAYMENT_BALANCE',
        deltaMicro: -5_000_000n,
        balanceAfterMicro: 95_000_000n,
      },
      {
        id: 'earn',
        accountId: account.id,
        orderId,
        type: 'EARN_ON_PURCHASE',
        target: 'POINTS',
        sourceKey: 'ORDER',
        deltaMicro: 400_000n,
        balanceAfterMicro: 40_400_000n,
      },
    ];

    const matchesWhere = (row: LedgerRow, where: LedgerWhere) =>
      (where.orderId === undefined || row.orderId === where.orderId) &&
      (where.type === undefined || row.type === where.type) &&
      (where.target === undefined || row.target === where.target) &&
      (where.sourceKey === undefined || row.sourceKey === where.sourceKey);

    const ledgerFindUnique = jest.fn().mockImplementation(
      (args: {
        where: {
          orderId_type_sourceKey: {
            orderId: string;
            type: string;
            sourceKey: string;
          };
        };
      }) => {
        const key = args.where.orderId_type_sourceKey;
        return Promise.resolve(
          ledgerRows.find(
            (row) =>
              row.orderId === key.orderId &&
              row.type === key.type &&
              row.sourceKey === key.sourceKey,
          ) ?? null,
        );
      },
    );
    const ledgerFindFirst = jest
      .fn()
      .mockImplementation((args: { where: LedgerWhere }) =>
        Promise.resolve(
          ledgerRows.find((row) => matchesWhere(row, args.where)) ?? null,
        ),
      );
    const ledgerCreate = jest
      .fn()
      .mockImplementation((args: LedgerCreateArgs) => {
        const duplicate = ledgerRows.some(
          (row) =>
            row.orderId === args.data.orderId &&
            row.type === args.data.type &&
            row.sourceKey === args.data.sourceKey,
        );
        if (duplicate) {
          throw new Error(
            `duplicate loyalty ledger key: ${args.data.orderId}:${args.data.type}:${args.data.sourceKey}`,
          );
        }
        const row: LedgerRow = {
          id: `ledger-${ledgerRows.length + 1}`,
          ...args.data,
          target: args.data.target ?? 'POINTS',
        };
        ledgerRows.push(row);
        return Promise.resolve(row);
      });
    const accountUpdate = jest.fn().mockImplementation(
      (args: {
        data: {
          pointsMicro?: bigint;
          balanceMicro?: bigint;
          lifetimeSpendCents?: number;
          tier?: string;
        };
      }) => {
        if (args.data.pointsMicro !== undefined) {
          account.pointsMicro = args.data.pointsMicro;
        }
        if (args.data.balanceMicro !== undefined) {
          account.balanceMicro = args.data.balanceMicro;
        }
        if (args.data.lifetimeSpendCents !== undefined) {
          account.lifetimeSpendCents = args.data.lifetimeSpendCents;
        }
        if (args.data.tier !== undefined) {
          account.tier = args.data.tier;
        }
        return Promise.resolve({ ...account });
      },
    );
    const tx = {
      loyaltyAccount: {
        upsert: jest
          .fn()
          .mockImplementation(() => Promise.resolve({ ...account })),
        update: accountUpdate,
      },
      loyaltyLedger: {
        findUnique: ledgerFindUnique,
        findFirst: ledgerFindFirst,
        create: ledgerCreate,
      },
      $queryRaw: jest.fn().mockResolvedValue([{ id: account.id }]),
    };
    const prisma = {
      order: {
        findUnique: jest.fn().mockResolvedValue({
          userId: account.userId,
          subtotalCents: 3000,
          subtotalAfterDiscountCents: 2000,
          couponDiscountCents: 0,
          loyaltyRedeemCents: 1000,
        }),
      },
      loyaltyProgramPolicy: {
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
      $transaction: jest
        .fn()
        .mockImplementation((callback: (client: typeof tx) => Promise<void>) =>
          callback(tx),
        ),
    };
    const service = new LoyaltyService(prisma as never, {} as never);

    await expect(service.rollbackOnRefund(orderId)).resolves.toBeUndefined();

    expect(
      ledgerRows
        .filter((row) => row.type.startsWith('REFUND_'))
        .map((row) => `${row.type}:${row.target}:${row.sourceKey}`),
    ).toEqual([
      'REFUND_REVERSE_EARN:POINTS:FULL_REFUND',
      'REFUND_RETURN_REDEEM:POINTS:FULL_REFUND',
      'REFUND_RETURN_REDEEM:BALANCE:FULL_REFUND_BALANCE',
    ]);
    expect(account).toMatchObject({
      pointsMicro: 50_000_000n,
      balanceMicro: 100_000_000n,
      lifetimeSpendCents: 0,
      tier: 'BRONZE',
    });
    expect(ledgerFindFirst).toHaveBeenCalledWith({
      where: {
        orderId,
        type: 'REFUND_RETURN_REDEEM',
        target: 'BALANCE',
      },
    });

    const createCountAfterFirstRefund = ledgerCreate.mock.calls.length;
    await expect(service.rollbackOnRefund(orderId)).resolves.toBeUndefined();
    expect(ledgerCreate).toHaveBeenCalledTimes(createCountAfterFirstRefund);
    expect(account).toMatchObject({
      pointsMicro: 50_000_000n,
      balanceMicro: 100_000_000n,
      lifetimeSpendCents: 0,
    });
  });
});
