import type { UberWebhookEnvelopePayloadV1 } from '../../contracts/events/uber-webhook-envelope.v1';
import type { UberWebhookHeaderValue } from './uber-webhook.types';

export type UberWebhookEnvelope = {
  eventType: string;
  resourceId: string | null;
  eventId: string | null;
};

export interface UberWebhookEventV1 {
  version: 1;
  eventType: string;
  resourceHref: string;
  resourceId: string;
  userId: string;
  eventId: string | null;
}

export function parseUberWebhookEnvelopeV1(
  payload: unknown,
): UberWebhookEventV1 | null {
  const root = object(payload);
  const meta = object(root?.meta);
  const eventType = text(root?.event_type);
  const resourceHref = text(root?.resource_href);
  const legacyResourceId = text(root?.resource_id);
  const resourceId = legacyResourceId ?? text(meta?.resource_id);
  const userId =
    text(meta?.user_id) ?? (legacyResourceId && text(meta?.resource_id));
  if (!eventType || !resourceHref || !resourceId || !userId) return null;
  return {
    version: 1,
    eventType,
    resourceHref,
    resourceId,
    userId,
    eventId: text(root?.event_id, root?.id),
  };
}

export class UberWebhookEnvelopeError extends Error {
  constructor(readonly reason: 'invalid-json' | 'invalid-envelope') {
    super(reason);
  }
}

/** Parses only the signed bytes; it is deliberately independent of any HTTP framework. */
export function parseUberWebhookEnvelope(rawBody: string | Uint8Array): {
  payload: unknown;
  envelope: UberWebhookEnvelope;
} {
  let payload: unknown;
  try {
    payload = JSON.parse(
      typeof rawBody === 'string' ? rawBody : new TextDecoder().decode(rawBody),
    );
  } catch {
    throw new UberWebhookEnvelopeError('invalid-json');
  }
  const contract = parseUberWebhookEnvelopeV1(payload);
  if (!contract) throw new UberWebhookEnvelopeError('invalid-envelope');
  return {
    payload,
    envelope: {
      eventType: contract.eventType,
      resourceId: contract.resourceId,
      eventId: contract.eventId,
    },
  };
}

/** Applies the documented header precedence before payload identifiers. */
export function resolveUberWebhookEventId(
  headers: Readonly<Record<string, UberWebhookHeaderValue>>,
  payload: unknown,
  envelopeEventId: string | null,
  stableFallback: string,
): string {
  for (const expected of [
    'x-request-id',
    'x-uber-request-id',
    'x-event-id',
    'uber-event-id',
  ]) {
    const value = Object.entries(headers).find(
      ([name]) => name.toLowerCase() === expected,
    )?.[1];
    const candidate = typeof value === 'string' ? value : value?.[0];
    if (typeof candidate === 'string' && candidate.trim())
      return candidate.trim();
  }
  const root = object(payload);
  return (
    envelopeEventId ??
    text(root?.event_id, root?.id, object(root?.data)?.id) ??
    stableFallback
  );
}

export function canonicalizeUberWebhookPayload(value: unknown): string {
  const normalize = (child: unknown): unknown =>
    Array.isArray(child)
      ? child.map(normalize)
      : child && typeof child === 'object'
        ? Object.fromEntries(
            Object.entries(child as Record<string, unknown>)
              .sort(([a], [b]) => a.localeCompare(b))
              .map(([key, nested]) => [key, normalize(nested)]),
          )
        : child;
  return JSON.stringify(normalize(value)) ?? 'null';
}

export const webhookObject = object;
export const webhookText = text;

function object(value: unknown): Record<string, unknown> | null {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}

function text(...values: unknown[]): string | null {
  for (const value of values)
    if (typeof value === 'string' && value.trim()) return value.trim();
  return null;
}
