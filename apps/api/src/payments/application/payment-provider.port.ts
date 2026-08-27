import type {
  PaymentMethod,
  PaymentOperation,
  PaymentProviderOutcome,
  PaymentSource,
} from '../domain/payment.types';

export type StartPaymentRequest = {
  paymentId: string;
  attemptId: string;
  amountCents: number;
  currency: string;
  paymentMethod: PaymentMethod;
  source: PaymentSource;
  idempotencyKey: string;
  externalPaymentId?: string | null;
  paymentInstrumentToken?: string | null;
  description?: string | null;
};

export type GetPaymentStatusRequest = {
  paymentId: string;
  attemptId: string;
  source: PaymentSource;
  idempotencyKey: string;
  operation?: PaymentOperation;
  externalPaymentId?: string | null;
  providerPaymentId?: string | null;
  providerRefundId?: string | null;
  amountCents?: number;
  currency?: string;
  expectedAdditionalChargeRefundCents?: number;
};

export type CancelPaymentRequest = GetPaymentStatusRequest;

export type VoidPaymentRequest = GetPaymentStatusRequest;

export type RefundPaymentRequest = GetPaymentStatusRequest & {
  amountCents: number;
};

export interface PaymentProvider {
  startPayment(request: StartPaymentRequest): Promise<PaymentProviderOutcome>;
  getPaymentStatus(
    request: GetPaymentStatusRequest,
  ): Promise<PaymentProviderOutcome>;
  cancelPayment(request: CancelPaymentRequest): Promise<PaymentProviderOutcome>;
  voidPayment(request: VoidPaymentRequest): Promise<PaymentProviderOutcome>;
  refundPayment(request: RefundPaymentRequest): Promise<PaymentProviderOutcome>;
}

export type PaymentTerminalAvailabilityState =
  | 'AVAILABLE'
  | 'BUSY'
  | 'UNAVAILABLE'
  | 'MISCONFIGURED'
  | 'UNKNOWN';

export type PaymentTerminalAvailability = {
  state: PaymentTerminalAvailabilityState;
  configured: boolean;
  available: boolean;
  terminalId?: string | null;
  providerState?: string | null;
  failureCode?: string | null;
  failureMessage?: string | null;
};

export interface PaymentTerminalProvider {
  getAvailability(): Promise<PaymentTerminalAvailability>;
}

export const PAYMENT_PROVIDER = Symbol('PAYMENT_PROVIDER');
export const PAYMENT_TERMINAL_PROVIDER = Symbol('PAYMENT_TERMINAL_PROVIDER');
