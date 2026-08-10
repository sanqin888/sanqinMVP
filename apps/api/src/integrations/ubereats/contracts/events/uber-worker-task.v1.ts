/** Durable inbox work item; deliberately does not expose the Uber wire DTO. */
export interface UberWebhookWorkerTaskV1 {
  version: 1;
  eventId: string;
  eventType: string;
  payload: unknown;
  leaseToken: string;
}
