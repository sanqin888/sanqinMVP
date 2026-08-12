import {
  UberMenuPublishConfirmationWorkerAdapter,
  UberOrderActionWorkerAdapter,
  UberWebhookInboxWorkerAdapter,
} from './uber-worker.adapters';
import { UberWorkerConfigService } from './uber-worker-config.service';

describe('Uber durable worker adapters', () => {
  afterEach(() => jest.restoreAllMocks());

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
    ['menu confirmation', UberMenuPublishConfirmationWorkerAdapter],
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
    ['menu publish confirmation', UberMenuPublishConfirmationWorkerAdapter],
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

  it('exposes successful claim and failure metrics', async () => {
    const execute = jest
      .fn()
      .mockResolvedValueOnce(2)
      .mockRejectedValueOnce(new Error('boom'));
    const adapter = new UberWebhookInboxWorkerAdapter(
      { execute } as never,
      config(),
    );
    await adapter.runOnce();
    await adapter.runOnce();
    expect(adapter.getMetrics()).toMatchObject({ claimed: 2, failures: 1 });
    expect(adapter.getMetrics().lastSuccessfulAt).toBeInstanceOf(Date);
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
});
