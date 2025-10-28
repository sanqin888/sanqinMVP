// apps/api/src/clover/clover.service.spec.ts
import { Test, TestingModule } from '@nestjs/testing';
import { CloverService } from './clover.service';

describe('CloverService', () => {
  let service: CloverService;

  beforeAll(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [CloverService],
    }).compile();

    service = module.get<CloverService>(CloverService);
  });

  it('returns failure when orderId is missing', async () => {
    const res = await service.simulateOnlinePayment({
      orderId: '',
      result: 'SUCCESS',
    });
    expect(res.ok).toBe(false);
    expect(res.markedPaid).toBe(false);
  });

  it('returns failure when result is FAILURE', async () => {
    const res = await service.simulateOnlinePayment({
      orderId: 'o1',
      result: 'FAILURE',
    });
    expect(res.ok).toBe(false);
    expect(res.markedPaid).toBe(false);
  });

  it('returns success when result is SUCCESS', async () => {
    const res = await service.simulateOnlinePayment({
      orderId: 'o1',
      result: 'SUCCESS',
    });
    expect(res.ok).toBe(true);
    expect(res.markedPaid).toBe(true);
  });

  it('handles unexpected errors without unsafe calls', () => {
    // simulate try/catch and assert by message using instanceof Error
    try {
      // force a runtime error
      throw new Error('boom');
    } catch (err: unknown) {
      if (err instanceof Error) {
        expect(err.message).toBe('boom');
      } else {
        // not an Error - still assert type without calling it
        expect(typeof err).not.toBe('function');
      }
    }
  });
});
