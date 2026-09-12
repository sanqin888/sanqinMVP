export const PAYMENT_FINANCIAL_FACTS_READER = Symbol(
  'PAYMENT_FINANCIAL_FACTS_READER',
);

export type PaymentFinancialProviderV1 = 'CLOVER' | 'MANUAL';
export type PaymentFinancialSourceV1 =
  | 'POS_TERMINAL'
  | 'WEB_ECOMMERCE'
  | 'ADMIN'
  | 'PROVIDER_WEBHOOK'
  | 'RECONCILIATION';
export type PaymentFinancialMethodV1 =
  | 'CASH'
  | 'CARD'
  | 'WECHAT_ALIPAY'
  | 'STORE_BALANCE'
  | 'UBEREATS';
export type PaymentFinancialOperationV1 = 'SALE' | 'REFUND' | 'VOID';

/**
 * Canonical Payments-owned final money observation.
 * Only SUCCEEDED transactions with an authoritative completedAt are exposed.
 */
export type PaymentFinancialFactV1 = {
  version: 1;
  /** Stable Payments attempt identity; never PaymentTransaction.id. */
  factStableId: string;
  attemptId: string;
  orderStableId: string | null;
  storeStableId: string | null;
  occurredAt: Date;
  sourceUpdatedAt: Date;
  provider: PaymentFinancialProviderV1;
  source: PaymentFinancialSourceV1;
  paymentMethod: PaymentFinancialMethodV1;
  operation: PaymentFinancialOperationV1;
  amountCents: number;
  surchargeCents: number | null;
  chargedTotalCents: number | null;
  refundedAmountCents: number;
  currency: string;
  externalPaymentId: string | null;
  providerPaymentId: string | null;
  providerRefundId: string | null;
};

export type PaymentFinancialFactsRangeV1 = {
  fromInclusive: Date;
  toExclusive: Date;
  storeStableId?: string;
};

export interface PaymentFinancialFactsReaderPort {
  readFactByAttemptId(attemptId: string): Promise<PaymentFinancialFactV1 | null>;
  readFactsForRange(
    range: PaymentFinancialFactsRangeV1,
  ): Promise<PaymentFinancialFactV1[]>;
}
