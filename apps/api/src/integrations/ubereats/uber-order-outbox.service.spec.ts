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
    const prismaAccess = {
      uberOrderActionDelegate: { findMany: jest.fn().mockResolvedValue(rows) },
    };
    const actions = {
      buildDenyPayload: jest
        .fn()
        .mockReturnValue({ reason: { code: 'STORE_CLOSED' } }),
    };
    const execute = jest.fn().mockResolvedValue({ ok: true });
    const service = new UberOrderOutboxService(
      prismaAccess as never,
      actions as never,
    );
    await service.processPending(10, execute);
    expect(prismaAccess.uberOrderActionDelegate.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ take: 10 }),
    );
    expect(execute).toHaveBeenCalledWith('order-1', 'DENY', {
      reason: { code: 'STORE_CLOSED' },
    });
  });
});
