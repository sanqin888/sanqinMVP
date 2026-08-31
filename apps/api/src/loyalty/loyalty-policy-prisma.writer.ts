import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import type {
  LoyaltyPolicySettings,
  LoyaltyPolicyUpdateInput,
  LoyaltyPolicyWriterPort,
} from './loyalty-policy.contract';
import { normalizeLoyaltyPolicyUpdate } from './loyalty-policy';

const LOYALTY_POLICY_SETTINGS_SELECT = {
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
} as const;

function requireLoyaltyPolicySettings(
  settings: LoyaltyPolicySettings | null,
): LoyaltyPolicySettings {
  if (!settings) {
    throw new Error('Loyalty policy config is not initialized');
  }
  return settings;
}

@Injectable()
export class PrismaLoyaltyPolicyWriter implements LoyaltyPolicyWriterPort {
  constructor(private readonly prisma: PrismaService) {}

  // @compat benefits.business-config-loyalty-policy.v1
  async updateLoyaltyPolicy(
    input: LoyaltyPolicyUpdateInput,
  ): Promise<LoyaltyPolicySettings> {
    const patch = normalizeLoyaltyPolicyUpdate(input);
    if (Object.keys(patch).length === 0) {
      return requireLoyaltyPolicySettings(
        await this.prisma.brandConfig.findUnique({
          where: { id: 1 },
          select: LOYALTY_POLICY_SETTINGS_SELECT,
        }),
      );
    }

    return this.prisma.$transaction(async (tx) => {
      const current = requireLoyaltyPolicySettings(
        await tx.brandConfig.findUnique({
          where: { id: 1 },
          select: LOYALTY_POLICY_SETTINGS_SELECT,
        }),
      );
      const next: LoyaltyPolicySettings = { ...current, ...patch };

      // Keep the legacy copy synchronized until the one-way BusinessConfig
      // compatibility trigger is removed. Writing the complete canonical
      // settings prevents a stale legacy value from being replayed into
      // BrandConfig by a later unrelated BusinessConfig update.
      await tx.businessConfig.update({
        where: { id: 1 },
        data: next,
      });

      return tx.brandConfig.update({
        where: { id: 1 },
        data: next,
        select: LOYALTY_POLICY_SETTINGS_SELECT,
      });
    });
  }
}
