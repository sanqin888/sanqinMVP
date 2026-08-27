import { createHash, timingSafeEqual } from 'node:crypto';

import { Injectable } from '@nestjs/common';

import type {
  ParsePaymentProviderWebhookInput,
  PaymentProviderWebhookIngress,
  PaymentProviderWebhookIngressResult,
  PaymentProviderWebhookNotification,
  PaymentProviderWebhookOperation,
} from '../../../application/payment-provider-webhook.port';
import {
  PaymentWebhookAuthenticationError,
  PaymentWebhookConfigurationError,
  PaymentWebhookPayloadError,
} from '../../../application/payment-provider-webhook.port';
import { CloverProviderConfig } from '../clover-provider.config';

const asRecord = (value: unknown): Record<string, unknown> | null =>
  value && typeof value === 'object' && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;

const nonEmptyString = (value: unknown): string | null =>
  typeof value === 'string' && value.trim() ? value.trim() : null;

const eventOperation = (
  value: unknown,
): PaymentProviderWebhookOperation | null =>
  value === 'CREATE' || value === 'UPDATE' || value === 'DELETE' ? value : null;

const secureEquals = (left: string, right: string): boolean => {
  const leftBytes = Buffer.from(left, 'utf8');
  const rightBytes = Buffer.from(right, 'utf8');
  if (leftBytes.length !== rightBytes.length) return false;
  return timingSafeEqual(leftBytes, rightBytes);
};

const eventId = (parts: {
  appId: string;
  merchantId: string;
  objectId: string;
  operation: PaymentProviderWebhookOperation;
  timestampMs: number;
}): string => {
  const digest = createHash('sha256')
    .update(
      [
        parts.appId,
        parts.merchantId,
        parts.objectId,
        parts.operation,
        String(parts.timestampMs),
      ].join('\n'),
    )
    .digest('hex');
  return `clover_${digest}`;
};

@Injectable()
export class CloverPaymentWebhookIngressAdapter
  implements PaymentProviderWebhookIngress
{
  constructor(private readonly config: CloverProviderConfig) {}

  parseAndAuthenticate(
    input: ParsePaymentProviderWebhookInput,
  ): PaymentProviderWebhookIngressResult {
    const payload = asRecord(input.payload);
    if (!payload) {
      throw new PaymentWebhookPayloadError(
        'Clover webhook payload must be a JSON object.',
      );
    }

    const verificationCode = nonEmptyString(payload.verificationCode);
    if (verificationCode) {
      return { kind: 'VERIFICATION', verificationCode };
    }

    const expectedAuthCode = this.config.webhookAuthCode;
    if (!expectedAuthCode) {
      throw new PaymentWebhookConfigurationError(
        'CLOVER_WEBHOOK_AUTH_CODE is required before Clover event delivery can be accepted.',
      );
    }
    const suppliedAuthCode = input.authHeader?.trim();
    if (!suppliedAuthCode || !secureEquals(suppliedAuthCode, expectedAuthCode)) {
      throw new PaymentWebhookAuthenticationError();
    }

    const expectedMerchantId = this.config.merchantId;
    if (!expectedMerchantId) {
      throw new PaymentWebhookConfigurationError(
        'CLOVER_MERCHANT_ID is required before Clover event delivery can be accepted.',
      );
    }

    const appId = nonEmptyString(payload.appId);
    const merchants = asRecord(payload.merchants);
    if (!appId || !merchants) {
      throw new PaymentWebhookPayloadError(
        'Clover webhook events require appId and merchants.',
      );
    }

    const notifications: PaymentProviderWebhookNotification[] = [];
    for (const [merchantId, rawUpdates] of Object.entries(merchants)) {
      if (!Array.isArray(rawUpdates)) {
        throw new PaymentWebhookPayloadError(
          `Clover webhook merchant ${merchantId} updates must be an array.`,
        );
      }

      // The current Payments configuration is merchant-scoped. Ignore events
      // for other merchants instead of allowing one installation to mutate a
      // different merchant's payment state.
      if (merchantId !== expectedMerchantId) continue;

      for (const rawUpdate of rawUpdates) {
        const update = asRecord(rawUpdate);
        if (!update) {
          throw new PaymentWebhookPayloadError(
            `Clover webhook merchant ${merchantId} contains an invalid update.`,
          );
        }
        const objectId = nonEmptyString(update.objectId);
        const operation = eventOperation(update.type);
        const timestampMs = update.ts;
        const occurredAt =
          typeof timestampMs === 'number' ? new Date(timestampMs) : null;
        if (
          !objectId ||
          !operation ||
          typeof timestampMs !== 'number' ||
          !Number.isSafeInteger(timestampMs) ||
          timestampMs <= 0 ||
          !occurredAt ||
          Number.isNaN(occurredAt.getTime())
        ) {
          throw new PaymentWebhookPayloadError(
            `Clover webhook merchant ${merchantId} contains malformed event fields.`,
          );
        }

        // Clover's REST webhook event key for Payments is "P". Other event
        // categories can share the same callback URL and are intentionally
        // ignored by the Payments reverse-sync adapter.
        if (!objectId.startsWith('P:')) continue;
        const providerPaymentId = objectId.slice(2).trim();
        if (!providerPaymentId) {
          throw new PaymentWebhookPayloadError(
            'Clover payment webhook objectId is missing the payment identifier.',
          );
        }

        notifications.push({
          eventId: eventId({
            appId,
            merchantId,
            objectId,
            operation,
            timestampMs,
          }),
          provider: 'CLOVER',
          merchantId,
          providerPaymentId,
          operation,
          occurredAt,
        });
      }
    }

    return { kind: 'EVENTS', notifications };
  }
}
