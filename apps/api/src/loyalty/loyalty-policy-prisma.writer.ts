import { Injectable } from '@nestjs/common';
import { PrismaService } from './loyalty-prisma';
import type {
  LoyaltyPolicySettings,
  LoyaltyPolicySettingsReaderPort,
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
export class PrismaLoyaltyPolicyWriter
  implements LoyaltyPolicySettingsReaderPort, LoyaltyPolicyWriterPort
{
  constructor(private readonly prisma: PrismaService) {}

  async getLoyaltyPolicySettings(): Promise<LoyaltyPolicySettings> {
    const loyaltyProgramPolicy =
      await this.prisma.loyaltyProgramPolicy.findUnique({
        where: { id: 1 },
        select: LOYALTY_POLICY_SETTINGS_SELECT,
      });
    return requireLoyaltyPolicySettings(loyaltyProgramPolicy);
  }

  async updateLoyaltyPolicy(
    input: LoyaltyPolicyUpdateInput,
  ): Promise<LoyaltyPolicySettings> {
    const patch = normalizeLoyaltyPolicyUpdate(input);
    if (Object.keys(patch).length === 0) {
      return this.getLoyaltyPolicySettings();
    }

    return this.prisma.$transaction(async (tx) => {
      const loyaltyProgramPolicy = await tx.loyaltyProgramPolicy.findUnique({
        where: { id: 1 },
        select: LOYALTY_POLICY_SETTINGS_SELECT,
      });
      if (!loyaltyProgramPolicy) {
        throw new Error('LoyaltyProgramPolicy is not initialized');
      }
      const current = loyaltyProgramPolicy;

      const next: LoyaltyPolicySettings = { ...current, ...patch };

      const updatedPolicy = await tx.loyaltyProgramPolicy.update({
        where: { id: 1 },
        data: next,
        select: LOYALTY_POLICY_SETTINGS_SELECT,
      });

      return updatedPolicy;
    });
  }
}
