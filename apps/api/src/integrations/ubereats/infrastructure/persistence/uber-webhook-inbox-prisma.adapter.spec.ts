jest.mock('@prisma/client', () => ({
  Prisma: { DbNull: null },
  PrismaClient: class {},
}));

import { UberWebhookInboxPrismaAdapter } from './uber-webhook-inbox-prisma.adapter';

describe('UberWebhookInboxPrismaAdapter claim concurrency', () => {
  it('claims only the oldest unfinished event per resource while allowing other resources', async () => {
    let sql = '';
    const prisma = {
      $queryRaw: jest.fn((parts: TemplateStringsArray) => {
        sql = parts.join('?');
        return Promise.resolve([
          {
            eventId: 'order-a-1',
            eventType: 'orders.notification',
            payload: {},
            idempotencyKey: 'key-a',
            businessVersion: 'v1',
            resourceKey: 'order:a',
          },
          {
            eventId: 'order-b-1',
            eventType: 'orders.notification',
            payload: {},
            idempotencyKey: 'key-b',
            businessVersion: 'v1',
            resourceKey: 'order:b',
          },
        ]);
      }),
    };
    const adapter = new UberWebhookInboxPrismaAdapter(
      prisma as never,
      {} as never,
      { workerLeaseDurationMs: 30_000 } as never,
    );

    const claimed = await adapter.claimDue(10);

    expect(claimed).toHaveLength(2);
    expect(new Set(claimed.map((row) => row.resourceKey))).toEqual(
      new Set(['order:a', 'order:b']),
    );
    expect(sql).toContain('NOT EXISTS');
    expect(sql).toContain("earlier.status NOT IN ('PROCESSED', 'DEAD')");
    expect(sql).toContain("candidate.status = 'PROCESSING'");
    expect(sql).toContain('candidate."leaseExpiresAt" <= NOW()');
    expect(sql).toContain('FOR UPDATE OF candidate SKIP LOCKED');
  });
});
