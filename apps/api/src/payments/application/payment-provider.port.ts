import type {
  PaymentMethod,
  PaymentProviderOutcome,
  PaymentSource,
} from '../domain/payment.types';

export type StartPaymentRequest = {
  paymentId: string;
  amountCents: number;
  currency: string;
  paymentMethod: PaymentMethod;
  source: PaymentSource;
  idempotencyKey: string;
  externalPaymentId?: string | null;
};

export type GetPaymentStatusRequest = {
  paymentId: string;
  idempotencyKey: string;
  externalPaymentId?: string | null;
  providerPaymentId?: string | null;
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

export const PAYMENT_PROVIDER = Symbol('PAYMENT_PROVIDER');
