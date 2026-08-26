export const PAYMENT_STATUSES = [
  'CREATED',
  'PROCESSING',
  'SUCCEEDED',
  'DECLINED',
  'CANCELLED',
  'UNKNOWN',
  'RECONCILING',
  'FAILED',
] as const;

export type PaymentStatus = (typeof PAYMENT_STATUSES)[number];

export const PAYMENT_OPERATIONS = ['SALE', 'REFUND', 'VOID'] as const;
export type PaymentOperation = (typeof PAYMENT_OPERATIONS)[number];

export const PAYMENT_PROVIDERS = ['CLOVER', 'MANUAL'] as const;
export type PaymentProviderName = (typeof PAYMENT_PROVIDERS)[number];

export const PAYMENT_SOURCES = [
  'POS_TERMINAL',
  'WEB_ECOMMERCE',
  'ADMIN',
  'PROVIDER_WEBHOOK',
  'RECONCILIATION',
] as const;
export type PaymentSource = (typeof PAYMENT_SOURCES)[number];

// Keep this classification independent from Order.PaymentMethod even where
// literal values currently overlap. Mapping across bounded contexts is explicit.
export const PAYMENT_METHODS = [
  'CASH',
  'CARD',
  'WECHAT_ALIPAY',
  'STORE_BALANCE',
  'UBEREATS',
] as const;
export type PaymentMethod = (typeof PAYMENT_METHODS)[number];

export type PaymentProviderTerminalFacts = {
  terminalId?: string | null;
  cardBrand?: string | null;
  cardLast4?: string | null;
};

export type PaymentProviderIdentifiers = {
  externalPaymentId?: string | null;
  providerPaymentId?: string | null;
  providerRefundId?: string | null;
  providerOrderId?: string | null;
};

export type PaymentProviderOutcome = PaymentProviderIdentifiers &
  PaymentProviderTerminalFacts & {
    status: Exclude<PaymentStatus, 'CREATED' | 'RECONCILING'>;
    chargedTotalCents?: number;
    surchargeCents?: number;
    refundedAmountCents?: number;
    resultCode?: string | null;
    failureCode?: string | null;
    failureMessage?: string | null;
  };

const parseClassification = <T extends string>(
  label: string,
  value: string,
  allowed: readonly T[],
): T => {
  const match = allowed.find((candidate) => candidate === value);
  if (!match) throw new Error(`Unknown ${label}: ${value}`);
  return match;
};

export const parsePaymentStatus = (value: string): PaymentStatus =>
  parseClassification('payment status', value, PAYMENT_STATUSES);

export const parsePaymentOperation = (value: string): PaymentOperation =>
  parseClassification('payment operation', value, PAYMENT_OPERATIONS);

export const parsePaymentProviderName = (value: string): PaymentProviderName =>
  parseClassification('payment provider', value, PAYMENT_PROVIDERS);

export const parsePaymentSource = (value: string): PaymentSource =>
  parseClassification('payment source', value, PAYMENT_SOURCES);

export const parsePaymentMethod = (value: string): PaymentMethod =>
  parseClassification('payment method', value, PAYMENT_METHODS);
