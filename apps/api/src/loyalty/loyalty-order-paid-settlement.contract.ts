export const LOYALTY_ORDER_PAID_SETTLEMENT = Symbol(
  'LOYALTY_ORDER_PAID_SETTLEMENT',
);

export type LoyaltyOrderPaidSettlementInput = {
  orderStableId: string;
  subtotalCents: number;
  redeemValueCents: number;
  earnMultiplier: number;
};

export interface LoyaltyOrderPaidSettlementPort {
  settleOrderPaid(input: LoyaltyOrderPaidSettlementInput): Promise<void>;
}
