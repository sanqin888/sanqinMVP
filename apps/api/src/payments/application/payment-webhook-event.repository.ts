import type { PaymentProviderWebhookNotification } from './payment-provider-webhook.port';

export type PaymentWebhookProcessingResult =
  | 'APPLIED'
  | 'NO_CHANGE'
  | 'UNKNOWN_PAYMENT'
  | 'DEFERRED'
  | 'CONFLICT';

export type CompletePaymentWebhookEventInput = {
  notification: PaymentProviderWebhookNotification;
  processingResult: PaymentWebhookProcessingResult;
  attemptId?: string | null;
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
