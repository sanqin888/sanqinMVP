import { CloverProviderConfig } from '../clover-provider.config';
import { CloverPlatformMerchantVerificationGateway } from './clover-platform-merchant-verification.gateway';

describe('CloverPlatformMerchantVerificationGateway', () => {
  const originalBase = process.env.CLOVER_PLATFORM_API_BASE;

  beforeEach(() => {
    process.env.CLOVER_PLATFORM_API_BASE = 'https://platform.example.test';
  });

  afterEach(() => {
    jest.restoreAllMocks();
    if (originalBase === undefined) delete process.env.CLOVER_PLATFORM_API_BASE;
    else process.env.CLOVER_PLATFORM_API_BASE = originalBase;
  });

  it('verifies Merchant Read against Platform v3 with the merchant-scoped token', async () => {
    const fetchSpy = jest
      .spyOn(global, 'fetch')
      .mockResolvedValue(
        new Response(
          JSON.stringify({ id: 'MERCHANT123', name: 'SanQ Roujiamo' }),
          { status: 200 },
        ),
      );
    const gateway = new CloverPlatformMerchantVerificationGateway(
      new CloverProviderConfig(),
    );

    await expect(
      gateway.getMerchantIdentity('MERCHANT123', 'merchant-access-token'),
    ).resolves.toEqual({ id: 'MERCHANT123', name: 'SanQ Roujiamo' });
    expect(fetchSpy.mock.calls[0]?.[0]).toBe(
      'https://platform.example.test/v3/merchants/MERCHANT123',
    );
    expect(fetchSpy.mock.calls[0]?.[1]?.headers).toMatchObject({
      Authorization: 'Bearer merchant-access-token',
    });
  });

  it('verifies Payment Read using the Platform v3 payment collection', async () => {
    const fetchSpy = jest
      .spyOn(global, 'fetch')
      .mockResolvedValue(
        new Response(JSON.stringify({ elements: [] }), { status: 200 }),
      );
    const gateway = new CloverPlatformMerchantVerificationGateway(
      new CloverProviderConfig(),
    );

    await expect(
      gateway.verifyPaymentsRead('MERCHANT123', 'merchant-access-token'),
    ).resolves.toBeUndefined();
    expect(fetchSpy.mock.calls[0]?.[0]).toBe(
      'https://platform.example.test/v3/merchants/MERCHANT123/payments?limit=1',
    );
  });
});
