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
  const actions = [
    ['ACCEPT', 'accept', 'pending', 'making'],
    ['DENY', 'deny', 'pending', null],
    ['CANCEL', 'cancel', 'making', 'refunded'],
    ['READY_FOR_PICKUP', 'readyForPickup', 'making', 'ready'],
  ] as const;
  const setup = (overrides: Partial<UberOrderActionGatewayPort> = {}) => {
    const repository = {
      enqueue: jest.fn().mockResolvedValue({ taskId: 'task-1', created: true }),
      claim: jest.fn().mockResolvedValue([task]),
      getOrderStatus: jest.fn().mockResolvedValue('pending'),
      complete: jest.fn().mockResolvedValue(true),
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

  it.each(actions)(
    '%s has a stable key distinct from every other action',
    async (action) => {
      const { service } = setup();
      const denial = action === 'DENY' ? { reasonCode: 'OTHER' } : undefined;
      const first = service.buildIntent({
        externalOrderId: 'order-1',
        action,
        denial,
      });
      const replay = service.buildIntent({
        externalOrderId: ' order-1 ',
        action,
        denial,
      });
      const otherKeys = actions
        .filter(([candidate]) => candidate !== action)
        .map(
          ([candidate]) =>
            service.buildIntent({
              externalOrderId: 'order-1',
              action: candidate,
              denial:
                candidate === 'DENY' ? { reasonCode: 'OTHER' } : undefined,
            }).idempotencyKey,
        );
      expect(replay.idempotencyKey).toBe(first.idempotencyKey);
      expect(otherKeys).not.toContain(first.idempotencyKey);
    },
  );

  it.each(actions)(
    '%s invokes only %s and commits its domain transition with the claimed lease',
    async (action, method, currentStatus, nextStatus) => {
      const { repository, gateway, service } = setup();
      repository.getOrderStatus.mockResolvedValue(currentStatus);
      const claimed = {
        ...task,
        action,
        reasonCode: action === 'DENY' ? 'ITEM_UNAVAILABLE' : null,
      };

      await service.executeClaimed(claimed);

      expect(gateway[method]).toHaveBeenCalledWith(
        expect.objectContaining({
          externalOrderId: 'order-1',
          idempotencyKey: 'key-1',
        }),
      );
      for (const [, candidate] of actions)
        if (candidate !== method)
          expect(gateway[candidate]).not.toHaveBeenCalled();
      expect(repository.complete).toHaveBeenCalledWith({
        taskId: 'task-1',
        leaseToken: 'lease-from-claim',
        transition: nextStatus ? { from: currentStatus, to: nextStatus } : null,
      });
    },
  );

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
    repository.getOrderStatus.mockResolvedValue('making');
    await service.executeClaimed({ ...task, action: 'CANCEL' });
    expect(gateway.cancel).toHaveBeenCalledWith({
      externalOrderId: 'order-1',
      idempotencyKey: 'key-1',
      denial: { reasonCode: 'OTHER', reasonDetail: null },
    });
    expect(repository.complete).toHaveBeenCalledWith({
      taskId: 'task-1',
      leaseToken: 'lease-from-claim',
      transition: { from: 'making', to: 'refunded' },
    });
  });

  it('completes without a transition when the order no longer exists', async () => {
    const { repository, service } = setup();
    repository.getOrderStatus.mockResolvedValue(null);

    await service.executeClaimed(task);

    expect(repository.complete).toHaveBeenCalledWith({
      taskId: 'task-1',
      leaseToken: 'lease-from-claim',
      transition: null,
    });
  });

  it('always writes success with the token returned by claim', async () => {
    const { repository, service } = setup();
    await service.executeClaimed(task);
    expect(repository.complete).toHaveBeenCalledWith({
      taskId: 'task-1',
      leaseToken: 'lease-from-claim',
      transition: { from: 'pending', to: 'making' },
    });
  });

  it.each([
    [408, true],
    [429, true],
    [503, true],
    [400, false],
    [401, false],
    [403, false],
    [404, false],
    [422, false],
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

  it.each(actions)(
    '%s applies the same retry policy at the service boundary',
    async (action, method) => {
      const error = Object.assign(new Error('throttled'), { status: 429 });
      const { repository, gateway, service } = setup();
      gateway[method].mockRejectedValue(error);
      await service.executeClaimed({ ...task, action });
      expect(repository.markFailed).toHaveBeenCalledWith(
        'task-1',
        'lease-from-claim',
        expect.objectContaining({ retryable: true }),
      );
      expect(repository.complete).not.toHaveBeenCalled();
    },
  );

  it('retries failures without an HTTP response', async () => {
    const error = Object.assign(new Error('network unavailable'), {
      status: null,
      code: 'UBER_NETWORK_ERROR',
    });
    const { repository, service } = setup({
      accept: jest.fn().mockRejectedValue(error),
    });

    await service.executeClaimed(task);

    expect(repository.markFailed).toHaveBeenCalledWith(
      'task-1',
      'lease-from-claim',
      expect.objectContaining({
        retryable: true,
        code: 'UBER_NETWORK_ERROR',
      }),
    );
  });

  it('treats unknown exceptions as retryable without trusting retryable hints', async () => {
    const error = Object.assign(new Error('unknown'), { retryable: false });
    const { repository, service } = setup({
      accept: jest.fn().mockRejectedValue(error),
    });

    await service.executeClaimed(task);

    expect(repository.markFailed).toHaveBeenCalledWith(
      'task-1',
      'lease-from-claim',
      expect.objectContaining({ retryable: true }),
    );
  });

  it('leaves a claimed row recoverable when local success writeback fails', async () => {
    const { repository, service } = setup();
    repository.complete.mockRejectedValue(new Error('database unavailable'));
    repository.markFailed.mockRejectedValue(new Error('database unavailable'));
    await expect(service.executeClaimed(task)).rejects.toThrow(
      'database unavailable',
    );
    expect(repository.complete).toHaveBeenCalledWith(
      expect.objectContaining({
        taskId: 'task-1',
        leaseToken: 'lease-from-claim',
      }),
    );
    expect(repository.markFailed).not.toHaveBeenCalled();
  });

  it('does not mark an upstream failure when the local status read fails', async () => {
    const { repository, gateway, service } = setup();
    repository.getOrderStatus.mockRejectedValue(
      new Error('database unavailable'),
    );

    await expect(service.executeClaimed(task)).rejects.toThrow(
      'database unavailable',
    );
    expect(gateway.accept).not.toHaveBeenCalled();
    expect(repository.markFailed).not.toHaveBeenCalled();
  });
});
