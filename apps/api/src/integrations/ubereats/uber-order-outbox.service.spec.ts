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
    const prisma = { $queryRaw: jest.fn().mockResolvedValue(rows) };
    const prismaAccess = { uberOrderActionDelegate: {} };
    const actions = {
      buildDenyPayload: jest
        .fn()
        .mockReturnValue({ reason: { code: 'STORE_CLOSED' } }),
    };
    const execute = jest.fn().mockResolvedValue({ ok: true });
    const service = new UberOrderOutboxService(
      prisma as never,
      prismaAccess as never,
      actions as never,
    );
    await service.processPending(10, execute);
    expect(prisma.$queryRaw).toHaveBeenCalled();
    expect(execute).toHaveBeenCalledWith('order-1', 'DENY', {
      reason: { code: 'STORE_CLOSED' },
    });
  });
});
