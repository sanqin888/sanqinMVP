/** Uber-owned wire representation. Keep snake_case fields at this boundary. */
export interface UberWebhookEnvelopePayloadV1 {
  event_type: string;
  resource_href: string;
  event_id?: string;
  id?: string;
  meta: { resource_id: string; user_id: string };
  [key: string]: unknown;
}

/** Normalized event consumed by the application and domain layers. */
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
  const root = asObject(payload);
  const meta = asObject(root?.meta);
  const eventType = read(root?.event_type);
  const resourceHref = read(root?.resource_href);
  // Older Uber deliveries put the order id at the root and the store id in
  // meta.resource_id; current deliveries use meta.resource_id/meta.user_id.
  const legacyResourceId = read(root?.resource_id);
  const resourceId = legacyResourceId ?? read(meta?.resource_id);
  const userId =
    read(meta?.user_id) ?? (legacyResourceId && read(meta?.resource_id));
  if (!eventType || !resourceHref || !resourceId || !userId) return null;
  return {
    version: 1,
    eventType,
    resourceHref,
    resourceId,
    userId,
    eventId: read(root?.event_id) ?? read(root?.id),
  };
}

function asObject(value: unknown): Record<string, unknown> | null {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}

function read(value: unknown): string | null {
  return typeof value === 'string' && value.trim() ? value.trim() : null;
}
