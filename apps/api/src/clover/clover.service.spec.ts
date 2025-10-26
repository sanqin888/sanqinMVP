import { BadGatewayException } from '@nestjs/common';
import { CloverService } from './clover.service';

describe('CloverService', () => {
  const originalEnv = { ...process.env };

  // 类型安全的 fetch mock
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

    // 类型安全地挂到全局（避免 any 赋值）
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

    expect(fetchMock).toHaveBeenLastCalledWith(
      expect.stringContaining('/merchants/merchant-123/orders?limit=25'),
      expect.objectContaining({
        // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
        headers: expect.objectContaining({
          Authorization: 'Bearer token-abc',
          Accept: 'application/json',
        }),
      }),
    );
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

    expect.hasAssertions();

    try {
      await service.getMerchantProfile();
    } catch (error) {
      expect(error).toBeInstanceOf(BadGatewayException);
      expect(error).toMatchObject({
        message: 'Clover API request failed: 500 Internal Server Error',
      });
    }
  });

  it('sends POST request with JSON body when simulating online payment', async () => {
    fetchMock.mockResolvedValue(
      new Response(JSON.stringify({ ok: true }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      }),
    );

    const service = new CloverService();

    // 明确 payload 类型（移除 `| string`，避免 no-redundant-type-constituents）
    type SimulateOnlinePaymentPayload = {
      orderId: string;
      result: 'SUCCESS' | 'FAILURE';
    };
    const payload: SimulateOnlinePaymentPayload = {
      orderId: 'order-1',
      result: 'SUCCESS',
    };

    await service.simulateOnlinePayment(payload);

    expect(fetchMock).toHaveBeenLastCalledWith(
      expect.stringContaining('/merchants/merchant-123/pay/online/simulate'),
      expect.objectContaining({
        method: 'POST',
        // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
        headers: expect.objectContaining({
          'Content-Type': 'application/json',
          Accept: 'application/json',
          Authorization: 'Bearer token-abc',
        }),
        body: JSON.stringify(payload),
      }),
    );
  });
});
