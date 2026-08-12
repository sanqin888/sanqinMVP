import type { UberOrderActionName } from '../../domain/orders/uber-order.types';
import type { UberOrderOutboxPort } from '../ports/uber-order-processing.ports';
import { UberOrderOutboxService } from './uber-order-outbox.service';

type OutboxFake = jest.Mocked<
  Pick<UberOrderOutboxPort, 'claimDue' | 'markSucceeded' | 'markFailed'>
>;
type ExecuteAction = (
  externalOrderId: string,
  action: UberOrderActionName,
  payload: Record<string, unknown>,
  idempotencyKey: string,
) => Promise<unknown>;

const createOutboxFake = (): OutboxFake => ({
  claimDue: jest.fn<UberOrderOutboxPort['claimDue']>(),
  markSucceeded: jest.fn<UberOrderOutboxPort['markSucceeded']>(),
  markFailed: jest.fn<UberOrderOutboxPort['markFailed']>(),
});

describe('UberOrderOutboxService', () => {
  it('retries pending and retryable failed actions with reconstructed deny payloads', async () => {
    const rows = [
      {
        externalOrderId: 'order-1',
        action: 'DENY' as const,
        reasonCode: 'STORE_CLOSED',
        reasonDetail: 'closing',
        taskId: 'task-1',
        leaseToken: 'lease-a',
        idempotencyKey: 'stable-key-v1',
        businessVersion: 'v1',
        status: 'FAILED',
      },
    ];
    const outbox = createOutboxFake();
    outbox.claimDue.mockResolvedValue(rows);
    outbox.markSucceeded.mockResolvedValue(true);
    outbox.markFailed.mockResolvedValue(true);
    const execute = jest.fn<ExecuteAction>().mockResolvedValue({ ok: true });
    const service = new UberOrderOutboxService(outbox);

    await service.processPending(10, execute);
    expect(outbox.claimDue).toHaveBeenCalledWith(10);
    expect(execute).toHaveBeenCalledWith(
      'order-1',
      'DENY',
      { reasonCode: 'STORE_CLOSED', reasonDetail: 'closing' },
      'stable-key-v1',
    );
    expect(outbox.markSucceeded).toHaveBeenCalledWith(rows[0]);
  });

  it('uses the persisted key again when a different worker reclaims the task', async () => {
    const row = {
      taskId: 'task-1',
      leaseToken: 'lease-b',
      externalOrderId: 'order-1',
      action: 'ACCEPT' as const,
      reasonCode: null,
      reasonDetail: null,
      idempotencyKey: 'stable-key-v1',
      businessVersion: 'v1',
    };
    const outbox = createOutboxFake();
    outbox.claimDue.mockResolvedValue([row]);
    outbox.markSucceeded.mockResolvedValue(true);
    const service = new UberOrderOutboxService(outbox);
    const firstWorker = jest
      .fn<ExecuteAction>()
      .mockResolvedValue({ ok: true });
    const secondWorker = jest
      .fn<ExecuteAction>()
      .mockResolvedValue({ ok: true });

    await service.processPending(1, firstWorker);
    await service.processPending(1, secondWorker);
    expect(firstWorker).toHaveBeenCalledWith(
      'order-1',
      'ACCEPT',
      {},
      'stable-key-v1',
    );
    expect(secondWorker).toHaveBeenCalledWith(
      'order-1',
      'ACCEPT',
      {},
      'stable-key-v1',
    );
  });

  it('rejects an execution result when its success commit lost the lease', async () => {
    const row = {
      taskId: 'task-1',
      leaseToken: 'expired-lease',
      externalOrderId: 'order-1',
      action: 'ACCEPT' as const,
      reasonCode: null,
      reasonDetail: null,
      idempotencyKey: 'stable-key-v1',
      businessVersion: 'v1',
    };
    const outbox = createOutboxFake();
    outbox.claimDue.mockResolvedValue([row]);
    outbox.markSucceeded.mockResolvedValue(false);
    outbox.markFailed.mockResolvedValue(false);
    const service = new UberOrderOutboxService(outbox);
    const execute = jest.fn<ExecuteAction>().mockResolvedValue({ ok: true });

    await expect(service.processPending(1, execute)).rejects.toThrow(
      'lease lost before success commit',
    );
    expect(outbox.markFailed).toHaveBeenCalledWith(row, expect.any(Error));
  });
});
