import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import type {
  LoyaltyPolicySettings,
  LoyaltyPolicySettingsReaderPort,
  LoyaltyPolicyUpdateInput,
  LoyaltyPolicyWriterPort,
} from './loyalty-policy.contract';
import { compareLoyaltyPolicyPersistence } from './loyalty-policy-parity';
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
  private readonly logger = new Logger(PrismaLoyaltyPolicyWriter.name);

  constructor(private readonly prisma: PrismaService) {}

  private observeParity(
    context: string,
    brandConfig: LoyaltyPolicySettings | null,
    loyaltyProgramPolicy: LoyaltyPolicySettings | null,
  ): void {
    const differences = compareLoyaltyPolicyPersistence(
      brandConfig,
      loyaltyProgramPolicy,
    );
    if (differences.length === 0) return;

    this.logger.warn(
      JSON.stringify({
        event: 'loyalty_policy_shadow_mismatch',
        compatId: 'benefits.business-config-loyalty-policy.v1',
        context,
        differences,
      }),
    );
  }

  async getLoyaltyPolicySettings(): Promise<LoyaltyPolicySettings> {
    const brandConfig = await this.prisma.brandConfig.findUnique({
      where: { id: 1 },
      select: LOYALTY_POLICY_SETTINGS_SELECT,
    });
    const loyaltyProgramPolicy =
      await this.prisma.loyaltyProgramPolicy.findUnique({
        where: { id: 1 },
        select: LOYALTY_POLICY_SETTINGS_SELECT,
      });

    this.observeParity(
      'settings-read',
      brandConfig,
      loyaltyProgramPolicy,
    );
    return requireLoyaltyPolicySettings(brandConfig);
  }

  // @compat benefits.business-config-loyalty-policy.v1
  async updateLoyaltyPolicy(
    input: LoyaltyPolicyUpdateInput,
  ): Promise<LoyaltyPolicySettings> {
    const patch = normalizeLoyaltyPolicyUpdate(input);
    if (Object.keys(patch).length === 0) {
      return this.getLoyaltyPolicySettings();
    }

    return this.prisma.$transaction(async (tx) => {
      const current = requireLoyaltyPolicySettings(
        await tx.brandConfig.findUnique({
          where: { id: 1 },
          select: LOYALTY_POLICY_SETTINGS_SELECT,
        }),
      );
      const loyaltyProgramPolicy =
        await tx.loyaltyProgramPolicy.findUnique({
          where: { id: 1 },
          select: LOYALTY_POLICY_SETTINGS_SELECT,
        });
      this.observeParity('writer-pre-write', current, loyaltyProgramPolicy);
      if (!loyaltyProgramPolicy) {
        throw new Error('LoyaltyProgramPolicy is not initialized');
      }

      const next: LoyaltyPolicySettings = { ...current, ...patch };

      await tx.loyaltyProgramPolicy.update({
        where: { id: 1 },
        data: next,
      });

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
