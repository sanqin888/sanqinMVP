import type {
  LoyaltyPolicySnapshot,
  LoyaltyTier,
} from './loyalty-policy.contract';

export const DEFAULT_LOYALTY_POLICY: LoyaltyPolicySnapshot = {
  earnPtPerDollar: 0.01,
  redeemDollarPerPoint: 1,
  referralPtPerDollar: 0.01,
  tierThresholdCents: {
    SILVER: 1000 * 100,
    GOLD: 10000 * 100,
    PLATINUM: 30000 * 100,
  },
  tierMultipliers: {
    BRONZE: 1,
    SILVER: 2,
    GOLD: 3,
    PLATINUM: 5,
  },
};

type LoyaltyPolicySource = {
  earnPtPerDollar?: number | null;
  redeemDollarPerPoint?: number | null;
  referralPtPerDollar?: number | null;
  tierMultiplierBronze?: number | null;
  tierMultiplierSilver?: number | null;
  tierMultiplierGold?: number | null;
  tierMultiplierPlatinum?: number | null;
  tierThresholdSilver?: number | null;
  tierThresholdGold?: number | null;
  tierThresholdPlatinum?: number | null;
};

function finiteNonNegative(value: number | null | undefined, fallback: number) {
  return typeof value === 'number' && Number.isFinite(value) && value >= 0
    ? value
    : fallback;
}

function finitePositive(value: number | null | undefined, fallback: number) {
  return typeof value === 'number' && Number.isFinite(value) && value > 0
    ? value
    : fallback;
}

export function normalizeLoyaltyPolicy(
  source: LoyaltyPolicySource | null | undefined,
): LoyaltyPolicySnapshot {
  const tierMultipliers: Record<LoyaltyTier, number> = {
    BRONZE: finiteNonNegative(
      source?.tierMultiplierBronze,
      DEFAULT_LOYALTY_POLICY.tierMultipliers.BRONZE,
    ),
    SILVER: finiteNonNegative(
      source?.tierMultiplierSilver,
      DEFAULT_LOYALTY_POLICY.tierMultipliers.SILVER,
    ),
    GOLD: finiteNonNegative(
      source?.tierMultiplierGold,
      DEFAULT_LOYALTY_POLICY.tierMultipliers.GOLD,
    ),
    PLATINUM: finiteNonNegative(
      source?.tierMultiplierPlatinum,
      DEFAULT_LOYALTY_POLICY.tierMultipliers.PLATINUM,
    ),
  };

  return {
    earnPtPerDollar: finiteNonNegative(
      source?.earnPtPerDollar,
      DEFAULT_LOYALTY_POLICY.earnPtPerDollar,
    ),
    redeemDollarPerPoint: finitePositive(
      source?.redeemDollarPerPoint,
      DEFAULT_LOYALTY_POLICY.redeemDollarPerPoint,
    ),
    referralPtPerDollar: finiteNonNegative(
      source?.referralPtPerDollar,
      DEFAULT_LOYALTY_POLICY.referralPtPerDollar,
    ),
    tierThresholdCents: {
      SILVER: finiteNonNegative(
        source?.tierThresholdSilver,
        DEFAULT_LOYALTY_POLICY.tierThresholdCents.SILVER,
      ),
      GOLD: finiteNonNegative(
        source?.tierThresholdGold,
        DEFAULT_LOYALTY_POLICY.tierThresholdCents.GOLD,
      ),
      PLATINUM: finiteNonNegative(
        source?.tierThresholdPlatinum,
        DEFAULT_LOYALTY_POLICY.tierThresholdCents.PLATINUM,
      ),
    },
    tierMultipliers,
  };
}
