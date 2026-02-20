import { AuthChallengeStatus, Prisma } from '@prisma/client';
import { DataRetentionService } from './data-retention.service';

type DeleteManyArgs = { where: Record<string, unknown> };

describe('DataRetentionService', () => {
  const withCount = (count: number) => Promise.resolve({ count });

  function createService() {
    const tx = {
      userSession: { deleteMany: jest.fn().mockReturnValue(withCount(1)) },
      trustedDevice: { deleteMany: jest.fn().mockReturnValue(withCount(2)) },
      authChallenge: { deleteMany: jest.fn().mockReturnValue(withCount(3)) },
      userInvite: { deleteMany: jest.fn().mockReturnValue(withCount(4)) },
      checkoutIntent: { deleteMany: jest.fn().mockReturnValue(withCount(5)) },
      messagingWebhookEvent: {
        updateMany: jest.fn().mockReturnValue(withCount(6)),
        deleteMany: jest.fn().mockReturnValue(withCount(7)),
      },
      messagingDeliveryEvent: {
        deleteMany: jest.fn().mockReturnValue(withCount(8)),
      },
      messagingSend: {
        deleteMany: jest.fn().mockReturnValue(withCount(9)),
      },
    };

    const prisma = {
      $transaction: jest.fn(
        async (callback: (txArg: typeof tx) => Promise<unknown>) =>
          callback(tx),
      ),
    };

    const service = new DataRetentionService(prisma as never);

    return { service, prisma, tx };
  }

  it('applies all retention conditions with expected thresholds', async () => {
    const { service, tx } = createService();
    const now = new Date('2026-02-18T00:00:00.000Z');

    const result = await service.runCleanup(now);

    expect(result).toEqual({
      userSessionsDeleted: 1,
      trustedDevicesDeleted: 2,
      authChallengesDeleted: 3,
      userInvitesDeleted: 4,
      checkoutIntentsDeleted: 5,
      webhookEventsPayloadTrimmed: 6,
      webhookEventsDeleted: 7,
      deliveryEventsDeleted: 8,
      messagingSendsDeleted: 9,
    });

    expect(tx.userSession.deleteMany).toHaveBeenCalledWith({
      where: { expiresAt: { lt: now } },
    });
    expect(tx.trustedDevice.deleteMany).toHaveBeenCalledWith({
      where: { expiresAt: { lt: now } },
    });

    const authDeleteManyCalls = tx.authChallenge.deleteMany.mock
      .calls as DeleteManyArgs[][];
    const authChallengeArgs = authDeleteManyCalls[0][0];
    const statusIn = authChallengeArgs.where.status as { in: string[] };
    expect(statusIn.in).toEqual([
      AuthChallengeStatus.CONSUMED,
      AuthChallengeStatus.REVOKED,
    ]);

    const consumedAt = authChallengeArgs.where.consumedAt as { lt: Date };
    expect(consumedAt.lt.toISOString()).toBe('2026-01-19T00:00:00.000Z');

    const inviteDeleteManyCalls = tx.userInvite.deleteMany.mock
      .calls as DeleteManyArgs[][];
    const inviteArgs = inviteDeleteManyCalls[0][0];
    const inviteOr = inviteArgs.where.OR as Array<Record<string, unknown>>;

    expect(inviteOr).toHaveLength(3);
    expect(inviteOr[0]).toEqual({
      expiresAt: { lt: now },
      usedAt: null,
    });

    const usedAt = inviteOr[1].usedAt as { lt: Date };
    expect(usedAt.lt.toISOString()).toBe('2025-11-20T00:00:00.000Z');

    const revokedAt = inviteOr[2].revokedAt as { lt: Date };
    expect(revokedAt.lt.toISOString()).toBe('2026-01-19T00:00:00.000Z');

    expect(tx.checkoutIntent.deleteMany).toHaveBeenCalledWith({
      where: {
        status: { not: 'succeeded' },
        createdAt: { lt: new Date('2026-02-04T00:00:00.000Z') },
      },
    });

    expect(tx.messagingWebhookEvent.updateMany).toHaveBeenCalledWith({
      where: {
        createdAt: { lt: new Date('2026-01-19T00:00:00.000Z') },
        OR: [
          { rawBody: { not: null } },
          { headersJson: { not: Prisma.AnyNull } },
          { paramsJson: { not: Prisma.AnyNull } },
        ],
      },
      data: {
        rawBody: null,
        headersJson: Prisma.DbNull,
        paramsJson: Prisma.DbNull,
      },
    });

    expect(tx.messagingWebhookEvent.deleteMany).toHaveBeenCalledWith({
      where: {
        createdAt: { lt: new Date('2026-01-19T00:00:00.000Z') },
      },
    });

    expect(tx.messagingDeliveryEvent.deleteMany).toHaveBeenCalledWith({
      where: {
        createdAt: { lt: new Date('2025-08-22T00:00:00.000Z') },
      },
    });

    expect(tx.messagingSend.deleteMany).toHaveBeenCalledWith({
      where: {
        createdAt: { lt: new Date('2024-02-19T00:00:00.000Z') },
      },
    });
  });

  it('skips run when one cleanup is already in progress', async () => {
    const { service, prisma } = createService();
    let release!: () => void;

    prisma.$transaction.mockImplementationOnce(
      () =>
        new Promise((resolve) => {
          release = () =>
            resolve({
              userSessionsDeleted: 0,
              trustedDevicesDeleted: 0,
              authChallengesDeleted: 0,
              userInvitesDeleted: 0,
              checkoutIntentsDeleted: 0,
              webhookEventsPayloadTrimmed: 0,
              webhookEventsDeleted: 0,
              deliveryEventsDeleted: 0,
              messagingSendsDeleted: 0,
            });
        }),
    );

    const pendingRun = service.runCleanup();
    const skippedRun = await service.runCleanup();

    expect(skippedRun).toBeNull();

    release();
    await pendingRun;
  });

  it('returns null when retention cleanup throws', async () => {
    const { service, prisma } = createService();
    prisma.$transaction.mockRejectedValueOnce(new Error('boom'));

    await expect(service.runCleanup()).resolves.toBeNull();
  });
});
