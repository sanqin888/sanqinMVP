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
            resultKind: 'CLAIMED',
            eventId: 'order-a-1',
            eventType: 'orders.notification',
            payload: {},
            idempotencyKey: 'key-a',
            businessVersion: 'v1',
            resourceKey: 'order:a',
          },
          {
            resultKind: 'CLAIMED',
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

  it('automatically dead-letters an eighth crashed attempt and then claims the next event for the resource', async () => {
    const telemetry = { captureEvent: jest.fn().mockResolvedValue(undefined) };
    const prisma = {
      $queryRaw: jest
        .fn()
        .mockResolvedValueOnce([
          {
            resultKind: 'AUTO_DEAD',
            eventId: 'order-a-1',
            eventType: null,
            payload: null,
            idempotencyKey: null,
            businessVersion: null,
            resourceKey: null,
          },
          {
            resultKind: 'CLAIMED',
            eventId: 'order-a-2',
            eventType: 'orders.notification',
            payload: {},
            idempotencyKey: 'key-a-2',
            businessVersion: 'v1',
            resourceKey: 'order:a',
          },
        ])
        .mockResolvedValueOnce([]),
    };
    const adapter = new UberWebhookInboxPrismaAdapter(
      prisma as never,
      { workerLeaseDurationMs: 30_000 } as never,
      telemetry as never,
    );

    const claimed = await adapter.claimDue(10);

    expect(claimed.map((row) => row.eventId)).toEqual(['order-a-2']);
    expect(telemetry.captureEvent).toHaveBeenCalledWith(
      'ubereats_webhook_inbox_auto_dead',
      expect.objectContaining({
        attempt: 8,
        reason: 'maximum_attempts_exhausted',
      }),
      { eventId: 'order-a-1' },
    );

    const firstCall = prisma.$queryRaw.mock.calls[0] as unknown as [
      TemplateStringsArray,
    ];
    const sql = firstCall[0].join('?');
    expect(sql).toContain('WITH exhausted AS');
    expect(sql).toContain('exhausted."leaseExpiresAt" <= NOW()');
    expect(sql).toContain('Maximum webhook processing attempts exhausted');
    expect(sql).toContain("SELECT 'AUTO_DEAD'");
    expect(sql).toContain('AND NOT (earlier."attemptCount" >=');
  });
});
