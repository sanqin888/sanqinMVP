import { Test, TestingModule } from '@nestjs/testing';
import { CloverService } from './clover.service';
import type { CreateHostedCheckoutDto as HostedCheckoutRequest } from './dto/create-hosted-checkout.dto';

describe('CloverService', () => {
  let service: CloverService;
  let originalFetch: typeof fetch;

  beforeAll(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [CloverService],
    }).compile();

    service = module.get<CloverService>(CloverService);
  });

  beforeEach(() => {
    originalFetch = globalThis.fetch;
  });

  afterEach(() => {
    // 还原全局 fetch
    globalThis.fetch = originalFetch;
  });

  function setFetchResolve(body: unknown): void {
    // 仅提供 json，其他字段对当前测试不需要；用窄类型再断言为 Response
    const fakeResponse = { json: () => Promise.resolve(body) } as Pick<Response, 'json'> as Response;
    const mockFetch = (() => Promise.resolve(fakeResponse)) as unknown as typeof fetch;
    globalThis.fetch = mockFetch;
  }

  function setFetchReject(err: Error): void {
    const mockFetch = (() => Promise.reject(err)) as unknown as typeof fetch;
    globalThis.fetch = mockFetch;
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
