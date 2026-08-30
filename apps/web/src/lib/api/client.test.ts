import {
  ApiError,
  apiFetch,
  getApiErrorMessage,
  type PayloadParser,
} from './client';

function jsonResponse(payload: unknown, status = 200): Response {
  return {
    ok: status >= 200 && status < 300,
    status,
    headers: new Headers({ 'content-type': 'application/json; charset=utf-8' }),
    json: jest.fn().mockResolvedValue(payload),
    text: jest.fn().mockResolvedValue(JSON.stringify(payload)),
  } as unknown as Response;
}

describe('apiFetch contract', () => {
  const originalFetch = globalThis.fetch;
  const fetchMock = jest.fn();

  beforeEach(() => {
    fetchMock.mockReset();
    globalThis.fetch = fetchMock as unknown as typeof fetch;
  });

  afterAll(() => {
    globalThis.fetch = originalFetch;
  });

  it('unwraps the canonical API envelope and applies browser defaults', async () => {
    fetchMock.mockResolvedValue(
      jsonResponse({
        code: 'OK',
        message: 'success',
        details: { userStableId: 'user_test' },
      }),
    );

    await expect(
      apiFetch<{ userStableId: string }>('/auth/me', {
        unauthorized: 'throw',
      }),
    ).resolves.toEqual({ userStableId: 'user_test' });

    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url, init] = fetchMock.mock.calls[0] as unknown as Parameters<
      typeof fetch
    >;
    expect(url).toBe('/api/v1/auth/me');
    expect(init).toEqual(
      expect.objectContaining({
        cache: 'no-store',
        credentials: 'include',
      }),
    );
    expect(init).not.toHaveProperty('unauthorized');
    expect(new Headers(init?.headers).get('accept')).toBe('application/json');
  });

  it('passes envelope details through the optional parser', async () => {
    fetchMock.mockResolvedValue(
      jsonResponse({ code: 'OK', message: 'success', details: '42' }),
    );
    const parser: PayloadParser<number> = {
      parse(input) {
        return Number(input);
      },
    };

    await expect(apiFetch<number>('/value', {}, parser)).resolves.toBe(42);
  });

  it('rejects successful direct payloads instead of silently accepting contract drift', async () => {
    fetchMock.mockResolvedValue(jsonResponse({ userStableId: 'legacy-direct' }));

    await expect(apiFetch('/auth/me')).rejects.toMatchObject({
      name: 'ApiError',
      status: 200,
      apiMessage: 'API response contract mismatch',
    });
  });

  it('treats an operation payload with ok=false as an API error', async () => {
    fetchMock.mockResolvedValue(
      jsonResponse({
        code: 'OK',
        message: 'success',
        details: { ok: false, error: 'verification expired' },
      }),
    );

    await expect(apiFetch('/auth/2fa/email/verify')).rejects.toMatchObject({
      name: 'ApiError',
      status: 200,
      apiMessage: 'verification expired',
    });
  });

  it('keeps a clean API message for UI errors while retaining diagnostic context', async () => {
    fetchMock.mockResolvedValue(
      jsonResponse(
        {
          code: 'HTTP_401',
          message: 'Invalid credentials',
          details: null,
        },
        401,
      ),
    );

    let error: unknown;
    try {
      await apiFetch('/auth/login', { method: 'POST', unauthorized: 'throw' });
    } catch (caught) {
      error = caught;
    }

    expect(error).toBeInstanceOf(ApiError);
    expect(getApiErrorMessage(error, 'Login failed')).toBe('Invalid credentials');
    expect((error as ApiError).message).toContain('(POST /api/v1/auth/login)');
  });
});
