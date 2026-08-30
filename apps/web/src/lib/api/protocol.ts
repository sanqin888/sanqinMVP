export type ApiResponseEnvelope<T> = {
  code: string;
  message: string;
  details: T;
};

export class ApiError extends Error {
  status: number;
  payload?: unknown;
  apiMessage: string;

  constructor(
    message: string,
    status: number,
    payload?: unknown,
    apiMessage = message,
  ) {
    super(message);
    this.name = 'ApiError';
    this.status = status;
    this.payload = payload;
    this.apiMessage = apiMessage;
  }
}

export function getApiErrorMessage(error: unknown, fallback: string): string {
  if (error instanceof ApiError && error.apiMessage.trim()) {
    return error.apiMessage;
  }
  if (error instanceof Error && error.message.trim()) {
    return error.message;
  }
  return fallback;
}

export type PayloadParser<T> = {
  parse: (input: unknown) => T;
};

type ParseApiResponseOptions<T> = {
  ok: boolean;
  status: number;
  method: string;
  url: string;
  payload: unknown;
  parser?: PayloadParser<T>;
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object';
}

function isOperationStatusPayload(
  value: unknown,
): value is { ok: boolean; error?: string } {
  if (!isRecord(value) || typeof value.ok !== 'boolean') return false;
  if (value.error !== undefined && typeof value.error !== 'string') return false;
  return true;
}

export function isApiEnvelope(
  value: unknown,
): value is ApiResponseEnvelope<unknown> {
  return (
    isRecord(value) &&
    typeof value.code === 'string' &&
    typeof value.message === 'string' &&
    'details' in value
  );
}

function buildDetailsSnippet(details: unknown): string {
  if (details === undefined || details === null) return '';
  if (typeof details === 'string') return ` :: ${details.slice(0, 160)}`;
  if (typeof details === 'number' || typeof details === 'boolean') {
    return ` :: ${String(details)}`;
  }
  if (isRecord(details)) {
    return ` :: ${JSON.stringify(details).slice(0, 160)}`;
  }
  try {
    return ` :: ${JSON.stringify(details).slice(0, 160)}`;
  } catch {
    return '';
  }
}

export async function readApiResponsePayload(response: Response): Promise<unknown> {
  const contentType = response.headers.get('content-type') ?? '';
  return contentType.includes('application/json')
    ? response.json().catch(() => null)
    : response.text();
}

export function parseApiResponse<T>({
  ok,
  status,
  method,
  url,
  payload,
  parser,
}: ParseApiResponseOptions<T>): T {
  if (!ok) {
    if (isApiEnvelope(payload)) {
      const snippet = buildDetailsSnippet(payload.details);
      const apiMessage = payload.message || 'API 错误';
      throw new ApiError(
        `${apiMessage} ${status}${snippet} (${method} ${url})`,
        status,
        payload,
        apiMessage,
      );
    }

    const rawSnippet =
      typeof payload === 'string' && payload
        ? ` :: ${payload.slice(0, 160)}`
        : '';
    const apiMessage = `API 错误 ${status}`;
    throw new ApiError(
      `${apiMessage}${rawSnippet} (${method} ${url})`,
      status,
      payload,
      apiMessage,
    );
  }

  if (!isApiEnvelope(payload)) {
    const apiMessage = 'API response contract mismatch';
    throw new ApiError(
      `${apiMessage}: expected {code,message,details} (${method} ${url})`,
      status,
      payload,
      apiMessage,
    );
  }

  if (payload.code !== 'OK') {
    const apiMessage = payload.message || 'API operation failed';
    throw new ApiError(
      `${apiMessage} ${status} (${method} ${url})`,
      status,
      payload,
      apiMessage,
    );
  }

  const data = payload.details;

  if (isOperationStatusPayload(data) && !data.ok) {
    const apiMessage = data.error || 'API operation failed';
    throw new ApiError(
      `${apiMessage} ${status} (${method} ${url})`,
      status,
      payload,
      apiMessage,
    );
  }

  if (parser) {
    return parser.parse(data);
  }

  return data as T;
}
