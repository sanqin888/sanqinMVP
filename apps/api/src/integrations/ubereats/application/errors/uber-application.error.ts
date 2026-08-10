export type UberErrorCategory =
  | 'authentication'
  | 'validation'
  | 'business-conflict'
  | 'rate-limited'
  | 'transient-upstream'
  | 'non-retryable-upstream';

export interface UberApplicationErrorOptions {
  code: string;
  message: string;
  operation: string;
  retryAfterMs?: number | null;
  cause?: unknown;
}

/** Framework-free, deliberately safe error crossing domain/application boundaries. */
export class UberApplicationError extends Error {
  readonly retryAfterMs: number | null;

  constructor(
    readonly category: UberErrorCategory,
    readonly code: string,
    message: string,
    readonly operation: string,
    readonly retryable: boolean,
    options: { retryAfterMs?: number | null; cause?: unknown } = {},
  ) {
    super(
      message,
      options.cause === undefined ? undefined : { cause: options.cause },
    );
    this.name = 'UberApplicationError';
    this.retryAfterMs = options.retryAfterMs ?? null;
  }
}

const defineError = (category: UberErrorCategory, retryable: boolean) =>
  class extends UberApplicationError {
    constructor(options: UberApplicationErrorOptions) {
      super(
        category,
        options.code,
        options.message,
        options.operation,
        retryable,
        options,
      );
    }
  };

export class UberAuthenticationError extends defineError(
  'authentication',
  false,
) {}
export class UberValidationError extends defineError('validation', false) {}
export class UberBusinessConflictError extends defineError(
  'business-conflict',
  false,
) {}
export class UberRateLimitedError extends defineError('rate-limited', true) {}
export class UberTransientUpstreamError extends defineError(
  'transient-upstream',
  true,
) {}
export class UberNonRetryableUpstreamError extends defineError(
  'non-retryable-upstream',
  false,
) {}

export class UberOAuthStateError extends defineError('validation', false) {}
export class UberOAuthSessionMismatchError extends defineError(
  'authentication',
  false,
) {}
export class UberOAuthTemporaryError extends defineError(
  'transient-upstream',
  true,
) {}
export class UberOAuthTerminalError extends defineError(
  'non-retryable-upstream',
  false,
) {}

export function isUberApplicationError(
  error: unknown,
): error is UberApplicationError {
  return error instanceof UberApplicationError;
}
