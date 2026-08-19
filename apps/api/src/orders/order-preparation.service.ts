import { Injectable, Logger } from '@nestjs/common';
import {
  OrderFulfillmentTiming,
  OrderStatus,
  Prisma,
} from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import {
  ORDER_ACCEPTED_LIFECYCLE_EVENT,
  ORDER_LIFECYCLE_OUTBOX_SOURCE,
  ORDER_PREP_STARTED_LIFECYCLE_EVENT,
  orderPrepStartedIdempotencyKey,
} from './order-lifecycle';

type LockedOrder = {
  id: string;
  orderStableId: string;
  clientRequestId: string | null;
  channel: string;
  status: OrderStatus;
  fulfillmentTiming: OrderFulfillmentTiming;
  scheduledReadyAt: Date | null;
  prepStartAt: Date | null;
  scheduleActivatedAt: Date | null;
};

export type OrderPreparationActivationResult = {
  outcome: 'activated' | 'already_active' | 'skipped';
  orderId: string;
  orderStableId: string;
  status: OrderStatus;
};

@Injectable()
export class OrderPreparationService {
  private readonly logger = new Logger(OrderPreparationService.name);

  constructor(private readonly prisma: PrismaService) {}

  /** Materializes an accepted immediate order into the local making lifecycle. */
  async activateAcceptedImmediateOrder(
    orderId: string,
    now = new Date(),
  ): Promise<OrderPreparationActivationResult> {
    try {
      return await this.prisma.$transaction(async (tx) => {
        const order = await this.lockById(tx, orderId);
        if (!order) return this.missingResult(orderId);
        return this.activateLocked(
          tx,
          order,
          now,
          OrderFulfillmentTiming.IMMEDIATE,
        );
      });
    } catch (error) {
      this.logFailure(orderId, error);
      throw error;
    }
  }

  /**
   * Shared command for manual early-start and any explicit scheduled activation.
   * Repeated calls are idempotent and converge on the same prep_started fact.
   */
  async activateScheduledOrder(
    orderId: string,
    now = new Date(),
  ): Promise<OrderPreparationActivationResult> {
    try {
      return await this.prisma.$transaction(async (tx) => {
        const order = await this.lockById(tx, orderId);
        if (!order) return this.missingResult(orderId);
        return this.activateLocked(
          tx,
          order,
          now,
          OrderFulfillmentTiming.SCHEDULED,
        );
      });
    } catch (error) {
      this.logFailure(orderId, error);
      throw error;
    }
  }

  async activateScheduledOrderByStableId(
    orderStableId: string,
    now = new Date(),
  ): Promise<OrderPreparationActivationResult> {
    try {
      return await this.prisma.$transaction(async (tx) => {
        const rows = await tx.$queryRaw<LockedOrder[]>`
          SELECT id::text AS id,
            "orderStableId",
            "clientRequestId",
            channel::text AS channel,
            status,
            "fulfillmentTiming",
            "scheduledReadyAt",
            "prepStartAt",
            "scheduleActivatedAt"
          FROM "Order"
          WHERE "orderStableId" = ${orderStableId}
          FOR UPDATE
        `;
        const order = rows[0];
        if (!order) return this.missingResult(orderStableId);
        return this.activateLocked(
          tx,
          order,
          now,
          OrderFulfillmentTiming.SCHEDULED,
        );
      });
    } catch (error) {
      this.logFailure(orderStableId, error);
      throw error;
    }
  }

  /**
   * Claims and activates exactly one due scheduled order. The accepted lifecycle
   * fact is part of the claim predicate so a future order can never start before
   * the external ACCEPT has succeeded.
   */
  async activateNextDueScheduledOrder(now = new Date()): Promise<boolean> {
    try {
      return await this.prisma.$transaction(async (tx) => {
        const rows = await tx.$queryRaw<LockedOrder[]>`
          SELECT orders.id::text AS id,
            orders."orderStableId",
            orders."clientRequestId",
            orders.channel::text AS channel,
            orders.status,
            orders."fulfillmentTiming",
            orders."scheduledReadyAt",
            orders."prepStartAt",
            orders."scheduleActivatedAt"
          FROM "Order" orders
          WHERE orders."fulfillmentTiming" = 'SCHEDULED'::"OrderFulfillmentTiming"
            AND orders."scheduleActivatedAt" IS NULL
            AND orders."prepStartAt" IS NOT NULL
            AND orders."prepStartAt" <= ${now}
            AND orders.status IN ('pending'::"OrderStatus", 'paid'::"OrderStatus")
            AND EXISTS (
              SELECT 1
              FROM "OpsEvent" accepted
              WHERE accepted.source = ${ORDER_LIFECYCLE_OUTBOX_SOURCE}
                AND accepted."eventName" = ${ORDER_ACCEPTED_LIFECYCLE_EVENT}
                AND accepted.payload->>'orderId' = orders.id::text
            )
          ORDER BY orders."prepStartAt" ASC, orders."createdAt" ASC
          FOR UPDATE OF orders SKIP LOCKED
          LIMIT 1
        `;
        const order = rows[0];
        if (!order) return false;
        await this.activateLocked(
          tx,
          order,
          now,
          OrderFulfillmentTiming.SCHEDULED,
        );
        return true;
      });
    } catch (error) {
      this.logger.error({
        event: 'scheduled_order_activation_failed',
        errorType: error instanceof Error ? error.name : 'UnknownError',
      });
      throw error;
    }
  }

  private async lockById(
    tx: Prisma.TransactionClient,
    orderId: string,
  ): Promise<LockedOrder | null> {
    const rows = await tx.$queryRaw<LockedOrder[]>`
      SELECT id::text AS id,
        "orderStableId",
        "clientRequestId",
        channel::text AS channel,
        status,
        "fulfillmentTiming",
        "scheduledReadyAt",
        "prepStartAt",
        "scheduleActivatedAt"
      FROM "Order"
      WHERE id = ${orderId}::uuid
      FOR UPDATE
    `;
    return rows[0] ?? null;
  }

  private async activateLocked(
    tx: Prisma.TransactionClient,
    order: LockedOrder,
    now: Date,
    expectedTiming: OrderFulfillmentTiming,
  ): Promise<OrderPreparationActivationResult> {
    if (order.fulfillmentTiming !== expectedTiming) {
      this.logSkipped(order, 'FULFILLMENT_TIMING_MISMATCH');
      return {
        outcome: 'skipped',
        orderId: order.id,
        orderStableId: order.orderStableId,
        status: order.status,
      };
    }

    if (
      order.status === OrderStatus.making ||
      order.status === OrderStatus.ready ||
      order.status === OrderStatus.completed
    ) {
      return {
        outcome: 'already_active',
        orderId: order.id,
        orderStableId: order.orderStableId,
        status: order.status,
      };
    }

    if (
      order.status !== OrderStatus.pending &&
      order.status !== OrderStatus.paid
    ) {
      this.logSkipped(order, `STATUS_${order.status.toUpperCase()}`);
      return {
        outcome: 'skipped',
        orderId: order.id,
        orderStableId: order.orderStableId,
        status: order.status,
      };
    }

    const fields = this.logFields(order, now);
    if (expectedTiming === OrderFulfillmentTiming.SCHEDULED) {
      this.logger.log({ event: 'scheduled_order_activation_started', ...fields });
      const delaySeconds = order.prepStartAt
        ? Math.max(
            0,
            Math.floor(
              (now.getTime() - order.prepStartAt.getTime()) / 1000,
            ),
          )
        : 0;
      if (delaySeconds > 0) {
        this.logger.warn({
          event: 'scheduled_order_late_activation',
          ...fields,
          delaySeconds,
        });
      }
    }

    await tx.order.update({
      where: { id: order.id },
      data: {
        status: OrderStatus.making,
        makingAt: now,
        ...(expectedTiming === OrderFulfillmentTiming.SCHEDULED
          ? { scheduleActivatedAt: now }
          : {}),
      },
    });

    await tx.opsEvent.createMany({
      data: {
        idempotencyKey: orderPrepStartedIdempotencyKey(order.id),
        eventName: ORDER_PREP_STARTED_LIFECYCLE_EVENT,
        source: ORDER_LIFECYCLE_OUTBOX_SOURCE,
        payload: {
          orderId: order.id,
          orderStableId: order.orderStableId,
        },
      },
      skipDuplicates: true,
    });

    if (expectedTiming === OrderFulfillmentTiming.SCHEDULED) {
      this.logger.log({
        event: 'scheduled_order_activated',
        ...fields,
        activatedAt: now.toISOString(),
      });
    }

    return {
      outcome: 'activated',
      orderId: order.id,
      orderStableId: order.orderStableId,
      status: OrderStatus.making,
    };
  }

  private logSkipped(order: LockedOrder, reason: string): void {
    this.logger.log({
      event: 'scheduled_order_activation_skipped',
      ...this.logFields(order, new Date()),
      reason,
    });
  }

  private logFailure(orderId: string, error: unknown): void {
    this.logger.error({
      event: 'scheduled_order_activation_failed',
      orderId,
      errorType: error instanceof Error ? error.name : 'UnknownError',
    });
  }

  private logFields(order: LockedOrder, now: Date) {
    return {
      orderStableId: order.orderStableId,
      externalOrderId: this.externalOrderId(order.clientRequestId),
      channel: order.channel,
      scheduledReadyAt: order.scheduledReadyAt?.toISOString() ?? null,
      prepStartAt: order.prepStartAt?.toISOString() ?? null,
      activatedAt: order.scheduleActivatedAt?.toISOString() ?? null,
      delaySeconds: order.prepStartAt
        ? Math.max(
            0,
            Math.floor(
              (now.getTime() - order.prepStartAt.getTime()) / 1000,
            ),
          )
        : 0,
    };
  }

  private externalOrderId(clientRequestId: string | null): string | null {
    return clientRequestId?.startsWith('ubereats:')
      ? clientRequestId.slice('ubereats:'.length)
      : null;
  }

  private missingResult(orderId: string): OrderPreparationActivationResult {
    this.logger.warn({
      event: 'scheduled_order_activation_skipped',
      orderId,
      reason: 'ORDER_NOT_FOUND',
    });
    return {
      outcome: 'skipped',
      orderId,
      orderStableId: orderId,
      status: OrderStatus.pending,
    };
  }
}
