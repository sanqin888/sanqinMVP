/** Persistence contract, distinct from both external payloads and domain events. */
export interface UberWebhookInboxRecordV1<TJson = unknown> {
  version: 1;
  id: string;
  eventId: string;
  eventType: string;
  status: string;
  /** Redacted operator-facing explanation; never contains the raw payload. */
  errorSummary?: string | null;
  /** Machine-readable quarantine metadata, including error code and contract version. */
  structuredError?: TJson | null;
  businessVersion?: string;
  attemptCount: number;
  payload: TJson | null;
  receivedAt: Date;
  processedAt: Date | null;
}
