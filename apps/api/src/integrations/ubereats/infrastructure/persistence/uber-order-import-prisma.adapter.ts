import { Inject, Injectable, Logger } from '@nestjs/common';
import {
  Channel,
  FulfillmentType,
  OrderFulfillmentTiming,
  OrderStatus,
  PaymentMethod,
  UberMenuPublishStatus,
  type Prisma,
} from '@prisma/client';
import {
  ORDER_INGESTION,
  type NormalizedOrderItem,
  type OrderIngestionPort,
} from '../../../../orders/public-api';
import { PrismaService } from '../../../../prisma/prisma.service';
import type {
  UberOrderEventCursor,
  UberOrderImportRepositoryPort,
  UberOrderMenuMapping,
  UberOrderModifierSnapshotMapping,
  UberOrderModifierSnapshotSource,
  UberPosConnectivityQueryPort,
} from '../../application/orders/uber-order.ports';
import {
  UBER_CANONICAL_ORDER_FACTS_QUERY,
  type UberCanonicalOrderFactsQueryPort,
} from '../../application/shared/uber-canonical-order-facts.port';
import {
  UBER_CATALOG_MENU_FACTS_QUERY,
  type UberCatalogMenuFactsQueryPort,
} from '../../application/shared/uber-catalog-menu-facts.port';
import { UberOrderStateMachine } from '../../domain/orders/uber-order.state-machine';
import type { ParsedUberModifier } from '../../domain/orders/uber-order.types';

/** Prisma implementation of order-import persistence and the admission connectivity query. */
@Injectable()
export class UberOrderImportPrismaAdapter
  implements UberOrderImportRepositoryPort, UberPosConnectivityQueryPort
{
  private readonly logger = new Logger(UberOrderImportPrismaAdapter.name);

  constructor(
    private readonly prisma: PrismaService,
    @Inject(ORDER_INGESTION)
    private readonly ingestion: OrderIngestionPort,
    @Inject(UBER_CATALOG_MENU_FACTS_QUERY)
    private readonly catalogFacts: UberCatalogMenuFactsQueryPort,
    @Inject(UBER_CANONICAL_ORDER_FACTS_QUERY)
    private readonly orderFacts: UberCanonicalOrderFactsQueryPort,
  ) {}

  async getStoreConnectivity(storeStableId: string) {
    const nowMs = Date.now();
    const readModel = await this.prisma.posConnectivityReadModel.findUnique({
      where: { storeStableId },
      select: {
        hasHeartbeatCapableActiveDevice: true,
        lastHeartbeatAt: true,
        validUntil: true,
      },
    });
    if (!readModel?.hasHeartbeatCapableActiveDevice) {
      return { status: 'UNKNOWN' as const, lastHeartbeatAt: null };
    }
    if (!readModel.lastHeartbeatAt) {
      return { status: 'OFFLINE' as const, lastHeartbeatAt: null };
    }
    return {
      status:
        readModel.validUntil && nowMs <= readModel.validUntil.getTime()
          ? ('ONLINE' as const)
          : ('OFFLINE' as const),
      lastHeartbeatAt: readModel.lastHeartbeatAt,
    };
  }

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
    const order = await this.orderFacts.findByExternalOrderId(externalOrderId);
    if (!order) return null;
    const inbox = await this.prisma.uberWebhookInbox.findFirst({
      where: {
        externalOrderId: { in: [externalOrderId, `order:${externalOrderId}`] },
        status: 'PROCESSED',
      },
      orderBy: { processedAt: 'desc' },
      select: { eventId: true, createdAt: true, payload: true },
    });
    return {
      orderStableId: order.orderStableId,
      status: order.status,
      fulfillmentTiming: order.fulfillmentTiming,
      cursor: inbox
        ? this.readCursor(inbox.eventId, inbox.createdAt, inbox.payload)
        : null,
    };
  }

  async hasSucceededDenial(externalOrderId: string): Promise<boolean> {
    const denial = await this.prisma.uberOrderAction.findUnique({
      where: {
        externalOrderId_action: {
          externalOrderId,
          action: 'DENY',
        },
      },
      select: { status: true },
    });
    return denial?.status === 'SUCCEEDED';
  }

  async saveImportedOrder(
    input: Parameters<UberOrderImportRepositoryPort['saveImportedOrder']>[0],
  ): ReturnType<UberOrderImportRepositoryPort['saveImportedOrder']> {
    const mapping = new Map(
      input.menuMappings.map((item) => [item.externalItemId, item]),
    );
    const modifierSnapshotMeta = new Map<
      string,
      UberOrderModifierSnapshotMapping
    >(
      (input.modifierSnapshotMappings ?? []).map((item) => [
        item.externalItemId,
        item,
      ]),
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
      options: this.modifierSnapshots(item.modifiers, modifierSnapshotMeta),
      external: {
        itemId: item.externalItemId,
        lineId: item.externalLineId,
        instructions: item.specialInstructions,
        lineTotalCents: item.lineTotalCents,
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
        storeStableId: input.storeStableId,
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
      },
      async (tx) => {
        if (input.actionIntent) {
          await tx.$queryRaw`
            SELECT pg_advisory_xact_lock(
              hashtext(${input.actionIntent.externalOrderId})
            )::text AS "lockResult"
          `;
          const existingDecision = await tx.uberOrderAction.findFirst({
            where: {
              externalOrderId: input.actionIntent.externalOrderId,
              action: { in: ['ACCEPT', 'DENY'] },
            },
            select: { id: true, action: true },
            orderBy: { createdAt: 'asc' },
          });
          if (existingDecision) {
            savedAction = { taskId: existingDecision.id, created: false };
          } else {
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
              where: {
                externalOrderId_action: {
                  externalOrderId: input.actionIntent.externalOrderId,
                  action: input.actionIntent.action,
                },
              },
              select: { id: true },
            });
            savedAction = { taskId: action.id, created: inserted.count === 1 };
          }
        }
        // UberWebhookInbox lifecycle is intentionally not owned here. The
        // inbox worker that holds PROCESSING + leaseToken is the sole writer of
        // PROCESSED/FAILED/DEAD via markSucceeded/markFailed/markUnsupported.
      },
    );

    if (fulfillmentTiming === OrderFulfillmentTiming.SCHEDULED) {
      const timing = await this.orderFacts.findSchedulingByOrderStableId(
        saved.orderStableId,
      );
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
      orderStableId: saved.orderStableId,
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

  async findModifierSnapshotSources(): Promise<
    UberOrderModifierSnapshotSource[]
  > {
    return this.catalogFacts.listOrderModifierSnapshotSources();
  }

  private modifierSnapshots(
    values: ParsedUberModifier[],
    metadata: Map<string, UberOrderModifierSnapshotMapping>,
  ): Prisma.InputJsonValue {
    const snapshots: Array<Record<string, unknown>> = [];
    let sortOrder = 0;

    const visit = (
      modifiers: ParsedUberModifier[],
      targetContextOptionStableId: string | null,
    ) => {
      for (const modifier of modifiers) {
        const meta = modifier.externalId
          ? metadata.get(modifier.externalId)
          : undefined;
        const templateGroupStableId =
          meta?.templateGroupStableId ??
          modifier.parentExternalId ??
          `uber-group:${sortOrder}`;
        const localStableId =
          meta?.stableId ?? modifier.externalId ?? `uber-option:${sortOrder}`;

        snapshots.push({
          templateGroupStableId,
          groupKey: targetContextOptionStableId
            ? `uber__option-${targetContextOptionStableId}`
            : null,
          nameEn: meta?.templateNameEn ?? null,
          nameZh: meta?.templateNameZh ?? null,
          displayName: null,
          minSelect: 0,
          maxSelect: null,
          sortOrder,
          choices: [
            {
              stableId: localStableId,
              templateGroupStableId,
              targetItemStableId: meta?.targetItemStableId ?? null,
              nameEn: meta?.nameEn ?? null,
              nameZh: meta?.nameZh ?? null,
              displayName: modifier.displayName,
              priceDeltaCents: modifier.priceDeltaCents,
              sortOrder: 0,
            },
          ],
        });
        sortOrder += 1;

        visit(
          modifier.children,
          meta?.targetItemStableId
            ? localStableId
            : targetContextOptionStableId,
        );
      }
    };

    visit(values, null);
    return snapshots as unknown as Prisma.InputJsonValue;
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
}
