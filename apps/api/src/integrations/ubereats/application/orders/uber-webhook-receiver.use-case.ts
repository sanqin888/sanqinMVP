import { type UberTelemetryPort } from '../shared/uber-telemetry.port';
import type { UberWorkerWakePort } from '../shared/uber-worker-wake.port';
import { createHash } from 'crypto';
import {
  canonicalizeUberWebhookPayload,
  parseUberWebhookEnvelope,
  resolveUberWebhookEventId,
  UberWebhookEnvelopeError,
} from '../../domain/webhook/uber-webhook-envelope';
import type { UberWebhookInput } from '../../domain/webhook/uber-webhook.types';
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
    private readonly workerWake: UberWorkerWakePort,
  ) {}

  async execute(input: UberWebhookInput): Promise<void> {
    this.signatures.verify({
      version: 'hmac-sha256-hex-v1',
      headers: input.headers,
      rawBody: input.rawBody,
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
    this.workerWake.signal('webhookInbox');
    if (!inserted)
      this.telemetry.workflowLog('warn', 'duplicate webhook ignored');
  }
}
