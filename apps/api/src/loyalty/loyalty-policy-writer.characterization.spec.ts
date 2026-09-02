import type { LoyaltyPolicyUpdateInput } from './loyalty-policy.contract';
import { PrismaLoyaltyPolicyWriter } from './loyalty-policy-prisma.writer';
import {
  LoyaltyPolicyValidationError,
  normalizeLoyaltyPolicyUpdate,
} from './loyalty-policy';

const settings = {
  earnPtPerDollar: 0.0123,
  redeemDollarPerPoint: 1,
  referralPtPerDollar: 0.02,
  tierMultiplierBronze: 1,
  tierMultiplierSilver: 2,
  tierMultiplierGold: 3,
  tierMultiplierPlatinum: 5,
  tierThresholdSilver: 100001,
  tierThresholdGold: 1000000,
  tierThresholdPlatinum: 3000000,
};

const settingsSelect = {
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
};

describe('Loyalty policy writer characterization', () => {
  it('preserves admin rounding while keeping redeem value strictly positive', () => {
    expect(
      normalizeLoyaltyPolicyUpdate({
        earnPtPerDollar: 0.012345,
        redeemDollarPerPoint: 1,
        tierMultiplierSilver: 2.34567,
        tierThresholdSilver: 100000.6,
      }),
    ).toEqual({
      earnPtPerDollar: 0.0123,
      redeemDollarPerPoint: 1,
      tierMultiplierSilver: 2.3457,
      tierThresholdSilver: 100001,
    });
  });

  it.each([
    ['earnPtPerDollar', -0.01, 'earnPtPerDollar must be >= 0'],
    ['redeemDollarPerPoint', 0, 'redeemDollarPerPoint must be > 0'],
    [
      'tierMultiplierGold',
      Number.NaN,
      'tierMultiplierGold must be a finite number',
    ],
    ['tierThresholdGold', -1, 'tierThresholdGold must be >= 0'],
  ] as const)('rejects invalid %s values', (field, value, message) => {
    expect(() =>
      normalizeLoyaltyPolicyUpdate({
        [field]: value,
      } as LoyaltyPolicyUpdateInput),
    ).toThrow(new LoyaltyPolicyValidationError(message));
  });

  it('merges a patch from dedicated persistence and writes only LoyaltyProgramPolicy in one transaction', async () => {
    const dedicatedSettings = {
      ...settings,
      earnPtPerDollar: 0.01,
      tierThresholdSilver: 100000,
    };
    const loyaltyProgramPolicyFindUnique = jest
      .fn()
      .mockResolvedValue(dedicatedSettings);
    const loyaltyProgramPolicyUpdate = jest.fn().mockResolvedValue(settings);
    const tx = {
      loyaltyProgramPolicy: {
        findUnique: loyaltyProgramPolicyFindUnique,
        update: loyaltyProgramPolicyUpdate,
      },
    };
    const transaction = jest
      .fn()
      .mockImplementation((callback: (client: typeof tx) => unknown) =>
        Promise.resolve(callback(tx)),
      );
    const prisma = {
      $transaction: transaction,
      loyaltyProgramPolicy: { findUnique: jest.fn() },
    };
    const writer = new PrismaLoyaltyPolicyWriter(prisma as never);

    await expect(
      writer.updateLoyaltyPolicy({
        earnPtPerDollar: 0.012345,
        redeemDollarPerPoint: 1,
        tierThresholdSilver: 100000.6,
      }),
    ).resolves.toEqual(settings);

    expect(transaction).toHaveBeenCalledTimes(1);
    expect(loyaltyProgramPolicyFindUnique).toHaveBeenCalledWith({
      where: { id: 1 },
      select: settingsSelect,
    });
    expect(loyaltyProgramPolicyUpdate).toHaveBeenCalledWith({
      where: { id: 1 },
      data: settings,
      select: settingsSelect,
    });
    expect('businessConfig' in tx).toBe(false);
    expect('brandConfig' in tx).toBe(false);
  });

  it('reads editable settings only from dedicated persistence', async () => {
    const loyaltyProgramPolicyFindUnique = jest
      .fn()
      .mockResolvedValue(settings);
    const prisma = {
      loyaltyProgramPolicy: { findUnique: loyaltyProgramPolicyFindUnique },
    };
    const writer = new PrismaLoyaltyPolicyWriter(prisma as never);

    await expect(writer.getLoyaltyPolicySettings()).resolves.toEqual(settings);
    expect(loyaltyProgramPolicyFindUnique).toHaveBeenCalledWith({
      where: { id: 1 },
      select: settingsSelect,
    });
    expect('businessConfig' in prisma).toBe(false);
    expect('brandConfig' in prisma).toBe(false);
  });

  it('does not write for an empty patch and returns the dedicated policy value', async () => {
    const loyaltyProgramPolicyFindUnique = jest
      .fn()
      .mockResolvedValue(settings);
    const transaction = jest.fn();
    const prisma = {
      $transaction: transaction,
      loyaltyProgramPolicy: { findUnique: loyaltyProgramPolicyFindUnique },
    };
    const writer = new PrismaLoyaltyPolicyWriter(prisma as never);

    await expect(writer.updateLoyaltyPolicy({})).resolves.toEqual(settings);
    expect(transaction).not.toHaveBeenCalled();
    expect(loyaltyProgramPolicyFindUnique).toHaveBeenCalledWith({
      where: { id: 1 },
      select: settingsSelect,
    });
    expect('businessConfig' in prisma).toBe(false);
    expect('brandConfig' in prisma).toBe(false);
  });

  it('fails instead of inventing editable settings when dedicated persistence is missing', async () => {
    const writer = new PrismaLoyaltyPolicyWriter({
      loyaltyProgramPolicy: {
        findUnique: jest.fn().mockResolvedValue(null),
      },
    } as never);

    await expect(writer.updateLoyaltyPolicy({})).rejects.toThrow(
      'Loyalty policy config is not initialized',
    );
  });

  it('fails before any policy write when the dedicated singleton is missing', async () => {
    const loyaltyProgramPolicyUpdate = jest.fn();
    const tx = {
      loyaltyProgramPolicy: {
        findUnique: jest.fn().mockResolvedValue(null),
        update: loyaltyProgramPolicyUpdate,
      },
    };
    const transaction = jest
      .fn()
      .mockImplementation((callback: (client: typeof tx) => unknown) =>
        Promise.resolve(callback(tx)),
      );
    const writer = new PrismaLoyaltyPolicyWriter({
      $transaction: transaction,
    } as never);

    await expect(
      writer.updateLoyaltyPolicy({ earnPtPerDollar: 0.02 }),
    ).rejects.toThrow('LoyaltyProgramPolicy is not initialized');
    expect(loyaltyProgramPolicyUpdate).not.toHaveBeenCalled();
    expect('businessConfig' in tx).toBe(false);
    expect('brandConfig' in tx).toBe(false);
  });
});
