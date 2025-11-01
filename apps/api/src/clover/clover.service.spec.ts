import { Test, TestingModule } from '@nestjs/testing';
import { CloverService } from './clover.service';
import type { CreateHostedCheckoutDto as HostedCheckoutRequest } from './dto/create-hosted-checkout.dto';

describe('CloverService', () => {
  let service: CloverService;
  let originalFetch: typeof fetch | undefined;

  beforeAll(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [CloverService],
    }).compile();

    service = module.get<CloverService>(CloverService);
  });

  beforeEach(() => {
    originalFetch = (global as any).fetch as typeof fetch | undefined;
  });

  afterEach(() => {
    // 还原全局 fetch
    (global as any).fetch = originalFetch as typeof fetch;
  });

  function setFetchResolve(body: unknown) {
    // 用 typeof fetch 强类型断言，避免 no-unsafe-*
    (global as any).fetch = ((..._args: unknown[]) =>
      Promise.resolve({
        // 注意：不要写成 async，否则触发 require-await
        json: () => Promise.resolve(body),
      })) as typeof fetch;
  }

  function setFetchReject(err: Error) {
    (global as any).fetch = ((..._args: unknown[]) => Promise.reject(err)) as typeof fetch;
  }

  it('returns ok when API responds with href and session id', async () => {
    setFetchResolve({
      redirectUrls: { href: 'https://checkout.example/abc' },
      checkoutSessionId: 'sess_123',
    });

    const req: HostedCheckoutRequest = {
      currency: 'CAD',
      amountCents: 100,
      referenceId: 'ref-1',
      returnUrl: 'https://return',
      // description / metadata 可选
    };

    const res = await service.createHostedCheckout(req);
    expect(res.ok).toBe(true);
    if (res.ok) {
      expect(res.href).toBe('https://checkout.example/abc');
      expect(res.checkoutSessionId).toBe('sess_123');
    }
  });

  it('returns ok:false when API misses expected fields', async () => {
    setFetchResolve({ message: 'bad request' });

    const req: HostedCheckoutRequest = {
      currency: 'CAD',
      amountCents: 100,
      referenceId: 'ref-2',
      returnUrl: 'https://return',
    };

    const res = await service.createHostedCheckout(req);
    expect(res.ok).toBe(false);
    if (!res.ok) {
      expect(typeof res.reason).toBe('string');
    }
  });

  it('handles fetch rejection safely', async () => {
    setFetchReject(new Error('network'));

    const req: HostedCheckoutRequest = {
      currency: 'CAD',
      amountCents: 100,
      referenceId: 'ref-3',
      returnUrl: 'https://return',
    };

    const res = await service.createHostedCheckout(req);
    expect(res.ok).toBe(false);
    if (!res.ok) {
      expect(res.reason).toBe('network');
    }
  });
});
