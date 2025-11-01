import { Test, TestingModule } from '@nestjs/testing';
import { CloverService, HostedCheckoutRequest } from './clover.service';

describe('CloverService', () => {
  let service: CloverService;

  // 简单 mock 全局 fetch（如你已有更完善的 mock，可保留原逻辑）
  const originalFetch = global.fetch;

  beforeAll(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [CloverService],
    }).compile();

    service = module.get<CloverService>(CloverService);
  });

  afterEach(() => {
    // 每次测试还原 fetch
    global.fetch = originalFetch;
  });

  it('should return ok when API responds with redirectUrls.href and checkoutSessionId', async () => {
    global.fetch = vi.fn().mockResolvedValue({
      json: async () => ({
        redirectUrls: { href: 'https://checkout.example/abc' },
        checkoutSessionId: 'sess_123',
      }),
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

  it('should return ok:false with reason when API misses fields', async () => {
    global.fetch = vi.fn().mockResolvedValue({
      json: async () => ({ message: 'bad request' }),
    });

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

  it('should handle thrown errors safely', async () => {
    global.fetch = vi.fn().mockRejectedValue(new Error('network'));

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
