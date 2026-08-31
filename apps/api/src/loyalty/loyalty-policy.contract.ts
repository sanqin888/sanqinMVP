export const LOYALTY_POLICY_READER = Symbol('LOYALTY_POLICY_READER');
export const LOYALTY_POLICY_SETTINGS_READER = Symbol(
  'LOYALTY_POLICY_SETTINGS_READER',
);
export const LOYALTY_POLICY_WRITER = Symbol('LOYALTY_POLICY_WRITER');

export type LoyaltyTier = 'BRONZE' | 'SILVER' | 'GOLD' | 'PLATINUM';

export type LoyaltyPolicySnapshot = {
  earnPtPerDollar: number;
  redeemDollarPerPoint: number;
  referralPtPerDollar: number;
  tierThresholdCents: Record<Exclude<LoyaltyTier, 'BRONZE'>, number>;
  tierMultipliers: Record<LoyaltyTier, number>;
};

export type LoyaltyPolicySettings = {
  earnPtPerDollar: number;
  redeemDollarPerPoint: number;
  referralPtPerDollar: number;
  tierMultiplierBronze: number;
  tierMultiplierSilver: number;
  tierMultiplierGold: number;
  tierMultiplierPlatinum: number;
  tierThresholdSilver: number;
  tierThresholdGold: number;
  tierThresholdPlatinum: number;
};

export type LoyaltyPolicyUpdateInput = {
  earnPtPerDollar?: unknown;
  redeemDollarPerPoint?: unknown;
  referralPtPerDollar?: unknown;
  tierMultiplierBronze?: unknown;
  tierMultiplierSilver?: unknown;
  tierMultiplierGold?: unknown;
  tierMultiplierPlatinum?: unknown;
  tierThresholdSilver?: unknown;
  tierThresholdGold?: unknown;
  tierThresholdPlatinum?: unknown;
};

export interface LoyaltyPolicyReaderPort {
  getLoyaltyPolicySnapshot(): Promise<LoyaltyPolicySnapshot>;
}

export interface LoyaltyPolicySettingsReaderPort {
  getLoyaltyPolicySettings(): Promise<LoyaltyPolicySettings>;
}

export interface LoyaltyPolicyWriterPort {
  updateLoyaltyPolicy(
    input: LoyaltyPolicyUpdateInput,
  ): Promise<LoyaltyPolicySettings>;
}
