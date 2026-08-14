/** Removes credentials and customer PII before upstream details reach logs. */
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

/** Produces a bounded diagnostic representation of an Uber API response. */
export function summarizeUberDebugResponse(
  parsed: unknown,
  rawText: string,
): string {
  if (parsed && typeof parsed === 'object') {
    return JSON.stringify(parsed).slice(0, 500);
  }
  return rawText.slice(0, 500) || 'empty response body';
}
