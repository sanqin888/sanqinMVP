import { LoyaltyLedgerReadService } from './loyalty-ledger-read.service';

describe('LoyaltyLedgerReadService', () => {
  it('returns the persisted order stable identity without querying Order persistence', async () => {
    const createdAt = new Date('2026-09-05T12:00:00.000Z');
    const loyaltyLedgerFindMany = jest.fn().mockResolvedValue([
      {
        ledgerStableId: 'cledgerstable0000000000001',
        createdAt,
        type: 'EARN_ON_PURCHASE',
        target: 'POINTS',
        orderStableId: 'corderstable0000000000001',
        deltaMicro: 2_500_000n,
        balanceAfterMicro: 12_500_000n,
        note: 'earned',
      },
      {
        ledgerStableId: 'cledgerstable0000000000002',
        createdAt,
        type: 'ADJUSTMENT_MANUAL',
        target: 'POINTS',
        orderStableId: null,
        deltaMicro: 1_000_000n,
        balanceAfterMicro: 13_500_000n,
        note: null,
      },
    ]);
    const prisma = {
      loyaltyLedger: { findMany: loyaltyLedgerFindMany },
    };
    const loyalty = {
      resolveUserIdByStableId: jest.fn().mockResolvedValue('member-db-id'),
      ensureAccount: jest.fn().mockResolvedValue({ id: 'account-db-id' }),
    };
    const service = new LoyaltyLedgerReadService(
      prisma as never,
      loyalty as never,
    );

    await expect(
      service.getLoyaltyLedger({
        userStableId: 'cmemberstable0000000000001',
        limit: 50,
        target: 'POINTS',
      }),
    ).resolves.toEqual({
      entries: [
        {
          ledgerStableId: 'cledgerstable0000000000001',
          createdAt: createdAt.toISOString(),
          type: 'EARN_ON_PURCHASE',
          target: 'POINTS',
          deltaPoints: 2.5,
          balanceAfterPoints: 12.5,
          note: 'earned',
          orderStableId: 'corderstable0000000000001',
        },
        {
          ledgerStableId: 'cledgerstable0000000000002',
          createdAt: createdAt.toISOString(),
          type: 'ADJUSTMENT_MANUAL',
          target: 'POINTS',
          deltaPoints: 1,
          balanceAfterPoints: 13.5,
          note: undefined,
        },
      ],
    });

    expect(loyaltyLedgerFindMany).toHaveBeenCalledWith({
      where: { accountId: 'account-db-id', target: 'POINTS' },
      orderBy: { createdAt: 'desc' },
      take: 50,
      select: {
        ledgerStableId: true,
        createdAt: true,
        type: true,
        target: true,
        orderStableId: true,
        deltaMicro: true,
        balanceAfterMicro: true,
        note: true,
      },
    });
    expect('order' in prisma).toBe(false);
  });
});
