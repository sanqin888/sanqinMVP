import { Injectable, Logger } from '@nestjs/common';
import {
  Channel,
  FulfillmentType,
  OrderFulfillmentTiming,
  OrderStatus,
  PaymentMethod,
  UberMenuPublishStatus,
  type Prisma,
} from '@prisma/client';
import { createHash } from 'crypto';
import {
  DEFAULT_POS_CONNECTIVITY_OFFLINE_AFTER_MS,
  readPositiveDurationMs,
  resolvePosConnectivityStatus,
} from '../../../../common/pos-connectivity';
import { resolveConfiguredStoreId } from '../../../../common/store-id';
import type { NormalizedOrderItem } from '../../../../orders/order-ingestion.service';
import { OrderIngestionService } from '../../../../orders/order-ingestion.service';
import { PrismaService } from '../../../../prisma/prisma.service';
import type {
  UberOrderEventCursor,
  UberOrderImportRepositoryPort,
  UberOrderMenuMapping,
} from '../../application/orders/uber-order.ports';
import { UberOrderStateMachine } from '../../domain/orders/uber-order.state-machine';
import type { ParsedUberModifier } from '../../domain/orders/uber-order.types';
import { toUberOrderStatus } from './uber-order-status.mapper';

/** Prisma implementation of the complete order-import persistence boundary. */
@Injectable()
export class UberOrderImportPrismaAdapter implements UberOrderImportRepositoryPort {
  private readonly logger = new Logger(UberOrderImportPrismaAdapter.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly ingestion: OrderIngestionService,
  ) {}

  async findMenuMappings(
    uberStoreId: string,
    externalItemIds: string[],
  ): Promise<UberOrderMenuMapping[]> {
    if (!externalItemIds.length) return [];
    const rows = await this.prisma.uberPublishedMenuItem.findMany({
      where: {
        uberStoreId,
        uberItemId: { in: [...new Set(externalItemIds)] },
        publishVersion: {
          status: {
            in: [
              UberMenuPublishStatus.SUBMITTED,
              UberMenuPublishStatus.SUCCEEDED,
            ],
          },
        },
      },
      orderBy: { publishedAt: 'desc' },
      select: {
        uberItemId: true,
        menuItemStableId: true,
        publishedPriceCents: true,
      },
    });
    const latest = new Map<string, UberOrderMenuMapping>();
    for (const row of rows)
      if (!latest.has(row.uberItemId))
        latest.set(row.uberItemId, {
          externalItemId: row.uberItemId,
          menuItemStableId: row.menuItemStableId,
          expectedPriceCents: row.publishedPriceCents,
        });
    return [...latest.values()];
  }

  async findByExternalOrderId(externalOrderId: string) {
    const order = await this.prisma.order.findUnique({
      where: { clientRequestId: `ubereats:${externalOrderId}` },
      select: { id: true, status: true },
    });
    if (!order) return null;
    const inbox = await this.prisma.uberWebhookInbox.findFirst({
      where: { externalOrderId, status: 'PROCESSED' },
      orderBy: { processedAt: 'desc' },
      select: { eventId: true, createdAt: true, payload: true },
    });
    return {
      orderId: order.id,
      status: toUberOrderStatus(order.status),
      cursor: inbox
        ? this.readCursor(inbox.eventId, inbox.createdAt, inbox.payload)
        : null,
    };
  }

  async getPosStoreConnectivity(posStoreId: string) {
    if (posStoreId !== resolveConfiguredStoreId()) {
      return { status: 'UNKNOWN' as const, lastHeartbeatAt: null };
    }
    const devices = await this.prisma.posDevice.findMany({
      where: { status: 'ACTIVE' },
      select: { lastSeenAt: true, meta: true },
    });
    const offlineAfterMs = readPositiveDurationMs(
      process.env.POS_CONNECTIVITY_HEARTBEAT_TIMEOUT_MS,
      DEFAULT_POS_CONNECTIVITY_OFFLINE_AFTER_MS,
    );
    return resolvePosConnectivityStatus(devices, Date.now(), offlineAfterMs);
  }

  async saveImportedOrder(
    input: Parameters<UberOrderImportRepositoryPort['saveImportedOrder']>[0],
  ): ReturnType<UberOrderImportRepositoryPort['saveImportedOrder']> {
    const mapping = new Map(
      input.menuMappings.map((item) => [item.externalItemId, item]),
    );
    const items: NormalizedOrderItem[] = input.order.items.map((item) => ({
      productStableId: mapping.get(item.externalItemId ?? '')!.menuItemStableId,
      quantity: item.quantity,
      displayName: item.displayName,
      nameEn: null,
      nameZh: null,
      baseUnitPriceCents: item.baseUnitPriceCents,
      optionsUnitPriceCents: item.optionsUnitPriceCents,
      unitPriceCents: item.unitPriceCents,
      options: this.modifierSnapshots(item.modifiers),
      external: {
        itemId: item.externalItemId,
        lineId: item.externalLineId,
        instructions: item.specialInstructions,
        lineTotalCents: item.lineTotalCents,
        modifiers: this.flattenValues(item.modifiers).map((modifier) => ({
          externalId: modifier.externalId,
          parentExternalId: modifier.parentExternalId,
          displayName: modifier.displayName,
          quantity: modifier.quantity,
          priceDeltaCents: modifier.priceDeltaCents,
          specialInstructions: modifier.specialInstructions,
          snapshot: modifier as unknown as Prisma.InputJsonValue,
        })),
      },
    }));
    const targetStatus = UberOrderStateMachine.eventStatus(input.eventType);
    let savedAction: { taskId: string; created: boolean } | null = null;
    const fulfillmentTiming =
      input.order.fulfillmentTiming === 'SCHEDULED'
        ? OrderFulfillmentTiming.SCHEDULED
        : OrderFulfillmentTiming.IMMEDIATE;
    const saved = await this.ingestion.ingest(
      {
        channel: Channel.ubereats,
        paymentMethod: PaymentMethod.UBEREATS,
        externalOrderId: input.order.externalOrderId,
        clientRequestId: `ubereats:${input.order.externalOrderId}`,
        storeId: input.posStoreId,
        status: this.toPrismaStatus(targetStatus),
        paidAt: input.order.paidAt,
        fulfillmentType:
          input.order.fulfillmentType === 'delivery'
            ? FulfillmentType.delivery
            : FulfillmentType.pickup,
        fulfillmentTiming,
        scheduledReadyAt: input.order.scheduledReadyAt,
        pickupCode: input.order.pickupCode,
        amounts: {
          subtotalCents: input.order.subtotalCents,
          subtotalAfterDiscountCents: Math.max(
            0,
            input.order.subtotalCents - input.order.discountCents,
          ),
          couponDiscountCents: input.order.discountCents,
          taxCents: input.order.taxCents,
          deliveryFeeCents: input.order.deliveryFeeCents,
          totalCents: input.order.totalCents,
          paymentTotalCents: input.order.totalCents,
        },
        contact: {
          name: input.order.contactName,
          phone: input.order.contactPhone,
        },
        externalSnapshot: {
          displayId: input.order.displayId,
          notes: input.order.specialInstructions,
          estimatedReadyAt: input.order.estimatedReadyAt,
        },
        items,
      },
      {
        verifyWebPayment: false,
        applyMembershipPoints: false,
        applyCoupons: false,
        persistExternalSnapshot: true,
        emitPaidLifecycleEvent: false,
      },
      async (tx, order) => {
        if (input.actionIntent) {
          const inserted = await tx.uberOrderAction.createMany({
            data: {
              ...input.actionIntent,
              status: 'PENDING',
              retryable: true,
              nextRetryAt: input.receivedAt,
            },
            skipDuplicates: true,
          });
          const action = await tx.uberOrderAction.findUniqueOrThrow({
            where: { idempotencyKey: input.actionIntent.idempotencyKey },
            select: { id: true },
          });
          savedAction = { taskId: action.id, created: inserted.count === 1 };
        }
        if (input.cancellation) {
          await tx.uberOrderCancellation.upsert({
            where: { eventId: input.cursor.eventId },
            create: {
              orderId: order.orderId,
              externalOrderId: input.order.externalOrderId,
              eventId: input.cursor.eventId,
              ...input.cancellation,
            },
            update: {},
          });
          const refundCents = Math.max(0, input.order.totalCents);
          await tx.orderAmendment.upsert({
            where: {
              amendmentStableId: this.amendmentId(input.cursor.eventId),
            },
            create: {
              amendmentStableId: this.amendmentId(input.cursor.eventId),
              orderId: order.orderId,
              type: 'RETENDER',
              paymentMethod: PaymentMethod.UBEREATS,
              reason:
                input.cancellation.reasonDetail ??
                input.cancellation.reasonCode ??
                'Uber cancellation confirmed',
              deltaCents: -refundCents,
              refundCents,
              summaryJson: {
                kind: 'UBER_CANCELLATION',
                status: 'CONFIRMED',
                eventId: input.cursor.eventId,
              },
            },
            update: {},
          });
          await tx.order.update({
            where: { id: order.orderId },
            data: { status: OrderStatus.refunded },
          });
        }
        // UberWebhookInbox lifecycle is intentionally not owned here. The
        // inbox worker that holds PROCESSING + leaseToken is the sole writer of
        // PROCESSED/FAILED/DEAD via markSucceeded/markFailed/markUnsupported.
      },
    );

    if (fulfillmentTiming === OrderFulfillmentTiming.SCHEDULED) {
      const timing = await this.prisma.order.findUnique({
        where: { id: saved.orderId },
        select: {
          scheduledReadyAt: true,
          prepStartAt: true,
          prepDurationMinutes: true,
        },
      });
      this.logger.log({
        event: 'scheduled_order_imported',
        orderStableId: saved.orderStableId,
        externalOrderId: input.order.externalOrderId,
        channel: Channel.ubereats,
        scheduledReadyAt: timing?.scheduledReadyAt?.toISOString() ?? null,
        prepStartAt: timing?.prepStartAt?.toISOString() ?? null,
        prepDurationMinutes: timing?.prepDurationMinutes ?? null,
      });
    }

    return {
      orderId: saved.orderId,
      created: saved.action === 'created',
      action: savedAction,
    };
  }

  private toPrismaStatus(status: string | null): OrderStatus {
    const map: Record<string, OrderStatus> = {
      pending: OrderStatus.pending,
      accepted: OrderStatus.paid,
      preparing: OrderStatus.making,
      ready: OrderStatus.ready,
      completed: OrderStatus.completed,
      cancelled: OrderStatus.refunded,
      rejected: OrderStatus.refunded,
      refunded: OrderStatus.refunded,
    };
    return (status && map[status]) || OrderStatus.pending;
  }

  private modifierSnapshots(
    values: ParsedUberModifier[],
  ): Prisma.InputJsonValue {
    return values as unknown as Prisma.InputJsonValue;
  }

  private flattenValues(values: ParsedUberModifier[]): ParsedUberModifier[] {
    return values.flatMap((value) => [
      value,
      ...this.flattenValues(value.children),
    ]);
  }

  private readCursor(
    eventId: string,
    receivedAt: Date,
    payload: Prisma.JsonValue,
  ): UberOrderEventCursor {
    const root =
      payload && typeof payload === 'object' && !Array.isArray(payload)
        ? payload
        : {};
    const cursor =
      'cursor' in root &&
      root.cursor &&
      typeof root.cursor === 'object' &&
      !Array.isArray(root.cursor)
        ? root.cursor
        : {};
    const occurredAtRaw =
      typeof cursor.occurredAt === 'string'
        ? cursor.occurredAt
        : typeof root.event_time === 'string'
          ? root.event_time
          : typeof root.eventTime === 'string'
            ? root.eventTime
            : null;
    const occurredAt = occurredAtRaw ? new Date(occurredAtRaw) : receivedAt;
    const resourceVersionRaw =
      typeof cursor.resourceVersion === 'string'
        ? cursor.resourceVersion
        : (root.resource_version ?? root.resourceVersion);
    const sequenceRaw =
      typeof cursor.sequence === 'number'
        ? cursor.sequence
        : (root.sequence_number ?? root.sequenceNumber);
    const sequence =
      typeof sequenceRaw === 'number'
        ? sequenceRaw
        : typeof sequenceRaw === 'string' && sequenceRaw.trim()
          ? Number(sequenceRaw)
          : null;
    return {
      eventId,
      occurredAt: Number.isNaN(occurredAt.getTime()) ? receivedAt : occurredAt,
      resourceVersion:
        typeof resourceVersionRaw === 'string'
          ? resourceVersionRaw
          : typeof resourceVersionRaw === 'number'
            ? String(resourceVersionRaw)
            : null,
      sequence:
        typeof sequence === 'number' && Number.isFinite(sequence)
          ? sequence
          : null,
    };
  }

  private amendmentId(eventId: string): string {
    return `uber_cancel_${createHash('sha256').update(eventId).digest('hex')}`;
  }
}
