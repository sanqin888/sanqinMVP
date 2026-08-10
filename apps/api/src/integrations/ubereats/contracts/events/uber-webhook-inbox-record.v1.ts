/** Persistence contract, distinct from both external payloads and domain events. */
export interface UberWebhookInboxRecordV1<TJson = unknown> {
  version: 1;
  id: string;
  eventId: string;
  eventType: string;
  status: string;
  attemptCount: number;
  payload: TJson | null;
  receivedAt: Date;
  processedAt: Date | null;
}
