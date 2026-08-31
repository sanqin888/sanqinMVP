import { Logger } from '@nestjs/common';
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
  afterEach(() => {
    jest.restoreAllMocks();
  });

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

  it('merges a patch and triple-writes dedicated, legacy compatibility, then transitional canonical storage in one transaction', async () => {
    const currentSettings = {
      ...settings,
      earnPtPerDollar: 0.01,
      tierThresholdSilver: 100000,
    };
    const brandConfigFindUnique = jest.fn().mockResolvedValue(currentSettings);
    const loyaltyProgramPolicyFindUnique = jest
      .fn()
      .mockResolvedValue(currentSettings);
    const loyaltyProgramPolicyUpdate = jest.fn().mockResolvedValue(settings);
    const businessConfigUpdate = jest.fn().mockResolvedValue({ id: 1 });
    const brandConfigUpdate = jest.fn().mockResolvedValue(settings);
    const tx = {
      loyaltyProgramPolicy: {
        findUnique: loyaltyProgramPolicyFindUnique,
        update: loyaltyProgramPolicyUpdate,
      },
      businessConfig: { update: businessConfigUpdate },
      brandConfig: {
        findUnique: brandConfigFindUnique,
        update: brandConfigUpdate,
      },
    };
    const transaction = jest
      .fn()
      .mockImplementation((callback: (client: typeof tx) => unknown) =>
        Promise.resolve(callback(tx)),
      );
    const prisma = {
      $transaction: transaction,
      brandConfig: { findUnique: jest.fn() },
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
    expect(brandConfigFindUnique).toHaveBeenCalledWith({
      where: { id: 1 },
      select: settingsSelect,
    });
    expect(loyaltyProgramPolicyFindUnique).toHaveBeenCalledWith({
      where: { id: 1 },
      select: settingsSelect,
    });
    expect(loyaltyProgramPolicyUpdate).toHaveBeenCalledWith({
      where: { id: 1 },
      data: settings,
    });
    expect(businessConfigUpdate).toHaveBeenCalledWith({
      where: { id: 1 },
      data: settings,
    });
    expect(brandConfigUpdate).toHaveBeenCalledWith({
      where: { id: 1 },
      data: settings,
      select: settingsSelect,
    });
    expect(loyaltyProgramPolicyUpdate.mock.invocationCallOrder[0]).toBeLessThan(
      businessConfigUpdate.mock.invocationCallOrder[0],
    );
    expect(businessConfigUpdate.mock.invocationCallOrder[0]).toBeLessThan(
      brandConfigUpdate.mock.invocationCallOrder[0],
    );
  });

  it('reads editable settings from BrandConfig while shadow-reading dedicated persistence', async () => {
    const brandConfigFindUnique = jest.fn().mockResolvedValue(settings);
    const loyaltyProgramPolicyFindUnique = jest.fn().mockResolvedValue(settings);
    const writer = new PrismaLoyaltyPolicyWriter({
      brandConfig: { findUnique: brandConfigFindUnique },
      loyaltyProgramPolicy: { findUnique: loyaltyProgramPolicyFindUnique },
    } as never);

    await expect(writer.getLoyaltyPolicySettings()).resolves.toEqual(settings);
    expect(brandConfigFindUnique).toHaveBeenCalledWith({
      where: { id: 1 },
      select: settingsSelect,
    });
    expect(loyaltyProgramPolicyFindUnique).toHaveBeenCalledWith({
      where: { id: 1 },
      select: settingsSelect,
    });
  });

  it('reports shadow mismatch without changing the BrandConfig settings result', async () => {
    const warn = jest.spyOn(Logger.prototype, 'warn').mockImplementation();
    const writer = new PrismaLoyaltyPolicyWriter({
      brandConfig: { findUnique: jest.fn().mockResolvedValue(settings) },
      loyaltyProgramPolicy: {
        findUnique: jest.fn().mockResolvedValue({
          ...settings,
          redeemDollarPerPoint: 0.75,
        }),
      },
    } as never);

    await expect(writer.getLoyaltyPolicySettings()).resolves.toEqual(settings);
    expect(warn).toHaveBeenCalledWith(
      expect.stringContaining('loyalty_policy_shadow_mismatch'),
    );
    expect(warn).toHaveBeenCalledWith(
      expect.stringContaining('redeemDollarPerPoint'),
    );
  });

  it('does not write for an empty patch and returns the current config value', async () => {
    const brandConfigFindUnique = jest.fn().mockResolvedValue(settings);
    const loyaltyProgramPolicyFindUnique = jest.fn().mockResolvedValue(settings);
    const transaction = jest.fn();
    const writer = new PrismaLoyaltyPolicyWriter({
      $transaction: transaction,
      brandConfig: { findUnique: brandConfigFindUnique },
      loyaltyProgramPolicy: { findUnique: loyaltyProgramPolicyFindUnique },
    } as never);

    await expect(writer.updateLoyaltyPolicy({})).resolves.toEqual(settings);
    expect(transaction).not.toHaveBeenCalled();
    expect(brandConfigFindUnique).toHaveBeenCalledWith({
      where: { id: 1 },
      select: settingsSelect,
    });
    expect(loyaltyProgramPolicyFindUnique).toHaveBeenCalledWith({
      where: { id: 1 },
      select: settingsSelect,
    });
  });

  it('fails instead of inventing defaults when canonical config is missing', async () => {
    const writer = new PrismaLoyaltyPolicyWriter({
      brandConfig: { findUnique: jest.fn().mockResolvedValue(null) },
      loyaltyProgramPolicy: { findUnique: jest.fn().mockResolvedValue(settings) },
    } as never);

    await expect(writer.updateLoyaltyPolicy({})).rejects.toThrow(
      'Loyalty policy config is not initialized',
    );
  });

  it('fails before compatibility writes when canonical config is missing for a patch', async () => {
    const loyaltyProgramPolicyUpdate = jest.fn();
    const businessConfigUpdate = jest.fn();
    const brandConfigUpdate = jest.fn();
    const tx = {
      loyaltyProgramPolicy: {
        findUnique: jest.fn(),
        update: loyaltyProgramPolicyUpdate,
      },
      businessConfig: { update: businessConfigUpdate },
      brandConfig: {
        findUnique: jest.fn().mockResolvedValue(null),
        update: brandConfigUpdate,
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
      writer.updateLoyaltyPolicy({ redeemDollarPerPoint: 1 }),
    ).rejects.toThrow('Loyalty policy config is not initialized');
    expect(loyaltyProgramPolicyUpdate).not.toHaveBeenCalled();
    expect(businessConfigUpdate).not.toHaveBeenCalled();
    expect(brandConfigUpdate).not.toHaveBeenCalled();
  });

  it('fails before any policy write when the dedicated singleton is missing', async () => {
    const loyaltyProgramPolicyUpdate = jest.fn();
    const businessConfigUpdate = jest.fn();
    const brandConfigUpdate = jest.fn();
    const tx = {
      loyaltyProgramPolicy: {
        findUnique: jest.fn().mockResolvedValue(null),
        update: loyaltyProgramPolicyUpdate,
      },
      businessConfig: { update: businessConfigUpdate },
      brandConfig: {
        findUnique: jest.fn().mockResolvedValue(settings),
        update: brandConfigUpdate,
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
    expect(businessConfigUpdate).not.toHaveBeenCalled();
    expect(brandConfigUpdate).not.toHaveBeenCalled();
  });
});
