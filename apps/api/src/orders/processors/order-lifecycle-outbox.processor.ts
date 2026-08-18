import {
  Injectable,
  Logger,
  OnApplicationBootstrap,
  OnModuleDestroy,
} from '@nestjs/common';
import { randomUUID } from 'crypto';
import { PrismaService } from '../../prisma/prisma.service';
import { FulfillmentProcessor } from './fulfillment.processor';

export const ORDER_ACCEPTED_LIFECYCLE_EVENT = 'ORDER_ACCEPTED';

const DEFAULT_POLL_INTERVAL_MS = 500;
const DEFAULT_LEASE_DURATION_MS = 30_000;
const RETRY_BASE_MS = 1_000;
const RETRY_MAX_MS = 60_000;

type ClaimedLifecycleEvent = {
  id: string;
  leaseToken: string;
  orderId: string;
  orderStableId: string;
  eventType: string;
  attemptCount: number;
};

/**
 * API-process consumer for durable Order lifecycle events.
 *
 * Producers only persist lifecycle facts. POS/Fulfillment dependencies remain
 * in the Orders context, so external workers never need to reach into them.
 */
@Injectable()
export class OrderLifecycleOutboxProcessor
  implements OnApplicationBootstrap, OnModuleDestroy
{
  private readonly logger = new Logger(OrderLifecycleOutboxProcessor.name);
  private readonly pollIntervalMs = this.readPositiveMs(
    process.env.ORDER_LIFECYCLE_OUTBOX_POLL_MS,
    DEFAULT_POLL_INTERVAL_MS,
  );
  private readonly leaseDurationMs = this.readPositiveMs(
    process.env.ORDER_LIFECYCLE_OUTBOX_LEASE_MS,
    DEFAULT_LEASE_DURATION_MS,
  );
  private timer: NodeJS.Timeout | null = null;
  private polling = false;

  constructor(
    private readonly prisma: PrismaService,
    private readonly fulfillment: FulfillmentProcessor,
  ) {}

  onApplicationBootstrap(): void {
    this.timer = setInterval(
      () => void this.pollSafely(),
      this.pollIntervalMs,
    );
    this.timer.unref();
    void this.pollSafely();
  }

  onModuleDestroy(): void {
    if (this.timer) clearInterval(this.timer);
    this.timer = null;
  }

  /** Public for deterministic worker/replay tests and operational draining. */
  async processOnce(limit = 25): Promise<number> {
    let completed = 0;
    for (let index = 0; index < limit; index += 1) {
      // Claim immediately before processing so a slow predecessor never burns
      // the leases of rows waiting behind it.
      const item = await this.claimOne(new Date());
      if (!item) break;
      await this.processClaimed(item);
      completed += 1;
    }
    return completed;
  }

  private async pollSafely(): Promise<void> {
    if (this.polling) return;
    this.polling = true;
    try {
      await this.processOnce();
    } catch (error) {
      this.logger.error({
        event: 'order_lifecycle_outbox_poll_failed',
        errorType: error instanceof Error ? error.name : 'UnknownError',
      });
    } finally {
      this.polling = false;
    }
  }

  private async claimOne(now: Date): Promise<ClaimedLifecycleEvent | null> {
    const leasePrefix = `${process.pid}:${randomUUID()}`;
    const leaseExpiresAt = new Date(now.getTime() + this.leaseDurationMs);
    const rows = await this.prisma.$queryRaw<ClaimedLifecycleEvent[]>`
      WITH candidate AS (
        SELECT id FROM "OrderLifecycleOutbox"
        WHERE (
          (status IN ('PENDING', 'FAILED')
            AND ("nextRetryAt" IS NULL OR "nextRetryAt" <= ${now}))
          OR (status = 'PROCESSING' AND "leaseExpiresAt" < ${now})
        )
        ORDER BY "createdAt" ASC, id ASC
        FOR UPDATE SKIP LOCKED
        LIMIT 1
      )
      UPDATE "OrderLifecycleOutbox" outbox
      SET status = 'PROCESSING',
          "leaseToken" = ${leasePrefix} || ':' || outbox.id::text,
          "leaseExpiresAt" = ${leaseExpiresAt},
          "attemptCount" = outbox."attemptCount" + 1,
          "updatedAt" = ${now}
      FROM candidate
      WHERE outbox.id = candidate.id
      RETURNING outbox.id, outbox."leaseToken", outbox."orderId",
        outbox."orderStableId", outbox."eventType", outbox."attemptCount"
    `;
    return rows[0] ?? null;
  }

  private async processClaimed(item: ClaimedLifecycleEvent): Promise<void> {
    try {
      if (item.eventType !== ORDER_ACCEPTED_LIFECYCLE_EVENT) {
        throw new Error(`Unsupported order lifecycle event: ${item.eventType}`);
      }

      await this.fulfillment.handleAcceptedLifecycle({
        orderId: item.orderId,
      });

      const committed = await this.prisma.orderLifecycleOutbox.updateMany({
        where: {
          id: item.id,
          status: 'PROCESSING',
          leaseToken: item.leaseToken,
        },
        data: {
          status: 'PROCESSED',
          processedAt: new Date(),
          nextRetryAt: null,
          leaseToken: null,
          leaseExpiresAt: null,
          lastError: null,
        },
      });
      if (committed.count !== 1) {
        this.logger.warn({
          event: 'order_lifecycle_outbox_lease_lost',
          lifecycleEventId: item.id,
          orderStableId: item.orderStableId,
          operation: 'markSucceeded',
        });
      }
    } catch (error) {
      const retryDelayMs = Math.min(
        RETRY_MAX_MS,
        RETRY_BASE_MS * 2 ** Math.max(0, item.attemptCount - 1),
      );
      const failed = await this.prisma.orderLifecycleOutbox.updateMany({
        where: {
          id: item.id,
          status: 'PROCESSING',
          leaseToken: item.leaseToken,
        },
        data: {
          status: 'FAILED',
          nextRetryAt: new Date(Date.now() + retryDelayMs),
          leaseToken: null,
          leaseExpiresAt: null,
          lastError: (error instanceof Error ? error.message : String(error)).slice(
            0,
            2_000,
          ),
        },
      });
      if (failed.count !== 1) {
        this.logger.warn({
          event: 'order_lifecycle_outbox_lease_lost',
          lifecycleEventId: item.id,
          orderStableId: item.orderStableId,
          operation: 'markFailed',
        });
        return;
      }
      this.logger.error({
        event: 'order_lifecycle_outbox_processing_failed',
        lifecycleEventId: item.id,
        orderStableId: item.orderStableId,
        attempt: item.attemptCount,
        retryDelayMs,
        errorType: error instanceof Error ? error.name : 'UnknownError',
      });
    }
  }

  private readPositiveMs(raw: string | undefined, fallback: number): number {
    const parsed = Number(raw);
    return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
  }
}
