export type UberWebhookInput = {
  headers: Record<string, unknown>;
  /** @deprecated The service always parses the signed rawBody instead. */
  body?: unknown;
  rawBody: string | Buffer;
};
