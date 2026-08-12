import { randomUUID } from 'crypto';

export const UBER_PUBLIC_CONTRACT_VERSION = '2' as const;

export type UberOperationStatus = 'ACCEPTED' | 'SUCCEEDED' | 'FAILED';

export class UberFieldErrorResponse {
  field!: string;
  code!: string;
  message!: string;
}

/** The only error shape exposed by the Uber Eats admin API. */
export class UberPublicErrorResponse {
  code!: string;
  message!: string;
  retryable!: boolean;
  correlationId!: string;
  fieldErrors?: UberFieldErrorResponse[];
}

export class UberPageInfoResponse {
  limit!: number;
  count!: number;
  hasNextPage!: boolean;
  nextCursor!: string | null;
}

export class UberListResponse<T> {
  items!: T[];
  pageInfo!: UberPageInfoResponse;
  contractVersion!: typeof UBER_PUBLIC_CONTRACT_VERSION;
}

export class UberMutationResponse {
  operationId!: string;
  status!: UberOperationStatus;
  error!: UberPublicErrorResponse | null;
  contractVersion!: typeof UBER_PUBLIC_CONTRACT_VERSION;
}

export class UberHealthResponse {
  ok!: boolean;
}

export function toUberListResponse<T>(
  items: readonly T[],
  limit = items.length,
): UberListResponse<T> {
  return {
    items: [...items],
    pageInfo: {
      limit,
      count: items.length,
      hasNextPage: items.length === limit && limit > 0,
      nextCursor: null,
    },
    contractVersion: UBER_PUBLIC_CONTRACT_VERSION,
  };
}

export function toUberMutationResponse(
  status: UberOperationStatus = 'SUCCEEDED',
  operationId: string = randomUUID(),
): UberMutationResponse {
  return {
    operationId,
    status,
    error: null,
    contractVersion: UBER_PUBLIC_CONTRACT_VERSION,
  };
}

/**
 * Converts an internal failure to a deliberately lossy public error. Never pass
 * the upstream error, request payload, credentials, or stack to this function.
 */
export function toUberPublicError(
  code: string,
  message: string,
  retryable: boolean,
  correlationId: string = randomUUID(),
  fieldErrors?: UberFieldErrorResponse[],
): UberPublicErrorResponse {
  return {
    code,
    message,
    retryable,
    correlationId,
    ...(fieldErrors?.length ? { fieldErrors } : {}),
  };
}
