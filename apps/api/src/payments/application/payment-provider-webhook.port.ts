import type { PaymentProviderName } from '../domain/payment.types';

export type PaymentProviderWebhookOperation = 'CREATE' | 'UPDATE' | 'DELETE';

export type PaymentProviderWebhookNotification = {
  eventId: string;
  provider: PaymentProviderName;
  merchantId: string;
  providerPaymentId: string;
  operation: PaymentProviderWebhookOperation;
  occurredAt: Date;
};

export type PaymentProviderWebhookIngressResult =
  | {
      kind: 'VERIFICATION';
      verificationCode: string;
    }
  | {
      kind: 'EVENTS';
      notifications: PaymentProviderWebhookNotification[];
    };

export type ParsePaymentProviderWebhookInput = {
  authHeader?: string;
  payload: unknown;
};

export interface PaymentProviderWebhookIngress {
  parseAndAuthenticate(
    input: ParsePaymentProviderWebhookInput,
  ): PaymentProviderWebhookIngressResult;
}

export class PaymentWebhookAuthenticationError extends Error {
  constructor(message = 'Payment provider webhook authentication failed') {
    super(message);
    this.name = 'PaymentWebhookAuthenticationError';
  }
}

export class PaymentWebhookConfigurationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'PaymentWebhookConfigurationError';
  }
}

export class PaymentWebhookPayloadError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'PaymentWebhookPayloadError';
  }
}

export const PAYMENT_PROVIDER_WEBHOOK_INGRESS = Symbol(
  'PAYMENT_PROVIDER_WEBHOOK_INGRESS',
);
