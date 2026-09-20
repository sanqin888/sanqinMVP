import {
  Injectable,
  Logger,
  OnApplicationBootstrap,
  OnModuleDestroy,
} from '@nestjs/common';
import {
  DeliveryProvider,
  FulfillmentType,
  OrderStatus,
} from '@prisma/client';
import { PrismaService } from '../orders-prisma';
import {
  ORDER_DELIVERY_DISPATCH_ATTEMPT_STARTED_EVENT,
  ORDER_DELIVERY_DISPATCH_FAILED_EVENT,
  ORDER_DELIVERY_DISPATCH_RECONCILED_EVENT,
  ORDER_DELIVERY_DISPATCH_REQUESTED_EVENT,
  ORDER_DELIVERY_DISPATCH_SOURCE,
  ORDER_DELIVERY_DISPATCH_SUCCEEDED_EVENT,
  ORDER_DELIVERY_DISPATCH_UNKNOWN_EVENT,
  UBER_DIRECT_AUTOMATIC_RETRY_COUNT,
  orderDeliveryDispatchAttemptStartedIdempotencyKey,
  orderDeliveryDispatchRequestedIdempotencyKey,
  orderDeliveryDispatchUnknownIdempotencyKey,
  readDeliveryDispatchStaleAttemptMs,
} from '../order-delivery-dispatch-journal';
import { OrderDeliveryDispatchUseCase } from '../order-delivery-dispatch.use-case';

const DEFAULT_POLL_INTERVAL_MS = 500;
const DEFAULT_SEED_LIMIT = 25;

type ClaimedDispatchAttempt = {
  orderStableId: string;
  attempt: number;
  automaticRetriesRemaining: number;
};

type StaleDispatchAttempt = {
  orderStableId: string;
  attempt: number;
  externalReference: string | null;
};

@Injectable()
export class OrderDeliveryDispatchProcessor
  implements OnApplicationBootstrap, OnModuleDestroy
{
  private readonly logger = new Logger(OrderDeliveryDispatchProcessor.name);
  private readonly pollIntervalMs = this.readPositiveMs(
    process.env.UBER_DIRECT_DURABLE_DISPATCH_POLL_MS,
    DEFAULT_POLL_INTERVAL_MS,
  );
  private timer: NodeJS.Timeout | null = null;
  private polling = false;

  constructor(
    private readonly prisma: PrismaService,
    private readonly dispatchUseCase: OrderDeliveryDispatchUseCase,
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

  async processOnce(limit = 25): Promise<number> {
    await this.seedInitialRequests();

    let completed = 0;
    for (let index = 0; index < limit; index += 1) {
      if (await this.recoverOneStaleAttempt()) {
        completed += 1;
        continue;
      }

      const claim = await this.claimNextAttempt();
      if (!claim) break;

      await this.dispatchUseCase.handleDurableAttempt(claim);
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
        event: 'order_delivery_dispatch_processor_failed',
        errorType: error instanceof Error ? error.name : 'UnknownError',
      });
    } finally {
      this.polling = false;
    }
  }

  private async seedInitialRequests(): Promise<void> {
    const orders = await this.prisma.order.findMany({
      where: {
        status: {
          in: [OrderStatus.paid, OrderStatus.making, OrderStatus.ready],
        },
        fulfillmentType: FulfillmentType.delivery,
        deliveryProvider: DeliveryProvider.UBER,
        externalDeliveryId: null,
      },
      select: {
        orderStableId: true,
        clientRequestId: true,
      },
      orderBy: [{ paidAt: 'asc' }, { orderStableId: 'asc' }],
      take: DEFAULT_SEED_LIMIT,
    });

    if (orders.length === 0) return;

    await this.prisma.opsEvent.createMany({
      data: orders.map((order) => ({
        idempotencyKey: orderDeliveryDispatchRequestedIdempotencyKey(
          order.orderStableId,
          1,
        ),
        eventName: ORDER_DELIVERY_DISPATCH_REQUESTED_EVENT,
        source: ORDER_DELIVERY_DISPATCH_SOURCE,
        payload: {
          orderStableId: order.orderStableId,
          attempt: 1,
          externalReference:
            order.clientRequestId?.trim() || order.orderStableId,
          trigger: 'PAID_ORDER_SCAN',
          automaticRetriesRemaining: UBER_DIRECT_AUTOMATIC_RETRY_COUNT,
        },
      })),
      skipDuplicates: true,
    });
  }

  private async claimNextAttempt(): Promise<ClaimedDispatchAttempt | null> {
    return this.prisma.$transaction(async (tx) => {
      const rows = await tx.$queryRaw<ClaimedDispatchAttempt[]>`
        SELECT
          event.payload->>'orderStableId' AS "orderStableId",
          (event.payload->>'attempt')::int AS attempt,
          CASE
            WHEN (event.payload->>'automaticRetriesRemaining') ~ '^[0-9]+$'
              THEN (event.payload->>'automaticRetriesRemaining')::int
            ELSE ${UBER_DIRECT_AUTOMATIC_RETRY_COUNT}
          END AS "automaticRetriesRemaining"
        FROM "OpsEvent" event
        JOIN "Order" orders
          ON orders."orderStableId" = event.payload->>'orderStableId'
        WHERE event.source = ${ORDER_DELIVERY_DISPATCH_SOURCE}
          AND event."eventName" = ${ORDER_DELIVERY_DISPATCH_REQUESTED_EVENT}
          AND event.payload->>'orderStableId' IS NOT NULL
          AND (event.payload->>'attempt') ~ '^[1-9][0-9]*$'
          AND orders."externalDeliveryId" IS NULL
          AND (
            event.payload->>'notBefore' IS NULL
            OR (event.payload->>'notBefore')::timestamptz <= NOW()
          )
          AND NOT EXISTS (
            SELECT 1
            FROM "OpsEvent" started
            WHERE started.source = ${ORDER_DELIVERY_DISPATCH_SOURCE}
              AND started."eventName" = ${ORDER_DELIVERY_DISPATCH_ATTEMPT_STARTED_EVENT}
              AND started.payload->>'orderStableId' = event.payload->>'orderStableId'
              AND started.payload->>'attempt' = event.payload->>'attempt'
          )
        ORDER BY event."createdAt" ASC, event.id ASC
        FOR UPDATE OF event SKIP LOCKED
        LIMIT 1
      `;
      const claimed = rows[0];
      if (!claimed) return null;

      await tx.opsEvent.createMany({
        data: {
          idempotencyKey: orderDeliveryDispatchAttemptStartedIdempotencyKey(
            claimed.orderStableId,
            claimed.attempt,
          ),
          eventName: ORDER_DELIVERY_DISPATCH_ATTEMPT_STARTED_EVENT,
          source: ORDER_DELIVERY_DISPATCH_SOURCE,
          payload: {
            orderStableId: claimed.orderStableId,
            attempt: claimed.attempt,
            automaticRetriesRemaining: claimed.automaticRetriesRemaining,
          },
        },
        skipDuplicates: true,
      });

      return claimed;
    });
  }

  private async recoverOneStaleAttempt(): Promise<boolean> {
    const staleBefore = new Date(
      Date.now() - readDeliveryDispatchStaleAttemptMs(),
    );

    const stale = await this.prisma.$transaction(async (tx) => {
      const rows = await tx.$queryRaw<StaleDispatchAttempt[]>`
        SELECT
          started.payload->>'orderStableId' AS "orderStableId",
          (started.payload->>'attempt')::int AS attempt,
          requested.payload->>'externalReference' AS "externalReference"
        FROM "OpsEvent" started
        LEFT JOIN "OpsEvent" requested
          ON requested.source = ${ORDER_DELIVERY_DISPATCH_SOURCE}
          AND requested."eventName" = ${ORDER_DELIVERY_DISPATCH_REQUESTED_EVENT}
          AND requested.payload->>'orderStableId' = started.payload->>'orderStableId'
          AND requested.payload->>'attempt' = started.payload->>'attempt'
        WHERE started.source = ${ORDER_DELIVERY_DISPATCH_SOURCE}
          AND started."eventName" = ${ORDER_DELIVERY_DISPATCH_ATTEMPT_STARTED_EVENT}
          AND started."createdAt" < ${staleBefore}
          AND started.payload->>'orderStableId' IS NOT NULL
          AND (started.payload->>'attempt') ~ '^[1-9][0-9]*$'
          AND NOT EXISTS (
            SELECT 1
            FROM "OpsEvent" outcome
            WHERE outcome.source = ${ORDER_DELIVERY_DISPATCH_SOURCE}
              AND outcome."eventName" IN (
                ${ORDER_DELIVERY_DISPATCH_SUCCEEDED_EVENT},
                ${ORDER_DELIVERY_DISPATCH_FAILED_EVENT},
                ${ORDER_DELIVERY_DISPATCH_UNKNOWN_EVENT}
              )
              AND outcome.payload->>'orderStableId' = started.payload->>'orderStableId'
              AND outcome.payload->>'attempt' = started.payload->>'attempt'
          )
          AND NOT EXISTS (
            SELECT 1
            FROM "OpsEvent" reconciled
            WHERE reconciled.source = ${ORDER_DELIVERY_DISPATCH_SOURCE}
              AND reconciled."eventName" = ${ORDER_DELIVERY_DISPATCH_RECONCILED_EVENT}
              AND reconciled.payload->>'orderStableId' = started.payload->>'orderStableId'
              AND reconciled.payload->>'attempt' = started.payload->>'attempt'
          )
        ORDER BY started."createdAt" ASC, started.id ASC
        FOR UPDATE OF started SKIP LOCKED
        LIMIT 1
      `;
      const stale = rows[0];
      if (!stale) return null;

      await tx.opsEvent.createMany({
        data: {
          idempotencyKey: orderDeliveryDispatchUnknownIdempotencyKey(
            stale.orderStableId,
            stale.attempt,
          ),
          eventName: ORDER_DELIVERY_DISPATCH_UNKNOWN_EVENT,
          source: ORDER_DELIVERY_DISPATCH_SOURCE,
          payload: {
            orderStableId: stale.orderStableId,
            attempt: stale.attempt,
            externalReference: stale.externalReference,
            reason: 'PROCESS_INTERRUPTED_AFTER_ATTEMPT_STARTED',
            errorMessage:
              'Dispatch attempt started but no durable terminal outcome was recorded before the stale timeout. The Uber create request may have been submitted; verify Uber Direct Dashboard before retrying.',
            failureHistory: [
              {
                attempt: stale.attempt,
                reason: 'PROCESS_INTERRUPTED_AFTER_ATTEMPT_STARTED',
                errorMessage:
                  'Dispatch attempt started but no durable terminal outcome was recorded before the stale timeout. The Uber create request may have been submitted; verify Uber Direct Dashboard before retrying.',
                statusCode: null,
              },
            ],
          },
        },
        skipDuplicates: true,
      });

      this.logger.error({
        event: 'uber_direct_dispatch_reconciliation_required',
        orderStableId: stale.orderStableId,
        attempt: stale.attempt,
        reason: 'PROCESS_INTERRUPTED_AFTER_ATTEMPT_STARTED',
      });
      return stale;
    });

    if (!stale) return false;

    const order = await this.prisma.order.findUnique({
      where: { orderStableId: stale.orderStableId },
      select: { clientRequestId: true },
    });
    await this.dispatchUseCase.notifyReconciliationRequired({
      orderStableId: stale.orderStableId,
      orderNumber: order?.clientRequestId?.trim() || stale.orderStableId,
      attempt: stale.attempt,
      reason: 'PROCESS_INTERRUPTED_AFTER_ATTEMPT_STARTED',
      failureHistory: [
        {
          attempt: stale.attempt,
          reason: 'PROCESS_INTERRUPTED_AFTER_ATTEMPT_STARTED',
          errorMessage:
            'Dispatch attempt started but no durable terminal outcome was recorded before the stale timeout. The Uber create request may have been submitted; verify Uber Direct Dashboard before retrying.',
          statusCode: null,
        },
      ],
    });
    return true;
  }

  private readPositiveMs(raw: string | undefined, fallback: number): number {
    const parsed = Number(raw);
    return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
  }
}
