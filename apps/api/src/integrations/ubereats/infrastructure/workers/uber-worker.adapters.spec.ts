import {
  UberOrderActionWorkerAdapter,
  UberWebhookInboxWorkerAdapter,
} from './uber-worker.adapters';
import { UberWorkerConfigService } from './uber-worker-config.service';

describe('Uber durable worker adapters', () => {
  afterEach(() => {
    jest.useRealTimers();
    jest.restoreAllMocks();
  });

  const config = (env: Record<string, string> = {}) =>
    new UberWorkerConfigService({
      UBER_EATS_WORKER_ENABLED: 'true',
      UBER_EATS_WORKER_BATCH_SIZE: '1',
      UBER_EATS_WORKER_SHUTDOWN_TIMEOUT_MS: '100',
      ...env,
    });

  it.each([
    ['webhook inbox', UberWebhookInboxWorkerAdapter],
    ['order action', UberOrderActionWorkerAdapter],
  ])(
    '%s delegates a poll exclusively to its injected use case',
    async (_name, Worker) => {
      const execute = jest.fn().mockResolvedValue(1);
      const unrelated = jest.fn();
      const adapter = new Worker({ execute, unrelated } as never, config());

      await expect(adapter.runOnce()).resolves.toBe(true);

      expect(execute).toHaveBeenCalledTimes(1);
      expect(execute).toHaveBeenCalledWith(1);
      expect(unrelated).not.toHaveBeenCalled();
    },
  );

  it.each([
    ['webhook inbox', UberWebhookInboxWorkerAdapter],
    ['order action', UberOrderActionWorkerAdapter],
  ])('%s prevents concurrent claims in one process', async (_name, Worker) => {
    let release!: () => void;
    const blocked = new Promise<void>((resolve) => (release = resolve));
    const execute = jest.fn(() => blocked);
    const adapter = new Worker({ execute } as never, config());

    const first = adapter.runOnce();
    await expect(adapter.runOnce()).resolves.toBe(false);
    expect(execute).toHaveBeenCalledTimes(1);
    release();
    await expect(first).resolves.toBe(true);
    await adapter.runOnce();
    expect(execute).toHaveBeenCalledTimes(2);
  });

  it('pulls a 30 second fallback poll forward when a wake signal arrives', async () => {
    jest.useFakeTimers();
    const execute = jest.fn().mockResolvedValue(0);
    const adapter = new UberOrderActionWorkerAdapter(
      { execute } as never,
      config({ UBER_EATS_WORKER_WAKE_FALLBACK_POLL_INTERVAL_MS: '30000' }),
    );

    adapter.onModuleInit();
    await jest.advanceTimersByTimeAsync(0);
    expect(execute).toHaveBeenCalledTimes(1);

    await jest.advanceTimersByTimeAsync(10_000);
    expect(execute).toHaveBeenCalledTimes(1);

    expect(adapter.wake()).toBe(true);
    await jest.advanceTimersByTimeAsync(0);
    expect(execute).toHaveBeenCalledTimes(2);

    await adapter.onModuleDestroy();
  });

  it('coalesces a wake received while a claim is already in flight', async () => {
    jest.useFakeTimers();
    let release!: (value: number) => void;
    const execute = jest
      .fn()
      .mockImplementationOnce(
        () => new Promise<number>((resolve) => (release = resolve)),
      )
      .mockResolvedValue(0);
    const adapter = new UberWebhookInboxWorkerAdapter(
      { execute } as never,
      config({ UBER_EATS_WORKER_WAKE_FALLBACK_POLL_INTERVAL_MS: '30000' }),
    );

    adapter.onModuleInit();
    await jest.advanceTimersByTimeAsync(0);
    expect(execute).toHaveBeenCalledTimes(1);

    expect(adapter.wake()).toBe(true);
    release(1);
    await Promise.resolve();
    await Promise.resolve();
    await jest.advanceTimersByTimeAsync(0);
    expect(execute).toHaveBeenCalledTimes(2);

    await adapter.onModuleDestroy();
  });

  it('requeues on the next poll after an interrupted/error poll', async () => {
    jest.spyOn(console, 'error').mockImplementation(() => undefined);
    const execute = jest
      .fn<Promise<number>, []>()
      .mockRejectedValueOnce(new Error('process interrupted'))
      .mockResolvedValueOnce(1);
    const adapter = new UberWebhookInboxWorkerAdapter(
      { execute } as never,
      config(),
    );

    await expect(adapter.runOnce()).resolves.toBe(false);
    await expect(adapter.runOnce()).resolves.toBe(true);
    expect(execute).toHaveBeenCalledTimes(2);
  });

  it('isolates an order-action use-case infrastructure error in the thin runner', async () => {
    jest.spyOn(console, 'error').mockImplementation(() => undefined);
    const execute = jest.fn().mockRejectedValue(new Error('database offline'));
    const adapter = new UberOrderActionWorkerAdapter(
      { execute } as never,
      config(),
    );

    await expect(adapter.runOnce()).resolves.toBe(false);
    expect(execute).toHaveBeenCalledWith(1);
    expect(adapter.getMetrics()).toMatchObject({
      failures: 1,
      consecutiveFailures: 1,
    });
  });

  it('does not start new work after shutdown begins', async () => {
    let release!: () => void;
    const execute = jest.fn(
      () =>
        new Promise<number>((resolve) => {
          release = () => resolve(1);
        }),
    );
    const adapter = new UberWebhookInboxWorkerAdapter(
      { execute } as never,
      config(),
    );
    const poll = adapter.runOnce();
    const shutdown = adapter.onModuleDestroy();
    await expect(adapter.runOnce()).resolves.toBe(false);
    release();
    await Promise.all([poll, shutdown]);
    expect(execute).toHaveBeenCalledTimes(1);
  });

  it('atomically snapshots a success, a temporary failure, and recovery', async () => {
    const execute = jest
      .fn()
      .mockResolvedValueOnce(2)
      .mockRejectedValueOnce(new Error('boom'));
    const adapter = new UberWebhookInboxWorkerAdapter(
      { execute } as never,
      config(),
    );
    await adapter.runOnce();
    const successful = adapter.getMetrics();
    expect(successful).toMatchObject({
      claimed: 2,
      failures: 0,
      consecutiveFailures: 0,
      lastFailureAt: null,
    });
    expect(successful.lastAttemptAt).toBeInstanceOf(Date);
    expect(successful.lastSuccessfulAt).toBeInstanceOf(Date);

    await adapter.runOnce();
    const failed = adapter.getMetrics();
    expect(failed).toMatchObject({
      claimed: 2,
      failures: 1,
      consecutiveFailures: 1,
      lastSuccessfulAt: successful.lastSuccessfulAt,
    });
    expect(failed.lastAttemptAt).toBeInstanceOf(Date);
    expect(failed.lastFailureAt).toBeInstanceOf(Date);

    await adapter.runOnce();
    expect(adapter.getMetrics()).toMatchObject({
      claimed: 2,
      failures: 1,
      consecutiveFailures: 0,
      lastFailureAt: failed.lastFailureAt,
    });
  });

  it('does not overlap claims made by duplicate worker instances', async () => {
    let available = 1;
    const execute = jest.fn(() => Promise.resolve(available-- > 0 ? 1 : 0));
    const first = new UberWebhookInboxWorkerAdapter(
      { execute } as never,
      config(),
    );
    const second = new UberWebhookInboxWorkerAdapter(
      { execute } as never,
      config(),
    );
    await Promise.all([first.runOnce(), second.runOnce()]);
    expect(first.getMetrics().claimed + second.getMetrics().claimed).toBe(1);
  });

  it('reports an expired lease recovered by the persistence dispatch', async () => {
    const adapter = new UberWebhookInboxWorkerAdapter(
      {
        execute: jest
          .fn()
          .mockResolvedValue({ claimed: 1, leaseRecoveries: 1 }),
      } as never,
      config(),
    );
    await adapter.runOnce();
    expect(adapter.getMetrics().leaseRecoveries).toBe(1);
  });

  it('replaces the current backlog snapshot when the backlog grows', async () => {
    const execute = jest
      .fn()
      .mockResolvedValueOnce({ claimed: 1, backlog: 2 })
      .mockResolvedValueOnce({ claimed: 1, backlog: 7 });
    const adapter = new UberWebhookInboxWorkerAdapter(
      { execute } as never,
      config(),
    );

    await adapter.runOnce();
    expect(adapter.getMetrics().backlog).toBe(2);
    await adapter.runOnce();
    expect(adapter.getMetrics()).toMatchObject({ claimed: 2, backlog: 7 });
  });
});
