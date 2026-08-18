import {
  Injectable,
  Logger,
  OnApplicationBootstrap,
  OnModuleDestroy,
} from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { FulfillmentProcessor } from './fulfillment.processor';

export const ORDER_LIFECYCLE_OUTBOX_SOURCE = 'orders.lifecycle';
export const ORDER_ACCEPTED_LIFECYCLE_EVENT = 'order.accepted';

const DEFAULT_POLL_INTERVAL_MS = 500;

type DurableAcceptedEvent = {
  id: string;
  orderId: string;
  orderStableId: string;
};

/**
 * API-process consumer for append-only Order lifecycle events.
 *
 * OpsEvent is the durable event log; the unique AUTO PosPrintJob is the durable
 * materialized acknowledgement. A database row lock prevents concurrent API
 * consumers from dispatching the same unmaterialized event, while a process
 * crash simply releases the lock so the event can be replayed.
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
  private timer: NodeJS.Timeout | null = null;
  private polling = false;

  constructor(
    private readonly prisma: PrismaService,
    private readonly fulfillment: FulfillmentProcessor,
  ) {}

  onApplicationBootstrap(): void {
    this.timer = setInterval(() => void this.pollSafely(), this.pollIntervalMs);
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
      const processed = await this.processOneLocked();
      if (!processed) break;
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
      // No acknowledgement is written before the AUTO print job exists. A
      // failure therefore leaves the append-only event eligible for replay.
      this.logger.error({
        event: 'order_lifecycle_outbox_processing_failed',
        errorType: error instanceof Error ? error.name : 'UnknownError',
      });
    } finally {
      this.polling = false;
    }
  }

  private async processOneLocked(): Promise<boolean> {
    return this.prisma.$transaction(async (tx) => {
      const rows = await tx.$queryRaw<DurableAcceptedEvent[]>`
        SELECT event.id,
          event.payload->>'orderId' AS "orderId",
          event.payload->>'orderStableId' AS "orderStableId"
        FROM "OpsEvent" event
        WHERE event.source = ${ORDER_LIFECYCLE_OUTBOX_SOURCE}
          AND event."eventName" = ${ORDER_ACCEPTED_LIFECYCLE_EVENT}
          AND event.payload->>'orderId' IS NOT NULL
          AND event.payload->>'orderStableId' IS NOT NULL
          AND NOT EXISTS (
            SELECT 1 FROM "PosPrintJob" job
            WHERE job."orderStableId" = event.payload->>'orderStableId'
              AND job.kind = 'AUTO'
          )
        ORDER BY event."createdAt" ASC, event.id ASC
        FOR UPDATE OF event SKIP LOCKED
        LIMIT 1
      `;
      const item = rows[0];
      if (!item) return false;

      await this.fulfillment.handleAcceptedLifecycle({
        orderId: item.orderId,
      });
      return true;
    });
  }

  private readPositiveMs(raw: string | undefined, fallback: number): number {
    const parsed = Number(raw);
    return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
  }
}
