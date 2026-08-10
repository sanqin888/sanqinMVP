import { UberOrderOutboxService } from './uber-order-outbox.service';

describe('UberOrderOutboxService', () => {
  it('retries pending and retryable failed actions with reconstructed deny payloads', async () => {
    const rows = [
      {
        externalOrderId: 'order-1',
        action: 'DENY',
        reasonCode: 'STORE_CLOSED',
        reasonDetail: 'closing',
        taskId: 'task-1',
        idempotencyKey: 'stable-key-v1',
        businessVersion: 'v1',
        status: 'FAILED',
      },
    ];
    const outbox = {
      claimDue: jest.fn().mockResolvedValue(rows),
      markSucceeded: jest.fn().mockResolvedValue(undefined),
      markFailed: jest.fn().mockResolvedValue(undefined),
    };
    const actions = {
      buildDenyPayload: jest
        .fn()
        .mockReturnValue({ reason: { code: 'STORE_CLOSED' } }),
    };
    const execute = jest.fn().mockResolvedValue({ ok: true });
    const service = new UberOrderOutboxService(
      outbox as never,
      actions as never,
    );
    await service.processPending(10, execute);
    expect(outbox.claimDue).toHaveBeenCalledWith(10);
    expect(execute).toHaveBeenCalledWith(
      'order-1',
      'DENY',
      {
        reason: { code: 'STORE_CLOSED' },
      },
      'stable-key-v1',
    );
    expect(outbox.markSucceeded).toHaveBeenCalledWith('order-1', 'DENY');
  });

  it('uses the persisted key again when a different worker reclaims the task', async () => {
    const row = {
      taskId: 'task-1',
      externalOrderId: 'order-1',
      action: 'ACCEPT',
      reasonCode: null,
      reasonDetail: null,
      idempotencyKey: 'stable-key-v1',
      businessVersion: 'v1',
    };
    const outbox = {
      claimDue: jest.fn().mockResolvedValue([row]),
      markSucceeded: jest.fn(),
      markFailed: jest.fn(),
    };
    const service = new UberOrderOutboxService(
      outbox as never,
      {
        buildDenyPayload: jest.fn(),
      } as never,
    );
    const firstWorker = jest.fn().mockResolvedValue({ ok: true });
    const secondWorker = jest.fn().mockResolvedValue({ ok: true });

    await service.processPending(1, firstWorker);
    await service.processPending(1, secondWorker);

    expect(firstWorker.mock.calls[0][3]).toBe('stable-key-v1');
    expect(secondWorker.mock.calls[0][3]).toBe('stable-key-v1');
  });
});
