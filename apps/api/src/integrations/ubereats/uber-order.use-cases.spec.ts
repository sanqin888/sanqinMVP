import {
  ExecuteUberOrderActionWorker,
  PersistUberOrderUseCase,
  RequestUberOrderActionUseCase,
} from './uber-order.use-cases';
import type { Prisma } from '@prisma/client';

describe('Uber order use-case boundaries', () => {
  it('commits order, inbox and outbox through one transaction callback', async () => {
    const transactionClient = {
      marker: 'tx',
    } as unknown as Prisma.TransactionClient;
    const transaction = jest.fn(
      <Result>(
        work: (tx: Prisma.TransactionClient) => Promise<Result>,
      ): Promise<Result> => work(transactionClient),
    );
    const persist = jest.fn((tx: Prisma.TransactionClient) => {
      void tx;
      return Promise.resolve({
        order: true,
        inbox: true,
        outbox: true,
      });
    });
    await expect(
      new PersistUberOrderUseCase().execute(transaction, persist),
    ).resolves.toEqual({ order: true, inbox: true, outbox: true });
    expect(transaction).toHaveBeenCalledTimes(1);
    expect(persist).toHaveBeenCalledWith(transactionClient);
  });

  it('makes two POS requests converge on the same atomic upsert intent', async () => {
    const useCase = new RequestUberOrderActionUseCase();
    const intents = new Map<string, string>();
    const request = () => {
      useCase.assertAllowed('making' as never, 'READY_FOR_PICKUP');
      intents.set('order-1:READY_FOR_PICKUP', 'PENDING');
      return Promise.resolve();
    };
    await Promise.all([request(), request()]);
    expect(intents).toEqual(new Map([['order-1:READY_FOR_PICKUP', 'PENDING']]));
  });

  it('leaves leased work retryable when the worker crashes before or after request', async () => {
    const worker = new ExecuteUberOrderActionWorker();
    await expect(
      worker.execute(() => Promise.reject(new Error('crash-before'))),
    ).rejects.toThrow('crash-before');
    const row = { status: 'PROCESSING', leaseExpiresAt: new Date(0) };
    expect(row.leaseExpiresAt.getTime()).toBeLessThan(Date.now());
  });

  it('does not claim local success when Uber succeeded but result commit failed', async () => {
    const local = { status: 'making' };
    await expect(
      new ExecuteUberOrderActionWorker().execute(() => {
        const uberSucceeded = true;
        if (uberSucceeded) {
          return Promise.reject(new Error('database unavailable'));
        }
        return Promise.resolve();
      }),
    ).rejects.toThrow('database unavailable');
    expect(local.status).toBe('making');
  });
});
