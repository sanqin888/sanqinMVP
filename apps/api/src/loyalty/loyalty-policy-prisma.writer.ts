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
    const loyaltyProgramPolicy =
      await this.prisma.loyaltyProgramPolicy.findUnique({
        where: { id: 1 },
        select: LOYALTY_POLICY_SETTINGS_SELECT,
      });
    const brandConfig = await this.prisma.brandConfig.findUnique({
      where: { id: 1 },
      select: LOYALTY_POLICY_SETTINGS_SELECT,
    });

    this.observeParity('settings-read', brandConfig, loyaltyProgramPolicy);
    return requireLoyaltyPolicySettings(loyaltyProgramPolicy);
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
      const loyaltyProgramPolicy = await tx.loyaltyProgramPolicy.findUnique({
        where: { id: 1 },
        select: LOYALTY_POLICY_SETTINGS_SELECT,
      });
      const brandConfig = await tx.brandConfig.findUnique({
        where: { id: 1 },
        select: LOYALTY_POLICY_SETTINGS_SELECT,
      });
      this.observeParity('writer-pre-write', brandConfig, loyaltyProgramPolicy);
      if (!loyaltyProgramPolicy) {
        throw new Error('LoyaltyProgramPolicy is not initialized');
      }
      if (!brandConfig) {
        throw new Error(
          'BrandConfig loyalty compatibility copy is not initialized',
        );
      }
      const current = loyaltyProgramPolicy;

      const next: LoyaltyPolicySettings = { ...current, ...patch };

      const updatedPolicy = await tx.loyaltyProgramPolicy.update({
        where: { id: 1 },
        data: next,
        select: LOYALTY_POLICY_SETTINGS_SELECT,
      });

      // Keep the legacy copies synchronized until the BusinessConfig trigger
      // has its Loyalty fields split out and both compatibility writers can be
      // contracted. The dedicated policy is the Phase C read/merge source.
      await tx.businessConfig.update({
        where: { id: 1 },
        data: next,
      });

      await tx.brandConfig.update({
        where: { id: 1 },
        data: next,
        select: LOYALTY_POLICY_SETTINGS_SELECT,
      });

      return updatedPolicy;
    });
  }
}
