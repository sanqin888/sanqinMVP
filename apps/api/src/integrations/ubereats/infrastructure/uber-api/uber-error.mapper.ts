import { redactUberLogText } from '../shared/uber-log.utils';
import {
  UberApplicationError,
  UberAuthenticationError,
  UberBusinessConflictError,
  UberNonRetryableUpstreamError,
  UberRateLimitedError,
  UberTransientUpstreamError,
  UberValidationError,
} from '../../application/shared/uber-application.error';

/** Complete infrastructure-only failure vocabulary for Uber gateways. */
export type UberGatewayFailure =
  | {
      kind: 'transport';
      operation: string;
      code: 'UBER_NETWORK_ERROR';
      cause?: unknown;
    }
  | {
      kind: 'http';
      operation: string;
      status: number;
      upstreamCode: string | null;
      upstreamDetail?: string | null;
    }
  | {
      kind: 'mapping';
      operation: string;
      code: string;
      reason: string;
      cause?: unknown;
    };

/** The sole translation point from gateway failures to application errors. */
export function mapUberGatewayFailure(
  failure: UberGatewayFailure,
): UberApplicationError {
  if (failure.kind === 'transport')
    return new UberTransientUpstreamError({
      code: failure.code,
      message: 'Uber API 暂时不可用',
      operation: failure.operation,
      cause: failure.cause,
    });

  if (failure.kind === 'mapping')
    return new UberNonRetryableUpstreamError({
      code: failure.code,
      message: failure.reason,
      operation: failure.operation,
      cause: failure.cause,
    });

  const { status } = failure;
  const ErrorType =
    status === 401 || status === 403
      ? UberAuthenticationError
      : status === 429
        ? UberRateLimitedError
        : status === 408 || status >= 500
          ? UberTransientUpstreamError
          : status === 409 || status === 422
            ? UberBusinessConflictError
            : status >= 400 && status < 500
              ? UberValidationError
              : UberNonRetryableUpstreamError;
  const code =
    status === 401
      ? 'UBER_ACCESS_TOKEN_INVALID'
      : status === 403
        ? 'UBER_SCOPE_INSUFFICIENT'
        : failure.upstreamCode
          ? `UBER_${failure.upstreamCode.replace(/[^A-Za-z0-9]+/g, '_').toUpperCase()}`
          : `UBER_HTTP_${status}`;
  const upstreamDetail = failure.upstreamDetail
    ? redactUberLogText(failure.upstreamDetail).slice(0, 500)
    : null;
  return new ErrorType({
    code,
    message: 'Uber API 请求失败',
    operation: failure.operation,
    upstreamStatus: status,
    upstreamDetail,
  });
}

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
