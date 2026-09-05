export const LOYALTY_ORDER_USAGE_READER = Symbol('LOYALTY_ORDER_USAGE_READER');

export type LoyaltyOrderUsageReadResult = {
  balancePaidCents: number;
  pointsEarned: number;
};

export interface LoyaltyOrderUsageReaderPort {
  getOrderUsage(input: {
    orderStableId: string;
  }): Promise<LoyaltyOrderUsageReadResult>;
}
