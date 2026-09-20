import { Injectable } from '@nestjs/common';
import {
  DeliveryProvider,
  FulfillmentType,
  OrderStatus,
  type Prisma,
} from '@prisma/client';
import {
  ORDER_DELIVERY_DISPATCH_ATTEMPT_STARTED_EVENT,
  ORDER_DELIVERY_DISPATCH_FAILED_EVENT,
  ORDER_DELIVERY_DISPATCH_RECONCILED_EVENT,
  ORDER_DELIVERY_DISPATCH_REQUESTED_EVENT,
  ORDER_DELIVERY_DISPATCH_SOURCE,
  ORDER_DELIVERY_DISPATCH_SUCCEEDED_EVENT,
  ORDER_DELIVERY_DISPATCH_UNKNOWN_EVENT,
  type OrderDeliveryDispatchReconciliationAction,
  normalizeDeliveryDispatchAttempt,
  orderDeliveryDispatchReconciledIdempotencyKey,
  orderDeliveryDispatchRequestedIdempotencyKey,
  UBER_DIRECT_AUTOMATIC_RETRY_COUNT,
} from './order-delivery-dispatch-journal';
import {
  readOrderDeliveryDestinationSnapshot,
  type OrderDeliveryDestinationSnapshot,
} from './order-delivery-checkout-metadata';
import { PrismaService } from './orders-prisma';

export type OrderDeliveryDispatchQueueState =
  | 'PENDING'
  | 'IN_FLIGHT'
  | 'FAILED'
  | 'UNKNOWN'
  | 'SUCCEEDED'
  | 'RECONCILED';

export type OrderDeliveryDispatchReconciliationItem = {
  orderStableId: string;
  orderNumber: string;
  attempt: number;
  state: OrderDeliveryDispatchQueueState;
  requiresAction: boolean;
  orderStatus: string;
  externalDeliveryId: string | null;
  reason: string | null;
  errorMessage: string | null;
  providerDeliveryId: string | null;
  failureHistory: Array<{
    attempt: number;
    reason: string;
    errorMessage: string;
    statusCode: number | null;
  }>;
  deliveryDestination: OrderDeliveryDestinationSnapshot | null;
  eventAt: string;
};

export class OrderDeliveryDispatchReconciliationError extends Error {
  constructor(
    public readonly code:
      | 'NOT_FOUND'
      | 'STALE_ATTEMPT'
      | 'NOT_RECONCILABLE'
      | 'INVALID_ACTION'
      | 'PROVIDER_ID_REQUIRED'
      | 'ORDER_ALREADY_BOUND'
      | 'ORDER_NOT_RETRYABLE',
    message: string,
  ) {
    super(message);
    this.name = 'OrderDeliveryDispatchReconciliationError';
  }
}

type JournalRow = {
  eventName: string;
  payload: Prisma.JsonValue;
  createdAt: Date;
};

type ParsedAttempt = {
  orderStableId: string;
  attempt: number;
  state: OrderDeliveryDispatchQueueState;
  reason: string | null;
  errorMessage: string | null;
  providerDeliveryId: string | null;
  eventAt: Date;
};

const RETRYABLE_ORDER_STATUSES = new Set<OrderStatus>([
  OrderStatus.paid,
  OrderStatus.making,
  OrderStatus.ready,
]);

@Injectable()
export class OrderDeliveryDispatchReconciliationService {
  constructor(private readonly prisma: PrismaService) {}

  async listQueue(
    limit = 50,
  ): Promise<OrderDeliveryDispatchReconciliationItem[]> {
    const safeLimit = Math.max(1, Math.min(100, Math.round(limit)));
    const rows = await this.prisma.$queryRaw<
      Array<{
        orderStableId: string;
        orderNumber: string;
        attempt: number;
        state: 'FAILED' | 'UNKNOWN';
        orderStatus: string;
        externalDeliveryId: string | null;
        reason: string | null;
        errorMessage: string | null;
        providerDeliveryId: string | null;
        failureHistory: Prisma.JsonValue | null;
        contactName: string | null;
        contactPhone: string | null;
        metadataJson: Prisma.JsonValue | null;
        eventAt: Date;
      }>
    >`
      SELECT latest."orderStableId",
        COALESCE(orders."clientRequestId", latest."orderStableId") AS "orderNumber",
        latest.attempt,
        latest.state,
        COALESCE(orders.status::text, 'missing') AS "orderStatus",
        orders."externalDeliveryId" AS "externalDeliveryId",
        latest.reason,
        latest."errorMessage",
        latest."providerDeliveryId",
        latest."failureHistory",
        orders."contactName" AS "contactName",
        orders."contactPhone" AS "contactPhone",
        checkout."metadataJson" AS "metadataJson",
        latest."eventAt"
      FROM (
        SELECT DISTINCT ON (event.payload->>'orderStableId')
          event.payload->>'orderStableId' AS "orderStableId",
          (event.payload->>'attempt')::int AS attempt,
          CASE
            WHEN event."eventName" = ${ORDER_DELIVERY_DISPATCH_UNKNOWN_EVENT}
              THEN 'UNKNOWN'
            ELSE 'FAILED'
          END AS state,
          event.payload->>'reason' AS reason,
          event.payload->>'errorMessage' AS "errorMessage",
          event.payload->>'providerDeliveryId' AS "providerDeliveryId",
          event.payload->'failureHistory' AS "failureHistory",
          event."createdAt" AS "eventAt"
        FROM "OpsEvent" event
        WHERE event.source = ${ORDER_DELIVERY_DISPATCH_SOURCE}
          AND event."eventName" IN (
            ${ORDER_DELIVERY_DISPATCH_FAILED_EVENT},
            ${ORDER_DELIVERY_DISPATCH_UNKNOWN_EVENT}
          )
          AND event.payload->>'orderStableId' IS NOT NULL
          AND (event.payload->>'attempt') ~ '^[1-9][0-9]*$'
          AND (
            event."eventName" = ${ORDER_DELIVERY_DISPATCH_UNKNOWN_EVENT}
            OR event.payload->>'reason' IN (
              'LOCAL_VALIDATION_FAILED',
              'PROVIDER_REJECTED'
            )
          )
          AND NOT EXISTS (
            SELECT 1
            FROM "OpsEvent" later
            WHERE later.source = ${ORDER_DELIVERY_DISPATCH_SOURCE}
              AND later.payload->>'orderStableId' = event.payload->>'orderStableId'
              AND (later.payload->>'attempt') ~ '^[1-9][0-9]*$'
              AND (
                (later.payload->>'attempt')::int >
                  (event.payload->>'attempt')::int
                OR (
                  later.payload->>'attempt' = event.payload->>'attempt'
                  AND later."eventName" IN (
                    ${ORDER_DELIVERY_DISPATCH_SUCCEEDED_EVENT},
                    ${ORDER_DELIVERY_DISPATCH_RECONCILED_EVENT}
                  )
                )
              )
          )
        ORDER BY
          event.payload->>'orderStableId',
          (event.payload->>'attempt')::int DESC,
          event."createdAt" DESC,
          event.id DESC
      ) latest
      LEFT JOIN "Order" orders
        ON orders."orderStableId" = latest."orderStableId"
      LEFT JOIN LATERAL (
        SELECT intent."metadataJson"
        FROM "CheckoutIntent" intent
        WHERE intent."orderId" = orders.id
        ORDER BY intent."createdAt" DESC, intent.id DESC
        LIMIT 1
      ) checkout ON TRUE
      ORDER BY latest."eventAt" DESC, latest."orderStableId" ASC
      LIMIT ${safeLimit}
    `;

    return rows.map((item) => ({
      orderStableId: item.orderStableId,
      orderNumber: item.orderNumber,
      attempt: item.attempt,
      state: item.state,
      requiresAction: true,
      orderStatus: item.orderStatus,
      externalDeliveryId: item.externalDeliveryId,
      reason: item.reason,
      errorMessage: item.errorMessage,
      providerDeliveryId: item.providerDeliveryId,
      failureHistory: this.parseFailureHistory(item.failureHistory),
      deliveryDestination: readOrderDeliveryDestinationSnapshot(
        item.metadataJson,
        {
          contactName: item.contactName,
          contactPhone: item.contactPhone,
        },
      ),
      eventAt: item.eventAt.toISOString(),
    }));
  }

  async reconcile(input: {
    orderStableId: string;
    attempt: number;
    action: OrderDeliveryDispatchReconciliationAction;
    operatorUserStableId: string;
    providerDeliveryId?: string;
    note?: string;
  }): Promise<{
    orderStableId: string;
    attempt: number;
    action: OrderDeliveryDispatchReconciliationAction;
    nextAttempt?: number;
    externalDeliveryId?: string;
  }> {
    const orderStableId = input.orderStableId.trim();
    const operatorUserStableId = input.operatorUserStableId.trim();
    const attempt = normalizeDeliveryDispatchAttempt(input.attempt);
    if (!orderStableId || !operatorUserStableId || !attempt) {
      throw new OrderDeliveryDispatchReconciliationError(
        'INVALID_ACTION',
        'orderStableId, attempt and operator are required',
      );
    }

    return this.prisma.$transaction(async (tx) => {
      const lockedOrders = await tx.$queryRaw<Array<{ id: string }>>`
        SELECT id::text AS id
        FROM "Order"
        WHERE "orderStableId" = ${orderStableId}
        FOR UPDATE
      `;
      if (!lockedOrders[0]) {
        throw new OrderDeliveryDispatchReconciliationError(
          'NOT_FOUND',
          'order not found',
        );
      }

      const state = await this.readLatestAttempt(tx, orderStableId);
      if (!state) {
        throw new OrderDeliveryDispatchReconciliationError(
          'NOT_FOUND',
          'delivery dispatch attempt not found',
        );
      }
      if (state.attempt !== attempt) {
        throw new OrderDeliveryDispatchReconciliationError(
          'STALE_ATTEMPT',
          `latest delivery dispatch attempt is ${state.attempt}`,
        );
      }
      if (state.state !== 'FAILED' && state.state !== 'UNKNOWN') {
        throw new OrderDeliveryDispatchReconciliationError(
          'NOT_RECONCILABLE',
          `delivery dispatch attempt is ${state.state}`,
        );
      }

      const order = await tx.order.findUnique({
        where: { orderStableId },
        select: {
          id: true,
          orderStableId: true,
          clientRequestId: true,
          status: true,
          fulfillmentType: true,
          deliveryProvider: true,
          externalDeliveryId: true,
        },
      });
      if (!order) {
        throw new OrderDeliveryDispatchReconciliationError(
          'NOT_FOUND',
          'order not found',
        );
      }

      const note = input.note?.trim().slice(0, 500) || null;

      if (input.action === 'BIND_EXISTING') {
        const providerDeliveryId = input.providerDeliveryId?.trim();
        if (!providerDeliveryId) {
          throw new OrderDeliveryDispatchReconciliationError(
            'PROVIDER_ID_REQUIRED',
            'providerDeliveryId is required when binding an existing delivery',
          );
        }
        if (
          order.externalDeliveryId &&
          order.externalDeliveryId !== providerDeliveryId
        ) {
          throw new OrderDeliveryDispatchReconciliationError(
            'ORDER_ALREADY_BOUND',
            'order is already bound to a different provider delivery',
          );
        }

        if (!order.externalDeliveryId) {
          await tx.order.update({
            where: { id: order.id },
            data: { externalDeliveryId: providerDeliveryId },
          });
        }
        await tx.opsEvent.createMany({
          data: {
            idempotencyKey: orderDeliveryDispatchReconciledIdempotencyKey(
              orderStableId,
              attempt,
            ),
            eventName: ORDER_DELIVERY_DISPATCH_RECONCILED_EVENT,
            source: ORDER_DELIVERY_DISPATCH_SOURCE,
            payload: {
              orderStableId,
              attempt,
              action: input.action,
              operatorUserStableId,
              providerDeliveryId,
              note,
            },
          },
          skipDuplicates: true,
        });
        return {
          orderStableId,
          attempt,
          action: input.action,
          externalDeliveryId: providerDeliveryId,
        };
      }

      if (input.action !== 'CONFIRM_NOT_CREATED_RETRY') {
        throw new OrderDeliveryDispatchReconciliationError(
          'INVALID_ACTION',
          'unsupported reconciliation action',
        );
      }

      if (
        order.externalDeliveryId ||
        order.fulfillmentType !== FulfillmentType.delivery ||
        order.deliveryProvider !== DeliveryProvider.UBER ||
        !RETRYABLE_ORDER_STATUSES.has(order.status)
      ) {
        throw new OrderDeliveryDispatchReconciliationError(
          'ORDER_NOT_RETRYABLE',
          'order is no longer eligible for a new Uber Direct dispatch attempt',
        );
      }

      const nextAttempt = attempt + 1;
      const externalReference =
        order.clientRequestId?.trim() || order.orderStableId;
      await tx.opsEvent.createMany({
        data: [
          {
            idempotencyKey: orderDeliveryDispatchReconciledIdempotencyKey(
              orderStableId,
              attempt,
            ),
            eventName: ORDER_DELIVERY_DISPATCH_RECONCILED_EVENT,
            source: ORDER_DELIVERY_DISPATCH_SOURCE,
            payload: {
              orderStableId,
              attempt,
              action: input.action,
              operatorUserStableId,
              nextAttempt,
              note,
            },
          },
          {
            idempotencyKey: orderDeliveryDispatchRequestedIdempotencyKey(
              orderStableId,
              nextAttempt,
            ),
            eventName: ORDER_DELIVERY_DISPATCH_REQUESTED_EVENT,
            source: ORDER_DELIVERY_DISPATCH_SOURCE,
            payload: {
              orderStableId,
              attempt: nextAttempt,
              externalReference,
              trigger: 'OPERATOR_CONFIRMED_NOT_CREATED',
              authorizedByUserStableId: operatorUserStableId,
              previousAttempt: attempt,
              automaticRetriesRemaining: UBER_DIRECT_AUTOMATIC_RETRY_COUNT,
            },
          },
        ],
        skipDuplicates: true,
      });

      return {
        orderStableId,
        attempt,
        action: input.action,
        nextAttempt,
      };
    });
  }

  private parseFailureHistory(
    value: Prisma.JsonValue | null,
  ): OrderDeliveryDispatchReconciliationItem['failureHistory'] {
    if (!Array.isArray(value)) return [];
    return value
      .map((entry) => {
        if (!entry || typeof entry !== 'object' || Array.isArray(entry)) {
          return null;
        }
        const record = entry as Record<string, unknown>;
        const attempt =
          typeof record.attempt === 'number'
            ? record.attempt
            : Number(record.attempt);
        const reason =
          typeof record.reason === 'string' ? record.reason.trim() : '';
        const errorMessage =
          typeof record.errorMessage === 'string'
            ? record.errorMessage.trim()
            : '';
        const statusCode =
          typeof record.statusCode === 'number' ? record.statusCode : null;
        if (!Number.isInteger(attempt) || attempt < 1 || !reason) return null;
        return {
          attempt,
          reason,
          errorMessage: errorMessage || reason,
          statusCode,
        };
      })
      .filter(
        (
          item,
        ): item is OrderDeliveryDispatchReconciliationItem['failureHistory'][number] =>
          item !== null,
      );
  }

  private async readLatestAttempt(
    db: Pick<Prisma.TransactionClient, 'opsEvent'>,
    orderStableId: string,
  ): Promise<ParsedAttempt | null> {
    const rows = await db.opsEvent.findMany({
      where: {
        source: ORDER_DELIVERY_DISPATCH_SOURCE,
        payload: { path: ['orderStableId'], equals: orderStableId },
        eventName: {
          in: [
            ORDER_DELIVERY_DISPATCH_REQUESTED_EVENT,
            ORDER_DELIVERY_DISPATCH_ATTEMPT_STARTED_EVENT,
            ORDER_DELIVERY_DISPATCH_SUCCEEDED_EVENT,
            ORDER_DELIVERY_DISPATCH_FAILED_EVENT,
            ORDER_DELIVERY_DISPATCH_UNKNOWN_EVENT,
            ORDER_DELIVERY_DISPATCH_RECONCILED_EVENT,
          ],
        },
      },
      select: {
        eventName: true,
        payload: true,
        createdAt: true,
      },
      orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
      take: 100,
    });
    return this.latestAttemptByOrder(rows).get(orderStableId) ?? null;
  }

  private latestAttemptByOrder(rows: JournalRow[]): Map<string, ParsedAttempt> {
    const latestByAttempt = new Map<string, ParsedAttempt>();

    for (const row of rows) {
      const parsed = this.parseRow(row);
      if (!parsed) continue;
      const key = `${parsed.orderStableId}:${parsed.attempt}`;
      if (!latestByAttempt.has(key)) {
        latestByAttempt.set(key, parsed);
      }
    }

    const latestByOrder = new Map<string, ParsedAttempt>();
    for (const parsed of latestByAttempt.values()) {
      const current = latestByOrder.get(parsed.orderStableId);
      if (!current || parsed.attempt > current.attempt) {
        latestByOrder.set(parsed.orderStableId, parsed);
      }
    }
    return latestByOrder;
  }

  private parseRow(row: JournalRow): ParsedAttempt | null {
    const payload = asRecord(row.payload);
    const orderStableId = asString(payload?.orderStableId);
    const attempt = normalizeDeliveryDispatchAttempt(payload?.attempt);
    if (!orderStableId || !attempt) return null;

    const state = stateForEvent(row.eventName);
    if (!state) return null;
    return {
      orderStableId,
      attempt,
      state,
      reason: asString(payload?.reason) ?? null,
      errorMessage: asString(payload?.errorMessage) ?? null,
      providerDeliveryId: asString(payload?.providerDeliveryId) ?? null,
      eventAt: row.createdAt,
    };
  }
}

function stateForEvent(
  eventName: string,
): OrderDeliveryDispatchQueueState | null {
  if (eventName === ORDER_DELIVERY_DISPATCH_REQUESTED_EVENT) return 'PENDING';
  if (eventName === ORDER_DELIVERY_DISPATCH_ATTEMPT_STARTED_EVENT) {
    return 'IN_FLIGHT';
  }
  if (eventName === ORDER_DELIVERY_DISPATCH_SUCCEEDED_EVENT) return 'SUCCEEDED';
  if (eventName === ORDER_DELIVERY_DISPATCH_FAILED_EVENT) return 'FAILED';
  if (eventName === ORDER_DELIVERY_DISPATCH_UNKNOWN_EVENT) return 'UNKNOWN';
  if (eventName === ORDER_DELIVERY_DISPATCH_RECONCILED_EVENT) {
    return 'RECONCILED';
  }
  return null;
}

function asRecord(value: unknown): Record<string, unknown> | null {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}

function asString(value: unknown): string | undefined {
  if (typeof value !== 'string') return undefined;
  const trimmed = value.trim();
  return trimmed || undefined;
}
