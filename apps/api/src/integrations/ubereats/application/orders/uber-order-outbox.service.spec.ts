import { UberOrderOutboxService } from './uber-order-outbox.service';

describe('UberOrderOutboxService', () => {
  it('retries pending and retryable failed actions with reconstructed deny payloads', async () => {
    const rows = [
      {
        externalOrderId: 'order-1',
        action: 'DENY',
        reasonCode: 'STORE_CLOSED',
        reasonDetail: 'closing',
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
    expect(execute).toHaveBeenCalledWith('order-1', 'DENY', {
      reason: { code: 'STORE_CLOSED' },
    });
    expect(outbox.markSucceeded).toHaveBeenCalledWith('order-1', 'DENY');
  });
});
