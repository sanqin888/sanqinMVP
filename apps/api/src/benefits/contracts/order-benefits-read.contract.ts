export const ORDER_BENEFITS_READER = Symbol('ORDER_BENEFITS_READER');

export type OrderCouponBenefit = {
  couponStableId: string;
  code: string;
  title: string;
  discountCents: number;
  discountPercent: number | null;
  minSpendCents: number | null;
  expiresAt: string | null;
  unlockedItemStableIds: string[];
  stackingPolicy: 'EXCLUSIVE' | 'STACKABLE';
};

export type OrderAvailableTender = {
  /** Current spendable balance after active payment holds. */
  balanceCents: number;
  /** Current redeemable points value after active payment holds. */
  maxRedeemableCents: number;
};

export interface OrderBenefitsReaderPort {
  validateCouponForOrder(input: {
    userStableId?: string;
    couponStableId?: string;
  }): Promise<{ coupon: OrderCouponBenefit } | null>;
  getAvailablePaymentTender(
    userStableId: string,
  ): Promise<OrderAvailableTender>;
  /** Legacy loyalty-only eligibility uses raw account points, before payment holds. */
  getLoyaltyOnlyRedeemCapacityCents(userStableId: string): Promise<number>;
}
