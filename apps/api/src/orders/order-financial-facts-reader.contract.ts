export const ORDER_FINANCIAL_FACTS_READER = Symbol(
  'ORDER_FINANCIAL_FACTS_READER',
);

export type OrderFinancialChannelV1 = 'web' | 'in_store' | 'ubereats';

export type OrderFinancialPaymentMethodV1 =
  | 'CASH'
  | 'CARD'
  | 'WECHAT_ALIPAY'
  | 'STORE_BALANCE'
  | 'UBEREATS';

export type OrderFinancialFactSourceEvidenceV1 =
  | 'IMMUTABLE_SALE_SNAPSHOT'
  | 'LEGACY_CURRENT_ORDER';

export type OrderFinancialPricingEvidenceV1 =
  | 'COMPLETE'
  | 'DAILY_SPECIAL_NOMINAL_UNKNOWN';

export type OrderFinancialDiscountsV1 = {
  /** Null when a legacy Daily Special order lacks immutable original-price evidence. */
  dailySpecialCents: number | null;
  couponCents: number;
  automaticPromotionCents: number;
  posManualCents: number;
  pointsRedemptionCents: number;
  unattributedLegacyCents: number;
  /** Null whenever one discount component is not reconstructible without guessing. */
  totalCents: number | null;
};

/**
 * Orders-owned monetary fact for one paid Order.
 *
 * New Orders freeze this fact durably at the sale boundary. Historical Orders that
 * predate that durable snapshot remain explicitly marked LEGACY_CURRENT_ORDER so a
 * later Accounting backfill cannot mistake a mutable post-amendment row for original
 * sale truth.
 *
 * This is deliberately not named a Revenue fact: some non-revenue business events
 * (for example Store Balance top-ups) historically created Order rows. Revenue policy
 * must classify this fact together with the owning Benefits / Payments facts rather
 * than assuming every Order is revenue.
 */
export type OrderFinancialFactV1 = {
  version: 1;
  /** Stable source identity for Journal/source-fact references. */
  factStableId: string;
  orderStableId: string;
  storeStableId: string | null;
  occurredAt: Date;
  sourceUpdatedAt: Date;
  sourceEvidence: OrderFinancialFactSourceEvidenceV1;
  channel: OrderFinancialChannelV1;
  paymentMethod: OrderFinancialPaymentMethodV1;
  itemQuantity: number;
  currency: 'CAD';
  pricingEvidence: OrderFinancialPricingEvidenceV1;
  /** Original/nominal item subtotal before Daily Special and other discounts. */
  nominalSubtotalCents: number | null;
  /** Persisted Order subtotal after Daily Special pricing, before other discounts. */
  effectiveSubtotalCents: number;
  discounts: OrderFinancialDiscountsV1;
  subtotalAfterDiscountCents: number;
  taxCents: number;
  deliveryRevenueCents: number;
  cardSurchargeCents: number;
  /** Customer order total excluding card surcharge. */
  orderTotalCents: number;
  /** Amount recorded as payable after card surcharge. */
  paymentTotalCents: number;
};

export type OrderFinancialFactsRangeV1 = {
  fromInclusive: Date;
  toExclusive: Date;
  storeStableId?: string;
};

export interface OrderFinancialFactsReaderPort {
  readFactByOrderStableId(
    orderStableId: string,
  ): Promise<OrderFinancialFactV1 | null>;
  readFactsForRange(
    range: OrderFinancialFactsRangeV1,
  ): Promise<OrderFinancialFactV1[]>;
}
