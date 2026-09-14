export const ORDER_FINANCIAL_CHANGE_FACTS_READER = Symbol(
  'ORDER_FINANCIAL_CHANGE_FACTS_READER',
);

export type OrderFinancialChangeKindV1 = 'ADJUSTMENT' | 'REVERSAL';
export type OrderFinancialChangeActionV1 =
  | 'RETENDER'
  | 'VOID_ITEM'
  | 'SWAP_ITEM'
  | 'ADDITIONAL_CHARGE'
  | 'FULL_REFUND'
  | 'EXTERNAL_CANCELLATION';
export type OrderFinancialChangeOccurrenceEvidenceV1 =
  | 'ORDER_CONFIRMATION'
  | 'PROVIDER_EVENT';
export type OrderFinancialChangePaymentMethodV1 =
  | 'CASH'
  | 'CARD'
  | 'WECHAT_ALIPAY'
  | 'STORE_BALANCE'
  | 'UBEREATS';
export type OrderFinancialChangeChannelV1 = 'web' | 'in_store' | 'ubereats';

/**
 * Orders-owned financial state at one side of a post-sale business change.
 *
 * `nominalSubtotalCents` / `salesDiscountCents` are nullable on purpose. Orders
 * never guesses historical Daily-Special nominal pricing while materializing a
 * change fact. The remaining persisted monetary state is still frozen so later
 * Accounting preview can fail closed instead of rereading a mutable Order row.
 */
export type OrderFinancialChangeStateV1 = {
  paymentMethod: OrderFinancialChangePaymentMethodV1;
  itemQuantity: number;
  nominalSubtotalCents: number | null;
  effectiveSubtotalCents: number;
  salesDiscountCents: number | null;
  subtotalAfterDiscountCents: number;
  taxCents: number;
  deliveryRevenueCents: number;
  cardSurchargeCents: number;
  orderTotalCents: number;
  paymentTotalCents: number;
};

/**
 * Orders-owned settlement declaration for the business change.
 *
 * This is not provider-money truth. CARD/Store-Balance allocation must later be
 * corroborated with Payments/Loyalty owner facts before Accounting posts. The
 * purpose here is to preserve the operator/provider-declared tender semantics
 * that were previously lost for some post-sale mutations.
 */
export type OrderFinancialChangeSettlementV1 = {
  previousOrderPaymentMethod: OrderFinancialChangePaymentMethodV1;
  resultingOrderPaymentMethod: OrderFinancialChangePaymentMethodV1;
  declaredSettlementPaymentMethod: OrderFinancialChangePaymentMethodV1 | null;
  /**
   * Orders amendment/refund gross value under the existing business contract.
   * Provider-side surcharge reversal can be additional money truth and is not
   * inferred here.
   */
  refundGrossCents: number;
  /** Portion of refundGrossCents restored as redeemed-points value. */
  redeemReturnCents: number;
  additionalChargeCents: number;
};

export type OrderFinancialChangeFactV1 = {
  version: 1;
  factStableId: string;
  orderStableId: string;
  storeStableId: string | null;
  occurredAt: Date;
  kind: OrderFinancialChangeKindV1;
  action: OrderFinancialChangeActionV1;
  occurrenceEvidence: OrderFinancialChangeOccurrenceEvidenceV1;
  channel: OrderFinancialChangeChannelV1;
  currency: 'CAD';
  before: OrderFinancialChangeStateV1;
  after: OrderFinancialChangeStateV1;
  settlement: OrderFinancialChangeSettlementV1;
};

export type OrderFinancialChangeFactsRangeV1 = {
  fromInclusive: Date;
  toExclusive: Date;
  storeStableId?: string;
};

export interface OrderFinancialChangeFactsReaderPort {
  readFactByStableId(
    factStableId: string,
  ): Promise<OrderFinancialChangeFactV1 | null>;
  readFactsByOrderStableId(
    orderStableId: string,
  ): Promise<OrderFinancialChangeFactV1[]>;
  readFactsByOrderStableIds(
    orderStableIds: string[],
  ): Promise<OrderFinancialChangeFactV1[]>;
  readFactsForRange(
    range: OrderFinancialChangeFactsRangeV1,
  ): Promise<OrderFinancialChangeFactV1[]>;
}
