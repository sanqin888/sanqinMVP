import {
  Injectable,
  Logger,
  OnApplicationBootstrap,
  OnModuleDestroy,
} from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import {
  ORDER_ACCEPTED_LIFECYCLE_EVENT,
  ORDER_LIFECYCLE_OUTBOX_SOURCE,
  ORDER_PREP_STARTED_LIFECYCLE_EVENT,
} from '../order-lifecycle';
import { OrderPreparationService } from '../order-preparation.service';
import { FulfillmentProcessor } from './fulfillment.processor';

export {
  ORDER_ACCEPTED_LIFECYCLE_EVENT,
  ORDER_LIFECYCLE_OUTBOX_SOURCE,
  ORDER_PREP_STARTED_LIFECYCLE_EVENT,
} from '../order-lifecycle';

const DEFAULT_POLL_INTERVAL_MS = 500;

type DurableOrderEvent = {
  id: string;
  orderId: string;
  orderStableId: string;
};

/**
 * API-process consumer for append-only Order lifecycle events.
 *
 * order.accepted is materialized into local preparation for immediate orders.
 * order.prep_started is materialized into the unique AUTO PosPrintJob. Durable
 * facts plus database locks make both stages replayable after process restarts.
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
    private readonly preparation: OrderPreparationService,
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
      if (await this.processPrepStartedLocked()) {
        completed += 1;
        continue;
      }
      if (await this.processImmediateAcceptedLocked()) {
        completed += 1;
        continue;
      }
      break;
    }
    return completed;
  }

  private async pollSafely(): Promise<void> {
    if (this.polling) return;
    this.polling = true;
    try {
      await this.processOnce();
    } catch (error) {
      // No acknowledgement is written before the durable next-stage fact or
      // AUTO print job exists, so failures remain eligible for replay.
      this.logger.error({
        event: 'order_lifecycle_outbox_processing_failed',
        errorType: error instanceof Error ? error.name : 'UnknownError',
      });
    } finally {
      this.polling = false;
    }
  }

  private async processPrepStartedLocked(): Promise<boolean> {
    return this.prisma.$transaction(async (tx) => {
      const rows = await tx.$queryRaw<DurableOrderEvent[]>`
        SELECT event.id,
          orders.id::text AS "orderId",
          orders."orderStableId" AS "orderStableId"
        FROM "OpsEvent" event
        JOIN "Order" orders
          ON orders.id::text = event.payload->>'orderId'
          AND orders."orderStableId" = event.payload->>'orderStableId'
        WHERE event.source = ${ORDER_LIFECYCLE_OUTBOX_SOURCE}
          AND event."eventName" = ${ORDER_PREP_STARTED_LIFECYCLE_EVENT}
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

  private async processImmediateAcceptedLocked(): Promise<boolean> {
    return this.prisma.$transaction(async (tx) => {
      const rows = await tx.$queryRaw<DurableOrderEvent[]>`
        SELECT event.id,
          orders.id::text AS "orderId",
          orders."orderStableId" AS "orderStableId"
        FROM "OpsEvent" event
        JOIN "Order" orders
          ON orders.id::text = event.payload->>'orderId'
          AND orders."orderStableId" = event.payload->>'orderStableId'
        WHERE event.source = ${ORDER_LIFECYCLE_OUTBOX_SOURCE}
          AND event."eventName" = ${ORDER_ACCEPTED_LIFECYCLE_EVENT}
          AND orders."fulfillmentTiming" = 'IMMEDIATE'::"OrderFulfillmentTiming"
          AND orders.status IN ('pending'::"OrderStatus", 'paid'::"OrderStatus")
          AND NOT EXISTS (
            SELECT 1 FROM "OpsEvent" prep
            WHERE prep.source = ${ORDER_LIFECYCLE_OUTBOX_SOURCE}
              AND prep."eventName" = ${ORDER_PREP_STARTED_LIFECYCLE_EVENT}
              AND prep.payload->>'orderId' = orders.id::text
          )
        ORDER BY event."createdAt" ASC, event.id ASC
        FOR UPDATE OF event SKIP LOCKED
        LIMIT 1
      `;
      const item = rows[0];
      if (!item) return false;

      await this.preparation.activateAcceptedImmediateOrder(item.orderId);
      return true;
    });
  }

  private readPositiveMs(raw: string | undefined, fallback: number): number {
    const parsed = Number(raw);
    return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
  }
}
