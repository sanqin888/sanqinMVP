import {
  UberMenuPublishConfirmationWorkerAdapter,
  UberOrderActionWorkerAdapter,
  UberWebhookInboxWorkerAdapter,
} from './uber-worker.adapters';

describe('Uber durable worker adapters', () => {
  afterEach(() => jest.restoreAllMocks());

  it.each([
    ['webhook inbox', UberWebhookInboxWorkerAdapter],
    ['order action', UberOrderActionWorkerAdapter],
    ['menu publish confirmation', UberMenuPublishConfirmationWorkerAdapter],
  ])('%s prevents concurrent claims in one process', async (_name, Worker) => {
    let release!: () => void;
    const blocked = new Promise<void>((resolve) => (release = resolve));
    const execute = jest.fn(() => blocked);
    const adapter = new Worker({ execute } as never);

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
    const adapter = new UberWebhookInboxWorkerAdapter({ execute } as never);

    await expect(adapter.runOnce()).resolves.toBe(false);
    await expect(adapter.runOnce()).resolves.toBe(true);
    expect(execute).toHaveBeenCalledTimes(2);
  });
});
