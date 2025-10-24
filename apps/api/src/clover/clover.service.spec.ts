import { BadGatewayException, ServiceUnavailableException } from '@nestjs/common';
import { CloverService } from './clover.service';

describe('CloverService', () => {
  const originalEnv = { ...process.env };
  const fetchMock: jest.MockedFunction<typeof fetch> = jest.fn();

  beforeEach(() => {
    jest.resetModules();
    process.env = {
      ...originalEnv,
      CLOVER_API_BASE_URL: 'https://sandbox.dev.clover.com/v3',
      CLOVER_MERCHANT_ID: 'merchant-123',
      CLOVER_ACCESS_TOKEN: 'token-abc',
    };

    fetchMock.mockReset();
    (
      globalThis as typeof globalThis & {
        fetch: jest.MockedFunction<typeof fetch>;
      }
    ).fetch = fetchMock;
  });

  afterEach(() => {
    process.env = { ...originalEnv };
  });

  it('calls Clover orders endpoint with limit and authorization header', async () => {
    fetchMock.mockResolvedValue(
      new Response(JSON.stringify({ elements: [] }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      }),
    );

    const service = new CloverService();
    await service.listOrders(25);

    const lastCall = fetchMock.mock.calls.at(-1);
    expect(lastCall?.[0]).toContain('/merchants/merchant-123/orders?limit=25');
    expect(lastCall?.[1]?.headers).toMatchObject({
      Authorization: 'Bearer token-abc',
      Accept: 'application/json',
    });
  });

  it('throws BadGatewayException when Clover responds with an error', async () => {
    fetchMock.mockResolvedValue(
      new Response('boom', {
        status: 500,
        statusText: 'Internal Server Error',
        headers: { 'Content-Type': 'text/plain' },
      }),
    );

    const service = new CloverService();

    await expect(service.getMerchantProfile()).rejects.toBeInstanceOf(
      BadGatewayException,
    );
  });

  it('throws ServiceUnavailableException when not configured', async () => {
    delete process.env.CLOVER_ACCESS_TOKEN;
    delete process.env.CLOVER_MERCHANT_ID;

    const service = new CloverService();

    await expect(service.listOrders()).rejects.toBeInstanceOf(
      ServiceUnavailableException,
    );
    expect(fetchMock).not.toHaveBeenCalled();
  });
});
