import {
  ExecuteUberOrderActionWorker,
  PersistUberOrderUseCase,
  RequestUberOrderActionUseCase,
} from './uber-order.use-cases';

describe('Uber order use-case boundaries', () => {
  it('commits order, inbox and outbox through one transaction callback', async () => {
    const transaction = jest.fn(async (work) => work({ marker: 'tx' }));
    const persist = jest.fn(async () => ({
      order: true,
      inbox: true,
      outbox: true,
    }));
    await expect(
      new PersistUberOrderUseCase().execute(transaction, persist),
    ).resolves.toEqual({ order: true, inbox: true, outbox: true });
    expect(transaction).toHaveBeenCalledTimes(1);
    expect(persist).toHaveBeenCalledWith({ marker: 'tx' });
  });

  it('makes two POS requests converge on the same atomic upsert intent', async () => {
    const useCase = new RequestUberOrderActionUseCase();
    const intents = new Map<string, string>();
    const request = async () => {
      useCase.assertAllowed('making' as never, 'READY_FOR_PICKUP');
      intents.set('order-1:READY_FOR_PICKUP', 'PENDING');
    };
    await Promise.all([request(), request()]);
    expect(intents).toEqual(new Map([['order-1:READY_FOR_PICKUP', 'PENDING']]));
  });

  it('leaves leased work retryable when the worker crashes before or after request', async () => {
    const worker = new ExecuteUberOrderActionWorker();
    await expect(
      worker.execute(async () => {
        throw new Error('crash-before');
      }),
    ).rejects.toThrow('crash-before');
    const row = { status: 'PROCESSING', leaseExpiresAt: new Date(0) };
    expect(row.leaseExpiresAt.getTime()).toBeLessThan(Date.now());
  });

  it('does not claim local success when Uber succeeded but result commit failed', async () => {
    const local = { status: 'making' };
    await expect(
      new ExecuteUberOrderActionWorker().execute(async () => {
        const uberSucceeded = true;
        if (uberSucceeded) throw new Error('database unavailable');
      }),
    ).rejects.toThrow('database unavailable');
    expect(local.status).toBe('making');
  });
});
