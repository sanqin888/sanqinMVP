import type {
  UberOrderActionGatewayPort,
  UberOrderActionRepositoryPort,
  UberOrderActionTask,
} from './uber-order.ports';
import { UberOrderActionService } from './uber-order-action.service';

const task: UberOrderActionTask = {
  taskId: 'task-1',
  leaseToken: 'lease-from-claim',
  externalOrderId: 'order-1',
  action: 'ACCEPT',
  idempotencyKey: 'key-1',
  businessVersion: 'v1',
  reasonCode: null,
  reasonDetail: null,
};

describe('UberOrderActionService contract', () => {
  const setup = (overrides: Partial<UberOrderActionGatewayPort> = {}) => {
    const repository = {
      enqueue: jest.fn().mockResolvedValue({ taskId: 'task-1', created: true }),
      claim: jest.fn().mockResolvedValue([task]),
      markSucceeded: jest.fn().mockResolvedValue(true),
      markFailed: jest.fn().mockResolvedValue(true),
    } as jest.Mocked<UberOrderActionRepositoryPort>;
    const gateway = {
      accept: jest.fn().mockResolvedValue(undefined),
      deny: jest.fn().mockResolvedValue(undefined),
      cancel: jest.fn().mockResolvedValue(undefined),
      readyForPickup: jest.fn().mockResolvedValue(undefined),
      ...overrides,
    } as jest.Mocked<UberOrderActionGatewayPort>;
    return {
      repository,
      gateway,
      service: new UberOrderActionService(repository, gateway),
    };
  };

  it('creates the same durable intent for duplicate requests', async () => {
    const { repository, service } = setup();
    await service.request('order-1', 'ACCEPT');
    await service.request('order-1', 'ACCEPT');
    expect(repository.enqueue.mock.calls[0][0].idempotencyKey).toBe(
      repository.enqueue.mock.calls[1][0].idempotencyKey,
    );
  });

  it('builds the same normalized intent without performing I/O', () => {
    const { repository, service } = setup();
    const intent = service.buildIntent({
      externalOrderId: ' order-1 ',
      action: 'DENY',
      denial: { reasonCode: ' INVALID_ORDER ', reasonDetail: ' invalid ' },
    });

    expect(intent).toEqual({
      externalOrderId: 'order-1',
      action: 'DENY',
      idempotencyKey: expect.stringMatching(/^sanqin-uber-/),
      businessVersion: 'v1',
      reasonCode: 'INVALID_ORDER',
      reasonDetail: 'invalid',
    });
    expect(repository.enqueue).not.toHaveBeenCalled();
  });

  it('persists CANCEL as its own idempotent business action', async () => {
    const { repository, service } = setup();
    await service.request('order-1', 'CANCEL');
    await service.request('order-1', 'CANCEL');
    expect(repository.enqueue).toHaveBeenCalledWith(
      expect.objectContaining({
        action: 'CANCEL',
        idempotencyKey: expect.stringMatching(/^sanqin-uber-/),
      }),
    );
    expect(repository.enqueue.mock.calls[0][0].idempotencyKey).toBe(
      repository.enqueue.mock.calls[1][0].idempotencyKey,
    );
  });

  it('dispatches a claimed CANCEL through the sole action gateway', async () => {
    const { repository, gateway, service } = setup();
    await service.executeClaimed({ ...task, action: 'CANCEL' });
    expect(gateway.cancel).toHaveBeenCalledWith({
      externalOrderId: 'order-1',
      idempotencyKey: 'key-1',
    });
    expect(repository.markSucceeded).toHaveBeenCalledWith(
      'task-1',
      'lease-from-claim',
    );
  });

  it('always writes success with the token returned by claim', async () => {
    const { repository, service } = setup();
    await service.executeClaimed(task);
    expect(repository.markSucceeded.mock.calls).toContainEqual([
      'task-1',
      'lease-from-claim',
    ]);
  });

  it.each([
    [503, true],
    [400, false],
  ])('classifies HTTP %s failure retryable=%s', async (status, retryable) => {
    const error = Object.assign(new Error('failed'), { status });
    const { repository, service } = setup({
      accept: jest.fn().mockRejectedValue(error),
    });
    await service.executeClaimed(task);
    expect(repository.markFailed.mock.calls).toContainEqual([
      'task-1',
      'lease-from-claim',
      expect.objectContaining({ retryable }),
    ]);
  });

  it('leaves a claimed row recoverable when local success writeback fails', async () => {
    const { repository, service } = setup();
    repository.markSucceeded.mockRejectedValue(
      new Error('database unavailable'),
    );
    repository.markFailed.mockRejectedValue(new Error('database unavailable'));
    await expect(service.executeClaimed(task)).rejects.toThrow(
      'database unavailable',
    );
    expect(repository.markSucceeded.mock.calls).toContainEqual([
      'task-1',
      'lease-from-claim',
    ]);
  });
});
