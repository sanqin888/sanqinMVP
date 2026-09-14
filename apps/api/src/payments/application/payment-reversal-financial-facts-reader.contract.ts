export const PAYMENT_REVERSAL_FINANCIAL_FACTS_READER = Symbol(
  'PAYMENT_REVERSAL_FINANCIAL_FACTS_READER',
);

export type PaymentReversalFinancialProviderV1 = 'CLOVER' | 'MANUAL';
export type PaymentReversalFinancialSourceV1 =
  | 'POS_TERMINAL'
  | 'WEB_ECOMMERCE'
  | 'ADMIN'
  | 'PROVIDER_WEBHOOK'
  | 'RECONCILIATION';
export type PaymentReversalFinancialMethodV1 =
  | 'CASH'
  | 'CARD'
  | 'WECHAT_ALIPAY'
  | 'STORE_BALANCE'
  | 'UBEREATS';
export type PaymentReversalFinancialEvidenceV1 =
  | 'MANAGED_TRANSACTION'
  | 'PROVIDER_WEBHOOK';
export type PaymentReversalFinancialKindV1 =
  | 'PARTIAL_REFUND'
  | 'FULL_REFUND'
  | 'VOID';

/**
 * Canonical Payments-owned reversal money fact.
 *
 * `baseRefundCents` is always proven provider/base-tender money movement for
 * this one reversal fact. Additional-charge/customer-total refund fields stay
 * nullable when provider evidence cannot prove them (notably external webhook
 * reverse-sync observations). Accounting must fail closed rather than infer a
 * surcharge refund from the original charge.
 */
export type PaymentReversalFinancialFactV1 = {
  version: 1;
  factStableId: string;
  originalSaleAttemptId: string;
  reversalAttemptId: string | null;
  providerEventId: string | null;
  orderStableId: string | null;
  storeStableId: string | null;
  occurredAt: Date;
  evidence: PaymentReversalFinancialEvidenceV1;
  provider: PaymentReversalFinancialProviderV1;
  originalPaymentSource: PaymentReversalFinancialSourceV1;
  paymentMethod: PaymentReversalFinancialMethodV1;
  kind: PaymentReversalFinancialKindV1;
  originalSaleBaseAmountCents: number;
  originalSaleCustomerTotalCents: number | null;
  baseRefundCents: number;
  additionalChargeRefundCents: number | null;
  customerRefundTotalCents: number | null;
  currency: string;
  externalPaymentId: string | null;
  providerPaymentId: string;
  providerRefundId: string | null;
};

export type PaymentReversalFinancialFactsRangeV1 = {
  fromInclusive: Date;
  toExclusive: Date;
  storeStableId?: string;
};

export interface PaymentReversalFinancialFactsReaderPort {
  readReversalFactByStableId(
    factStableId: string,
  ): Promise<PaymentReversalFinancialFactV1 | null>;
  /** Stable Order-scoped batch read; matching must not depend on time proximity. */
  readReversalFactsByOrderStableIds(
    orderStableIds: string[],
  ): Promise<PaymentReversalFinancialFactV1[]>;
  readReversalFactsForRange(
    range: PaymentReversalFinancialFactsRangeV1,
  ): Promise<PaymentReversalFinancialFactV1[]>;
}
