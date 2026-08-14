<<<<<<< HEAD
export const UBER_WEBHOOK_WIRE_VERSION_V1 = 'v1' as const;

/** Uber-owned webhook envelope as it appears on the wire. */
export interface UberWebhookEnvelopePayloadV1 {
  event_type: string;
  resource_href: string;
  event_id?: string;
  id?: string;
  /** Older deliveries put resource_id at the root. */
  resource_id?: string;
  meta: { resource_id: string; user_id: string; [key: string]: unknown };
  [key: string]: unknown;
}
=======
/** Public contract aliases; parsing and validation live in the framework-free domain. */
export {
  parseUberWebhookEnvelopeV1,
  type UberWebhookEnvelopePayloadV1,
  type UberWebhookEventV1,
} from '../../domain/webhook/uber-webhook-envelope';
>>>>>>> origin/main
