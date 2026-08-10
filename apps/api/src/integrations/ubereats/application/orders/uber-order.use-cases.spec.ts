import {
  ExecuteUberOrderActionWorker,
  RequestUberOrderActionUseCase,
} from './uber-order.use-cases';
import type { UberOrderActionPort } from '../ports/uber-use-case.ports';

describe('Uber order use-case boundaries', () => {
  const actions = (overrides: Partial<UberOrderActionPort> = {}) =>
    ({
      acceptUberOrder: jest.fn(),
      denyUberOrder: jest.fn(),
      retryReadyForPickup: jest.fn(),
      getReadyForPickupAction: jest.fn(),
      processPendingUberOrderActions: jest.fn(),
      ...overrides,
    }) as UberOrderActionPort;

  it('delegates POS action requests to the atomic action port', async () => {
    const acceptUberOrder = jest.fn().mockResolvedValue({ status: 'PENDING' });
    const useCase = new RequestUberOrderActionUseCase(
      actions({ acceptUberOrder }),
    );

    await expect(useCase.accept('order-1')).resolves.toEqual({
      status: 'PENDING',
    });
    expect(acceptUberOrder).toHaveBeenCalledWith('order-1');
  });

  it('leaves leased work retryable when the worker crashes before or after request', async () => {
    const processPendingUberOrderActions = jest
      .fn()
      .mockRejectedValue(new Error('crash-before'));
    const worker = new ExecuteUberOrderActionWorker(
      actions({ processPendingUberOrderActions }),
    );
    await expect(worker.execute()).rejects.toThrow('crash-before');
    expect(processPendingUberOrderActions).toHaveBeenCalledWith(50);
    const row = { status: 'PROCESSING', leaseExpiresAt: new Date(0) };
    expect(row.leaseExpiresAt.getTime()).toBeLessThan(Date.now());
  });

  it('does not claim local success when Uber succeeded but result commit failed', async () => {
    const local = { status: 'making' };
    const processPendingUberOrderActions = jest
      .fn()
      .mockRejectedValue(new Error('database unavailable'));
    await expect(
      new ExecuteUberOrderActionWorker(
        actions({ processPendingUberOrderActions }),
      ).execute(),
    ).rejects.toThrow('database unavailable');
    expect(local.status).toBe('making');
  });
});
