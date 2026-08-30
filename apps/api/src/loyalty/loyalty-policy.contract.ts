export const LOYALTY_POLICY_READER = Symbol('LOYALTY_POLICY_READER');

export type LoyaltyTier = 'BRONZE' | 'SILVER' | 'GOLD' | 'PLATINUM';

export type LoyaltyPolicySnapshot = {
  earnPtPerDollar: number;
  redeemDollarPerPoint: number;
  referralPtPerDollar: number;
  tierThresholdCents: Record<Exclude<LoyaltyTier, 'BRONZE'>, number>;
  tierMultipliers: Record<LoyaltyTier, number>;
};

export interface LoyaltyPolicyReaderPort {
  getLoyaltyPolicySnapshot(): Promise<LoyaltyPolicySnapshot>;
}
