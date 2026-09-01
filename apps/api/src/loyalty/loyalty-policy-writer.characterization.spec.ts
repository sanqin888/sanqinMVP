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

  it('merges a patch from dedicated persistence and triple-writes the rollback copies in one transaction', async () => {
    const warn = jest.spyOn(Logger.prototype, 'warn').mockImplementation();
    const dedicatedSettings = {
      ...settings,
      earnPtPerDollar: 0.01,
      tierThresholdSilver: 100000,
    };
    const brandCompatibilitySettings = {
      ...dedicatedSettings,
      referralPtPerDollar: 0.5,
    };
    const brandConfigFindUnique = jest
      .fn()
      .mockResolvedValue(brandCompatibilitySettings);
    const loyaltyProgramPolicyFindUnique = jest
      .fn()
      .mockResolvedValue(dedicatedSettings);
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

    expect(warn).toHaveBeenCalledWith(
      expect.stringContaining('loyalty_policy_shadow_mismatch'),
    );
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
      select: settingsSelect,
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

  it('reads editable settings from dedicated persistence while shadow-comparing BrandConfig', async () => {
    const brandConfigFindUnique = jest.fn().mockResolvedValue(settings);
    const loyaltyProgramPolicyFindUnique = jest
      .fn()
      .mockResolvedValue(settings);
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

  it('reports shadow mismatch without changing the dedicated settings result', async () => {
    const warn = jest.spyOn(Logger.prototype, 'warn').mockImplementation();
    const dedicatedSettings = {
      ...settings,
      redeemDollarPerPoint: 0.75,
    };
    const writer = new PrismaLoyaltyPolicyWriter({
      brandConfig: { findUnique: jest.fn().mockResolvedValue(settings) },
      loyaltyProgramPolicy: {
        findUnique: jest.fn().mockResolvedValue(dedicatedSettings),
      },
    } as never);

    await expect(writer.getLoyaltyPolicySettings()).resolves.toEqual(
      dedicatedSettings,
    );
    expect(warn).toHaveBeenCalledWith(
      expect.stringContaining('loyalty_policy_shadow_mismatch'),
    );
    expect(warn).toHaveBeenCalledWith(
      expect.stringContaining('redeemDollarPerPoint'),
    );
  });

  it('does not write for an empty patch and returns the dedicated policy value', async () => {
    const warn = jest.spyOn(Logger.prototype, 'warn').mockImplementation();
    const brandConfigFindUnique = jest.fn().mockResolvedValue({
      ...settings,
      referralPtPerDollar: 0.5,
    });
    const loyaltyProgramPolicyFindUnique = jest
      .fn()
      .mockResolvedValue(settings);
    const transaction = jest.fn();
    const writer = new PrismaLoyaltyPolicyWriter({
      $transaction: transaction,
      brandConfig: { findUnique: brandConfigFindUnique },
      loyaltyProgramPolicy: { findUnique: loyaltyProgramPolicyFindUnique },
    } as never);

    await expect(writer.updateLoyaltyPolicy({})).resolves.toEqual(settings);
    expect(warn).toHaveBeenCalledWith(
      expect.stringContaining('loyalty_policy_shadow_mismatch'),
    );
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

  it('fails instead of inventing editable settings when dedicated persistence is missing', async () => {
    jest.spyOn(Logger.prototype, 'warn').mockImplementation();
    const writer = new PrismaLoyaltyPolicyWriter({
      brandConfig: { findUnique: jest.fn().mockResolvedValue(settings) },
      loyaltyProgramPolicy: {
        findUnique: jest.fn().mockResolvedValue(null),
      },
    } as never);

    await expect(writer.updateLoyaltyPolicy({})).rejects.toThrow(
      'Loyalty policy config is not initialized',
    );
  });

  it('fails before compatibility writes when the BrandConfig rollback copy is missing', async () => {
    jest.spyOn(Logger.prototype, 'warn').mockImplementation();
    const loyaltyProgramPolicyUpdate = jest.fn();
    const businessConfigUpdate = jest.fn();
    const brandConfigUpdate = jest.fn();
    const tx = {
      loyaltyProgramPolicy: {
        findUnique: jest.fn().mockResolvedValue(settings),
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
    ).rejects.toThrow(
      'BrandConfig loyalty compatibility copy is not initialized',
    );
    expect(loyaltyProgramPolicyUpdate).not.toHaveBeenCalled();
    expect(businessConfigUpdate).not.toHaveBeenCalled();
    expect(brandConfigUpdate).not.toHaveBeenCalled();
  });

  it('fails before any policy write when the dedicated singleton is missing', async () => {
    jest.spyOn(Logger.prototype, 'warn').mockImplementation();
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
