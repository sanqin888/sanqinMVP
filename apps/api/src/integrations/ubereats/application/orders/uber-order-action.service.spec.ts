import type {
  UberOrderActionGatewayPort,
  UberOrderActionRepositoryPort,
  UberOrderActionTask,
} from './uber-order.ports';
import { UberOrderActionService } from './uber-order-action.service';

const referenceAt = new Date('2026-08-18T18:00:00.000Z');
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

const setup = (overrides: Partial<UberOrderActionGatewayPort> = {}) => {
  const repository = {
    enqueue: jest.fn().mockResolvedValue({ taskId: 'task-1', created: true }),
    claim: jest.fn().mockResolvedValue([task]),
    getOrderContext: jest.fn().mockResolvedValue({
      status: 'pending',
      totalCents: 1_000,
      referenceAt,
      fulfillmentTiming: 'IMMEDIATE',
      scheduledReadyAt: null,
      externalEstimatedReadyAt: null,
    }),
    complete: jest.fn().mockResolvedValue(true),
    markFailed: jest.fn().mockResolvedValue(true),
  } as jest.Mocked<UberOrderActionRepositoryPort>;
  const gateway = {
    accept: jest.fn().mockResolvedValue({ upstreamStatus: 200 }),
    deny: jest.fn().mockResolvedValue({ upstreamStatus: 200 }),
    cancel: jest.fn().mockResolvedValue({ upstreamStatus: 204 }),
    readyForPickup: jest.fn().mockResolvedValue({ upstreamStatus: 200 }),
    ...overrides,
  } as jest.Mocked<UberOrderActionGatewayPort>;
  return {
    repository,
    gateway,
    service: new UberOrderActionService(repository, gateway),
  };
};

describe('UberOrderActionService contract', () => {
  it('creates stable distinct durable intents for each business action', () => {
    const { service } = setup();
    const accept = service.buildIntent({
      externalOrderId: ' order-1 ',
      action: 'ACCEPT',
    });
    const cancel = service.buildIntent({
      externalOrderId: 'order-1',
      action: 'CANCEL',
    });
    const deny = service.buildIntent({
      externalOrderId: 'order-1',
      action: 'DENY',
      denial: { reasonCode: 'OTHER' },
    });

    expect(accept.externalOrderId).toBe('order-1');
    expect(accept.idempotencyKey).toBe(
      service.buildIntent({ externalOrderId: 'order-1', action: 'ACCEPT' })
        .idempotencyKey,
    );
    expect(
      new Set([
        accept.idempotencyKey,
        cancel.idempotencyKey,
        deny.idempotencyKey,
      ]).size,
    ).toBe(3);
  });

  it.each([
    ['ACCEPT', 'accept', 'pending', 'paid'],
    ['DENY', 'deny', 'pending', null],
    ['CANCEL', 'cancel', 'making', 'refunded'],
    ['READY_FOR_PICKUP', 'readyForPickup', 'making', 'ready'],
  ] as const)(
    '%s invokes only its gateway and records the domain transition',
    async (action, method, currentStatus, nextStatus) => {
      const { repository, gateway, service } = setup();
      repository.getOrderContext.mockResolvedValue({
        status: currentStatus,
        totalCents: 1_000,
        referenceAt,
        fulfillmentTiming: 'IMMEDIATE',
        scheduledReadyAt: null,
        externalEstimatedReadyAt: null,
      });

      await service.executeClaimed({
        ...task,
        action,
        reasonCode: action === 'DENY' ? 'ITEM_UNAVAILABLE' : null,
      });

      expect(gateway[method].mock.calls[0][0]).toEqual(
        expect.objectContaining({ externalOrderId: 'order-1' }),
      );
      expect(repository.complete.mock.calls).toContainEqual([
        {
          taskId: 'task-1',
          leaseToken: 'lease-from-claim',
          upstreamStatus: action === 'CANCEL' ? 204 : 200,
          transition: nextStatus
            ? { from: currentStatus, to: nextStatus }
            : null,
        },
      ]);
    },
  );

  it('persists the actual compatible CANCEL 200 success status', async () => {
    const { repository, service } = setup({
      cancel: jest.fn().mockResolvedValue({ upstreamStatus: 200 }),
    });
    repository.getOrderContext.mockResolvedValue({
      status: 'making',
      totalCents: 1_000,
      referenceAt,
      fulfillmentTiming: 'IMMEDIATE',
      scheduledReadyAt: null,
      externalEstimatedReadyAt: null,
    });

    await service.executeClaimed({ ...task, action: 'CANCEL' });

    expect(repository.complete.mock.calls).toContainEqual([
      {
        taskId: 'task-1',
        leaseToken: 'lease-from-claim',
        upstreamStatus: 200,
        transition: { from: 'making', to: 'refunded' },
      },
    ]);
  });

  it.each([
    [1, '2026-08-18T18:10:00.000Z'],
    [1_000, '2026-08-18T18:10:00.000Z'],
    [1_001, '2026-08-18T18:15:00.000Z'],
    [2_000, '2026-08-18T18:15:00.000Z'],
    [2_001, '2026-08-18T18:20:00.000Z'],
    [3_000, '2026-08-18T18:20:00.000Z'],
    [3_001, '2026-08-18T18:25:00.000Z'],
  ])(
    'calculates immediate ACCEPT ready time for %s cents',
    async (totalCents, expected) => {
      const { repository, gateway, service } = setup();
      repository.getOrderContext.mockResolvedValue({
        status: 'pending',
        totalCents,
        referenceAt,
        fulfillmentTiming: 'IMMEDIATE',
        scheduledReadyAt: null,
        externalEstimatedReadyAt: null,
      });

      await service.executeClaimed(task);

      expect(
        gateway.accept.mock.calls[0][0].readyForPickupAt?.toISOString(),
      ).toBe(expected);
    },
  );

  it('uses the Uber preparation estimate for scheduled ACCEPT and only records acceptance', async () => {
    const scheduledReadyAt = new Date('2026-08-19T22:30:00.000Z');
    const { repository, gateway, service } = setup();
    repository.getOrderContext.mockResolvedValue({
      status: 'pending',
      totalCents: 2_500,
      referenceAt,
      fulfillmentTiming: 'SCHEDULED',
      scheduledReadyAt,
      externalEstimatedReadyAt: scheduledReadyAt,
    });

    await service.executeClaimed(task);

    expect(gateway.accept.mock.calls[0][0]).toEqual(
      expect.objectContaining({ readyForPickupAt: scheduledReadyAt }),
    );
    expect(repository.complete.mock.calls).toContainEqual([
      {
        taskId: 'task-1',
        leaseToken: 'lease-from-claim',
        upstreamStatus: 200,
        transition: { from: 'pending', to: 'paid' },
      },
    ]);
  });

  it('does not echo a scheduled delivery-target fallback to Uber as ready_for_pickup_time', async () => {
    const localScheduleTarget = new Date('2026-08-19T23:00:00.000Z');
    const { repository, gateway, service } = setup();
    repository.getOrderContext.mockResolvedValue({
      status: 'pending',
      totalCents: 2_500,
      referenceAt,
      fulfillmentTiming: 'SCHEDULED',
      scheduledReadyAt: localScheduleTarget,
      externalEstimatedReadyAt: null,
    });

    await service.executeClaimed(task);

    expect(gateway.accept.mock.calls[0][0]).toEqual({
      externalOrderId: 'order-1',
      idempotencyKey: 'key-1',
      readyForPickupAt: undefined,
    });
    expect(repository.complete.mock.calls).toContainEqual([
      {
        taskId: 'task-1',
        leaseToken: 'lease-from-claim',
        upstreamStatus: 200,
        transition: { from: 'pending', to: 'paid' },
      },
    ]);
  });

  it.each([
    [408, true],
    [429, true],
    [503, true],
    [400, false],
    [401, false],
    [403, false],
    [404, false],
    [409, false],
    [422, false],
  ])('classifies HTTP %s retryable=%s', async (status, retryable) => {
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
    expect(repository.complete.mock.calls).toHaveLength(0);
  });

  it('keeps claimed work recoverable when local context or success writeback fails', async () => {
    const contextFailure = setup();
    contextFailure.repository.getOrderContext.mockRejectedValue(
      new Error('database unavailable'),
    );
    await expect(contextFailure.service.executeClaimed(task)).rejects.toThrow(
      'database unavailable',
    );
    expect(contextFailure.gateway.accept.mock.calls).toHaveLength(0);
    expect(contextFailure.repository.markFailed.mock.calls).toHaveLength(0);

    const writebackFailure = setup();
    writebackFailure.repository.complete.mockRejectedValue(
      new Error('database unavailable'),
    );
    await expect(writebackFailure.service.executeClaimed(task)).rejects.toThrow(
      'database unavailable',
    );
    expect(writebackFailure.repository.markFailed.mock.calls).toHaveLength(0);
  });
});
