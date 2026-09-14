import type { PaymentProviderWebhookNotification } from './payment-provider-webhook.port';

export type PaymentWebhookProcessingResult =
  | 'APPLIED'
  | 'NO_CHANGE'
  | 'UNKNOWN_PAYMENT'
  | 'DEFERRED'
  | 'CONFLICT';

export type PaymentWebhookExternalReversal =
  | 'NONE'
  | 'PARTIAL_REFUND'
  | 'FULL_REFUND'
  | 'VOID';

export const PAYMENT_PROVIDER_WEBHOOK_EVENT_SOURCE = 'payments.provider-webhook';
export const PAYMENT_REVERSE_SYNC_COMPLETED_EVENT =
  'payment.reverse-sync.completed';
export const paymentWebhookEventIdempotencyKey = (eventId: string): string =>
  `payment-webhook:${eventId}`;

export type CompletePaymentWebhookEventInput = {
  notification: PaymentProviderWebhookNotification;
  processingResult: PaymentWebhookProcessingResult;
  externalReversal: PaymentWebhookExternalReversal;
  previousRefundedAmountCents?: number | null;
  attemptId?: string | null;
  paymentSource?: string | null;
  paymentMethod?: string | null;
  currency?: string | null;
  externalPaymentId?: string | null;
  refundedAmountCents?: number | null;
  failureCode?: string | null;
  failureMessage?: string | null;
};

export interface PaymentWebhookEventRepository {
  isCompleted(eventId: string): Promise<boolean>;
  markCompleted(input: CompletePaymentWebhookEventInput): Promise<boolean>;
}

export const PAYMENT_WEBHOOK_EVENT_REPOSITORY = Symbol(
  'PAYMENT_WEBHOOK_EVENT_REPOSITORY',
);
