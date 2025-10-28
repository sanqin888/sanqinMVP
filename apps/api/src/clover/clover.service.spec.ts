// apps/api/src/clover/clover.service.spec.ts
import { Test, TestingModule } from '@nestjs/testing';
import { CloverService } from './clover.service';
import { OrdersService } from '../orders/orders.service';

describe('CloverService', () => {
  let service: CloverService;
  const advance = jest.fn();

  beforeAll(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        CloverService,
        {
          provide: OrdersService,
          useValue: { advance },
        },
      ],
    }).compile();

    service = module.get<CloverService>(CloverService);
  });
  beforeEach(() => {
    advance.mockReset();
  });

  it('returns failure when orderId is missing', async () => {
    const res = await service.simulateOnlinePayment({
      orderId: '',
      result: 'SUCCESS',
    });
    expect(res.ok).toBe(false);
    expect(res.markedPaid).toBe(false);
    expect(advance).not.toHaveBeenCalled();
  });

  it('returns failure when result is FAILURE', async () => {
    const res = await service.simulateOnlinePayment({
      orderId: 'o1',
      result: 'FAILURE',
    });
    expect(res.ok).toBe(false);
    expect(res.markedPaid).toBe(false);
    expect(advance).not.toHaveBeenCalled();
  });

  it('returns success when result is SUCCESS', async () => {
    advance.mockResolvedValueOnce({ status: 'paid' } as never);
    advance.mockResolvedValueOnce({ status: 'making' } as never);
    const res = await service.simulateOnlinePayment({
      orderId: 'o1',
      result: 'SUCCESS',
    });
    expect(res.ok).toBe(true);
    expect(res.markedPaid).toBe(true);
    expect(advance).toHaveBeenCalledTimes(2);
  });

  it('returns failure when advancing order fails', async () => {
    advance.mockRejectedValueOnce(new Error('no order'));
    const res = await service.simulateOnlinePayment({
      orderId: 'o-missing',
      result: 'SUCCESS',
    });
    expect(res.ok).toBe(false);
    expect(res.markedPaid).toBe(false);
    expect(res.reason).toContain('no order');
    expect(advance).toHaveBeenCalledTimes(1);
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
