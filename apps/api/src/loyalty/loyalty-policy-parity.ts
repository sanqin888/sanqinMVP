import type { LoyaltyPolicySettings } from './loyalty-policy.contract';

const LOYALTY_POLICY_SETTING_FIELDS = [
  'earnPtPerDollar',
  'redeemDollarPerPoint',
  'referralPtPerDollar',
  'tierMultiplierBronze',
  'tierMultiplierSilver',
  'tierMultiplierGold',
  'tierMultiplierPlatinum',
  'tierThresholdSilver',
  'tierThresholdGold',
  'tierThresholdPlatinum',
] as const satisfies ReadonlyArray<keyof LoyaltyPolicySettings>;

export type LoyaltyPolicyParityDifference =
  | {
      kind: 'missing';
      source: 'brandConfig' | 'loyaltyProgramPolicy';
    }
  | {
      kind: 'field';
      field: keyof LoyaltyPolicySettings;
      brandConfig: number;
      loyaltyProgramPolicy: number;
    };

export function compareLoyaltyPolicyPersistence(
  brandConfig: LoyaltyPolicySettings | null,
  loyaltyProgramPolicy: LoyaltyPolicySettings | null,
): LoyaltyPolicyParityDifference[] {
  if (!brandConfig || !loyaltyProgramPolicy) {
    const missing: LoyaltyPolicyParityDifference[] = [];
    if (!brandConfig) {
      missing.push({ kind: 'missing', source: 'brandConfig' });
    }
    if (!loyaltyProgramPolicy) {
      missing.push({ kind: 'missing', source: 'loyaltyProgramPolicy' });
    }
    return missing;
  }

  const differences: LoyaltyPolicyParityDifference[] = [];
  for (const field of LOYALTY_POLICY_SETTING_FIELDS) {
    if (brandConfig[field] === loyaltyProgramPolicy[field]) continue;
    differences.push({
      kind: 'field',
      field,
      brandConfig: brandConfig[field],
      loyaltyProgramPolicy: loyaltyProgramPolicy[field],
    });
  }
  return differences;
}
