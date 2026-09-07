import {
  Injectable,
  Logger,
  OnApplicationBootstrap,
  OnModuleDestroy,
} from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import {
  ORDER_ACCEPTED_LIFECYCLE_EVENT,
  ORDER_CANCELLED_LIFECYCLE_EVENT,
  ORDER_CANCELLATION_PRINT_HANDOFF_LIFECYCLE_EVENT,
  ORDER_INITIAL_PRINT_HANDOFF_LIFECYCLE_EVENT,
  ORDER_LIFECYCLE_OUTBOX_SOURCE,
  ORDER_PREP_STARTED_LIFECYCLE_EVENT,
  orderCancellationPrintHandoffIdempotencyKey,
  orderInitialPrintHandoffIdempotencyKey,
} from '../order-lifecycle';
import { OrderPreparationService } from '../order-preparation.service';
import { FulfillmentProcessor } from './fulfillment.processor';

export {
  ORDER_ACCEPTED_LIFECYCLE_EVENT,
  ORDER_CANCELLED_LIFECYCLE_EVENT,
  ORDER_CANCELLATION_PRINT_HANDOFF_LIFECYCLE_EVENT,
  ORDER_INITIAL_PRINT_HANDOFF_LIFECYCLE_EVENT,
  ORDER_LIFECYCLE_OUTBOX_SOURCE,
  ORDER_PREP_STARTED_LIFECYCLE_EVENT,
} from '../order-lifecycle';

const DEFAULT_POLL_INTERVAL_MS = 500;

type DurableOrderEvent = {
  id: string;
  orderId: string;
  orderStableId: string;
};

type DurableOrderCancellationEvent = DurableOrderEvent & {
  reason: string | null;
  operatorName: string | null;
};

/**
 * API-process consumer for append-only Order lifecycle events.
 *
 * order.accepted is materialized into local preparation for immediate orders.
 * order.prep_started is handed to the Print owner, then checkpointed as
 * order.initial_print_handoff. Durable facts plus database locks make both stages
 * replayable after process restarts without reading Print-owned persistence.
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

  /**
   * Eagerly asks the same durable consumer to drain after a producer commits.
   * If a poll is already running, the normal interval remains the recovery path.
   */
  requestDrain(): void {
    void this.pollSafely();
  }

  /** Public for deterministic worker/replay tests and operational draining. */
  async processOnce(limit = 25): Promise<number> {
    let completed = 0;
    for (let index = 0; index < limit; index += 1) {
      if (await this.processPrepStartedLocked()) {
        completed += 1;
        continue;
      }
      if (await this.processCancellationLocked()) {
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
          ON orders."orderStableId" = event.payload->>'orderStableId'
        WHERE event.source = ${ORDER_LIFECYCLE_OUTBOX_SOURCE}
          AND event."eventName" = ${ORDER_PREP_STARTED_LIFECYCLE_EVENT}
          AND event.payload->>'orderStableId' IS NOT NULL
          AND orders.status <> 'refunded'::"OrderStatus"
          AND NOT EXISTS (
            SELECT 1 FROM "OpsEvent" handoff
            WHERE handoff.source = ${ORDER_LIFECYCLE_OUTBOX_SOURCE}
              AND handoff."eventName" = ${ORDER_INITIAL_PRINT_HANDOFF_LIFECYCLE_EVENT}
              AND handoff.payload->>'orderStableId' = orders."orderStableId"
          )
        ORDER BY event."createdAt" ASC, event.id ASC
        FOR UPDATE OF event SKIP LOCKED
        LIMIT 1
      `;
      const item = rows[0];
      if (!item) return false;

      const handoff = await this.fulfillment.handleAcceptedLifecycle({
        orderId: item.orderId,
      });
      if (!handoff) return false;
      await tx.opsEvent.createMany({
        data: {
          idempotencyKey: orderInitialPrintHandoffIdempotencyKey(
            item.orderStableId,
          ),
          eventName: ORDER_INITIAL_PRINT_HANDOFF_LIFECYCLE_EVENT,
          source: ORDER_LIFECYCLE_OUTBOX_SOURCE,
          payload: { orderStableId: item.orderStableId },
        },
        skipDuplicates: true,
      });
      return true;
    });
  }

  private async processCancellationLocked(): Promise<boolean> {
    return this.prisma.$transaction(async (tx) => {
      const rows = await tx.$queryRaw<DurableOrderCancellationEvent[]>`
        SELECT event.id,
          orders.id::text AS "orderId",
          orders."orderStableId" AS "orderStableId",
          event.payload->>'reason' AS reason,
          event.payload->>'operatorName' AS "operatorName"
        FROM "OpsEvent" event
        JOIN "Order" orders
          ON orders."orderStableId" = event.payload->>'orderStableId'
        WHERE event.source = ${ORDER_LIFECYCLE_OUTBOX_SOURCE}
          AND event."eventName" = ${ORDER_CANCELLED_LIFECYCLE_EVENT}
          AND orders.status = 'refunded'::"OrderStatus"
          AND EXISTS (
            SELECT 1 FROM "OpsEvent" initial_handoff
            WHERE initial_handoff.source = ${ORDER_LIFECYCLE_OUTBOX_SOURCE}
              AND initial_handoff."eventName" = ${ORDER_INITIAL_PRINT_HANDOFF_LIFECYCLE_EVENT}
              AND initial_handoff.payload->>'orderStableId' = orders."orderStableId"
          )
          AND NOT EXISTS (
            SELECT 1 FROM "OpsEvent" cancellation_handoff
            WHERE cancellation_handoff.source = ${ORDER_LIFECYCLE_OUTBOX_SOURCE}
              AND cancellation_handoff."eventName" = ${ORDER_CANCELLATION_PRINT_HANDOFF_LIFECYCLE_EVENT}
              AND cancellation_handoff.payload->>'orderStableId' = orders."orderStableId"
          )
        ORDER BY event."createdAt" ASC, event.id ASC
        FOR UPDATE OF event SKIP LOCKED
        LIMIT 1
      `;
      const item = rows[0];
      if (!item) return false;

      const handoff = await this.fulfillment.handleCancellationLifecycle({
        orderStableId: item.orderStableId,
        reason: item.reason ?? 'Order cancellation confirmed',
        operatorName: item.operatorName ?? undefined,
      });
      if (!handoff) return false;

      await tx.opsEvent.createMany({
        data: {
          idempotencyKey: orderCancellationPrintHandoffIdempotencyKey(
            item.orderStableId,
          ),
          eventName: ORDER_CANCELLATION_PRINT_HANDOFF_LIFECYCLE_EVENT,
          source: ORDER_LIFECYCLE_OUTBOX_SOURCE,
          payload: { orderStableId: item.orderStableId },
        },
        skipDuplicates: true,
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
          ON orders."orderStableId" = event.payload->>'orderStableId'
        WHERE event.source = ${ORDER_LIFECYCLE_OUTBOX_SOURCE}
          AND event."eventName" = ${ORDER_ACCEPTED_LIFECYCLE_EVENT}
          AND orders."fulfillmentTiming" = 'IMMEDIATE'::"OrderFulfillmentTiming"
          AND orders.status IN ('pending'::"OrderStatus", 'paid'::"OrderStatus")
          AND NOT EXISTS (
            SELECT 1 FROM "OpsEvent" prep
            WHERE prep.source = ${ORDER_LIFECYCLE_OUTBOX_SOURCE}
              AND prep."eventName" = ${ORDER_PREP_STARTED_LIFECYCLE_EVENT}
              AND prep.payload->>'orderStableId' = orders."orderStableId"
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
