export const ORDER_SALES_ATTRIBUTION_READER = Symbol(
  'ORDER_SALES_ATTRIBUTION_READER',
);

export type OrderSalesAttributionChannelV1 =
  | 'web'
  | 'in_store'
  | 'ubereats';

export type OrderSalesAttributionPrimaryPaymentMethodV1 =
  | 'CASH'
  | 'CARD'
  | 'WECHAT_ALIPAY'
  | 'STORE_BALANCE'
  | 'UBEREATS';

export type OrderSalesAttributionSourceEvidenceV1 =
  | 'IMMUTABLE_SALE_SNAPSHOT'
  | 'IMMUTABLE_CHANGE_SNAPSHOT'
  | 'LEGACY_CURRENT_ORDER';

export type OrderSalesPrimaryPaymentMethodEvidenceV1 =
  | 'IMMUTABLE_SALE_SNAPSHOT'
  | 'LEGACY_CURRENT_ORDER';

/**
 * Orders-owned descriptive dimensions for one canonical Order financial source fact.
 *
 * This contract intentionally carries no monetary fields. Accounting owns the
 * financial amounts in Journal; Orders only supplies business attribution.
 */
export type OrderSalesAttributionV1 = {
  version: 1;
  sourceFactStableId: string;
  orderStableId: string;
  storeStableId: string | null;
  /** Descriptive owner timestamp; Accounting date bucketing remains Journal-owned. */
  occurredAt: Date;
  channel: OrderSalesAttributionChannelV1;
  /**
   * Revenue-attribution dimension inherited from the original SALE fact. A
   * change fact never reinterprets before/after monetary/tender state as revenue.
   */
  primaryPaymentMethod: OrderSalesAttributionPrimaryPaymentMethodV1;
  sourceEvidence: OrderSalesAttributionSourceEvidenceV1;
  primaryPaymentMethodEvidence: OrderSalesPrimaryPaymentMethodEvidenceV1;
};

export interface OrderSalesAttributionReaderPort {
  readBySourceFactStableIds(
    sourceFactStableIds: string[],
  ): Promise<OrderSalesAttributionV1[]>;
}
