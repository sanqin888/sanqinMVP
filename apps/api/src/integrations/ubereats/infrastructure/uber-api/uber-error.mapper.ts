import { redactUberLogText } from '../../domain/shared/uber-integration.utils';

export function asObject(value: unknown): Record<string, unknown> | null {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}

export function readString(...values: unknown[]): string | null {
  for (const value of values) {
    if (typeof value === 'string' && value.trim()) return value.trim();
  }
  return null;
}

export function safeStructuredError(error: unknown): {
  code?: string;
  detail?: string;
  operation?: string;
} {
  const value = asObject(error);
  if (!value) return {};
  return {
    ...(typeof value.uberCode === 'string'
      ? { code: redactUberLogText(value.uberCode) }
      : {}),
    ...(typeof value.safeDetail === 'string'
      ? { detail: redactUberLogText(value.safeDetail) }
      : {}),
    ...(typeof value.operation === 'string'
      ? { operation: redactUberLogText(value.operation) }
      : {}),
  };
}

export function summarizeWebhookError(error: unknown): string {
  const structured = safeStructuredError(error);
  if (structured.code) {
    return redactUberLogText(
      `${structured.code}: ${structured.detail ?? 'Uber request failed'}`,
    ).slice(0, 500);
  }
  const candidate = asObject(error);
  const getResponse = candidate?.getResponse as
    | ((this: unknown) => unknown)
    | undefined;
  const response =
    typeof getResponse === 'function'
      ? (getResponse.call(error) as unknown)
      : null;
  const raw = response
    ? JSON.stringify(response)
    : error instanceof Error
      ? error.message
      : String(error);
  return redactUberLogText(raw).slice(0, 500);
}
