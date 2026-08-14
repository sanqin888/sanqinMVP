<<<<<<< HEAD
import { type UberTelemetryPort } from '../shared/uber-telemetry.port';
import { createHash } from 'crypto';
=======
import { createHash } from 'crypto';
import { Inject, Injectable } from '@nestjs/common';
>>>>>>> origin/main
import {
  canonicalizeUberWebhookPayload,
  parseUberWebhookEnvelope,
  resolveUberWebhookEventId,
  UberWebhookEnvelopeError,
} from '../../domain/webhook/uber-webhook-envelope';
import type { UberWebhookInput } from '../../domain/webhook/uber-webhook.types';
<<<<<<< HEAD
import { normalizeUberEventType } from '../../domain/webhook/uber-event-type';
import {
  UberTransientUpstreamError,
  UberValidationError,
} from '../shared/uber-application.error';
import {
  type UberWebhookInboxPort,
  type UberWebhookSignatureVerifier,
} from './uber-order-processing.ports';

/** Signature verification, contract parsing and one atomic inbox insert. */
export class ReceiveUberWebhookUseCase {
  constructor(
    private readonly inbox: UberWebhookInboxPort,
    private readonly signatures: UberWebhookSignatureVerifier,
    private readonly telemetry: UberTelemetryPort,
  ) {}

  async execute(input: UberWebhookInput): Promise<void> {
    this.signatures.verify({
      version: 'hmac-sha256-hex-v1',
      headers: input.headers,
      rawBody: input.rawBody,
=======
import { normalizeUberEventType } from '../../domain/shared/uber-integration.utils';
import { UberValidationError } from '../errors/uber-application.error';
import {
  UBER_TELEMETRY_PORT,
  UBER_WEBHOOK_INBOX_PORT,
  UBER_WEBHOOK_SIGNATURE_VERIFIER,
  type UberTelemetryPort,
  type UberWebhookInboxPort,
  type UberWebhookSignatureVerifier,
} from '../ports/uber-order-processing.ports';

/** Signature verification, contract parsing and one atomic inbox insert. */
@Injectable()
export class ReceiveUberWebhookUseCase {
  constructor(
    @Inject(UBER_WEBHOOK_INBOX_PORT)
    private readonly inbox: UberWebhookInboxPort,
    @Inject(UBER_WEBHOOK_SIGNATURE_VERIFIER)
    private readonly signatures: UberWebhookSignatureVerifier,
    @Inject(UBER_TELEMETRY_PORT) private readonly telemetry: UberTelemetryPort,
  ) {}

  async execute(input: UberWebhookInput): Promise<void> {
    const bytes =
      typeof input.rawBody === 'string'
        ? new TextEncoder().encode(input.rawBody)
        : input.rawBody;
    this.signatures.verify({
      version: 'hmac-sha256-hex-v1',
      headers: input.headers,
      rawBody: bytes,
>>>>>>> origin/main
    });
    let parsed: ReturnType<typeof parseUberWebhookEnvelope>;
    try {
      parsed = parseUberWebhookEnvelope(input.rawBody);
    } catch (error) {
      const reason =
        error instanceof UberWebhookEnvelopeError
          ? error.reason
          : 'invalid-envelope';
      throw new UberValidationError({
        code:
          reason === 'invalid-json'
            ? 'UBER_WEBHOOK_JSON_INVALID'
            : 'UBER_WEBHOOK_ENVELOPE_INVALID',
        message:
          reason === 'invalid-json'
            ? 'Uber webhook JSON 无效'
            : 'Uber webhook envelope 无效',
        operation:
          reason === 'invalid-json'
            ? 'webhook.parse-json'
            : 'webhook.parse-envelope',
      });
    }
    const fallback = `sha256:${createHash('sha256').update(canonicalizeUberWebhookPayload(parsed.payload)).digest('hex')}`;
    const eventId = resolveUberWebhookEventId(
      input.headers,
      parsed.payload,
      parsed.envelope.eventId,
      fallback,
    );
    const normalized = normalizeUberEventType(parsed.envelope.eventType);
    const prefix = normalized.startsWith('orders.')
      ? 'order'
      : normalized.startsWith('menus.')
        ? 'menu'
        : normalized.startsWith('store.')
          ? 'store'
          : 'event';
<<<<<<< HEAD
    let inserted: boolean;
    try {
      inserted = await this.inbox.enqueue({
        eventId,
        eventType: parsed.envelope.eventType,
        externalOrderId: `${prefix}:${parsed.envelope.resourceId ?? eventId}`,
        payload: parsed.payload,
      });
    } catch (cause) {
      throw new UberTransientUpstreamError({
        code: 'UBER_WEBHOOK_INBOX_UNAVAILABLE',
        message: 'Uber webhook inbox 暂时不可用',
        operation: 'webhook.enqueue',
        cause,
      });
    }
=======
    const inserted = await this.inbox.enqueue({
      eventId,
      eventType: parsed.envelope.eventType,
      externalOrderId: `${prefix}:${parsed.envelope.resourceId ?? eventId}`,
      payload: parsed.payload,
    });
>>>>>>> origin/main
    if (!inserted)
      this.telemetry.workflowLog('warn', 'duplicate webhook ignored');
  }
}
