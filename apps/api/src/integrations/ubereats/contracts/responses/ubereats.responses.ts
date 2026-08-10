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
  operationId = randomUUID(),
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
  correlationId = randomUUID(),
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

export async function executeUberMutation(
  operation: () => Promise<unknown>,
  options: { accepted?: boolean; operationId?: string } = {},
): Promise<UberMutationResponse> {
  const operationId = options.operationId ?? randomUUID();
  try {
    await operation();
    return toUberMutationResponse(
      options.accepted ? 'ACCEPTED' : 'SUCCEEDED',
      operationId,
    );
  } catch {
    return {
      operationId,
      status: 'FAILED',
      error: toUberPublicError(
        'UBER_OPERATION_FAILED',
        '操作未完成，请稍后重试；如问题持续，请联系管理员并提供 correlationId。',
        true,
      ),
      contractVersion: UBER_PUBLIC_CONTRACT_VERSION,
    };
  }
}
