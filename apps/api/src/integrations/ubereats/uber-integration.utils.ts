/** An upstream webhook failure that callers should acknowledge without retrying. */
export class UberWebhookNonRetryableError extends Error {
  constructor(
    message: string,
    readonly status: number,
    readonly detail: string,
  ) {
    super(message);
    this.name = 'UberWebhookNonRetryableError';
  }
}

export function normalizeUberEventType(eventType: string): string {
  return eventType.trim().toLowerCase();
}

export function normalizeUberStoreId(storeId?: string): string {
  return storeId?.trim() || 'default';
}

export function redactUberLogText(text: string): string {
  return text
    .replace(/Bearer\s+[A-Za-z0-9._~+/=-]+/gi, 'Bearer [REDACTED]')
    .replace(
      /(authorization|token)(["']?\s*[:=]\s*["']?)[^"'&,}\s]+/gi,
      '$1$2[REDACTED]',
    )
    .replace(
      /(customer|eater)?_?(phone_number|formatted_address|address|phone|name)(["']?\s*[:=]\s*["']?)[^"',}]+/gi,
      '$1$2$3[REDACTED]',
    );
}

export function summarizeUberDebugResponse(
  parsed: unknown,
  rawText: string,
): string {
  if (parsed && typeof parsed === 'object') {
    return JSON.stringify(parsed).slice(0, 500);
  }
  return rawText.slice(0, 500) || 'empty response body';
}
