import {
  BadRequestException,
  Inject,
  Injectable,
  Optional,
} from '@nestjs/common';
import {
  Channel,
  OrderStatus,
  UberMenuPublishStatus,
  type Prisma,
} from '@prisma/client';
import { createHash } from 'crypto';
import { OrderEventsBus } from '../../../../messaging/order-events.bus';
import { OrderIngestionService } from '../../../../orders/order-ingestion.service';
import { PrismaService } from '../../../../prisma/prisma.service';
import { UberAuthService } from '../uber-api/uber-token.provider';
import {
  UberConfigService,
  type UberOrderConfig,
} from '../config/uber-config.service';
import { UberHttpClient } from '../uber-api/uber-http.client';
import type {
  ParsedUberModifier,
  ParsedUberOrder,
  ParsedUberOrderItem,
  UberOrderActionName,
  UberOrderActionRecord,
  UberOrderActionResult,
} from '../../domain/orders/uber-order.types';
import { UberPrismaAccessService } from '../persistence/uber-prisma-access.service';
import {
  UberOrderPayloadParser,
  mapUberEventTypeToOrderStatus,
  validateUberOrderAmounts,
} from '../../domain/orders/uber-order-payload.parser';
import { UberOrderActionService } from '../../application/orders/uber-order-action.service';
import { UberOrderOutboxService } from '../../application/orders/uber-order-outbox.service';
import { UberOrderStatusSyncService } from '../../application/orders/uber-order-status-sync.service';
import { UberOrderStateMachine } from '../../domain/orders/uber-order.state-machine';
import { buildUberIdempotencyKey } from '../../application/idempotency/uber-idempotency-key';
import { UberOrderGateway } from '../uber-api/uber-resource.gateways';
import { toUberEatsHttpException } from '../../application/uber-domain-error.mapper';
import { toUberOrderStatus } from '../../infrastructure/persistence/uber-order-status.mapper';

import { UberTelemetryService } from '../observability/uber-telemetry.service';

@Injectable()
export class UberOrderSyncAdapter {
  private static readonly UBER_MODIFIER_COMBINATION_LIMIT = 100;
  private readonly telemetry: UberTelemetryService;
  private readonly payloadParser = new UberOrderPayloadParser();
  private readonly actionService: UberOrderActionService;
  private readonly outboxService: UberOrderOutboxService;
  private readonly statusSyncService: UberOrderStatusSyncService;

  constructor(
    private readonly prisma: PrismaService,
    private readonly uberAuthService: UberAuthService,
    private readonly orderEventsBus: OrderEventsBus,
    private readonly orderIngestionService: OrderIngestionService,
    private readonly httpClient: UberHttpClient,
    @Inject(UberConfigService) private readonly config: UberOrderConfig,
    private readonly prismaAccess: UberPrismaAccessService,
    private readonly orderGateway: UberOrderGateway,
    outboxService: UberOrderOutboxService,
    statusSyncService: UberOrderStatusSyncService,
    actionService: UberOrderActionService,
    @Optional() telemetry?: UberTelemetryService,
  ) {
    this.actionService = actionService;
    this.outboxService = outboxService;
    this.telemetry = telemetry ?? new UberTelemetryService(prisma);
    this.statusSyncService = statusSyncService;
  }

  async syncOrderStatusToUber(externalOrderId: string, status: OrderStatus) {
    const clientRequestId = this.toClientRequestId(externalOrderId);
    const order = await this.prisma.order.findUnique({
      where: { clientRequestId },
      select: { id: true, orderStableId: true, status: true },
    });

    if (!order) {
      await this.telemetry.captureEvent('ubereats_order_sync_failed', {
        externalOrderId,
        status,
        reason: 'order_not_found',
      });
      return {
        ok: false,
        externalOrderId,
        status,
        reason: 'ORDER_NOT_FOUND',
      };
    }

    const action = this.statusSyncService.actionFor(status);
    if (!action) {
      throw new BadRequestException(
        `本地状态 ${status} 没有 Uber 文档支持的外部动作`,
      );
    }

    try {
      UberOrderStateMachine.assertCanRequestAction(
        toUberOrderStatus(order.status),
        action,
      );
    } catch (error) {
      throw toUberEatsHttpException(error);
    }

    // Commit only the durable intent. A confirmed worker response owns the
    // local transition, so a timeout can never masquerade as Uber success.
    const updated = await this.prisma.$transaction(async (tx) => {
      await tx.uberOrderAction.upsert({
        where: { externalOrderId_action: { externalOrderId, action } },
        create: {
          externalOrderId,
          action,
          status: 'PENDING',
          businessVersion: 'v1',
          idempotencyKey: buildUberIdempotencyKey({
            taskId: `${externalOrderId}:${action}`,
            resourceId: externalOrderId,
            action,
            businessVersion: 'v1',
          }),
        },
        update: {},
      });
      return { orderStableId: order.orderStableId, status: order.status };
    });

    const queued = await this.outboxService.enqueue(externalOrderId, action);
    const result = this.toUberOrderActionResult(queued, true);

    await this.telemetry.captureEvent('ubereats_order_status_synced', {
      externalOrderId,
      orderStableId: updated.orderStableId,
      status,
      action,
      actionResult: result.ok ? 'SUCCEEDED' : 'FAILED',
    });

    return {
      ok: true,
      externalOrderId,
      orderStableId: updated.orderStableId,
      status: updated.status,
      action,
      localStatus: updated.status,
      uberSyncStatus: result.status,
      actionResult: result,
    };
  }

  private toUberOrderActionResult(
    record: UberOrderActionRecord,
    duplicate: boolean,
  ): UberOrderActionResult {
    return {
      ok: record.status === 'SUCCEEDED',
      action: record.action,
      actionId: record.id,
      status: record.status,
      retryable: record.retryable,
      duplicate,
      uberHttpStatus: record.uberHttpStatus,
    };
  }

  async listPendingUberOrders() {
    const rows = await this.prisma.order.findMany({
      where: {
        channel: Channel.ubereats,
        status: {
          in: [OrderStatus.pending, OrderStatus.paid, OrderStatus.making],
        },
      },
      orderBy: { createdAt: 'desc' },
      take: 100,
      select: {
        orderStableId: true,
        clientRequestId: true,
        status: true,
        totalCents: true,
        createdAt: true,
      },
    });

    return {
      count: rows.length,
      items: rows.map((row) => ({
        orderStableId: row.orderStableId,
        externalOrderId: row.clientRequestId?.replace('ubereats:', '') ?? null,
        status: row.status,
        totalCents: row.totalCents,
        createdAt: row.createdAt,
      })),
    };
  }

  async getPendingUberOrdersSummary() {
    const where = {
      channel: Channel.ubereats,
      status: {
        in: [OrderStatus.pending, OrderStatus.paid, OrderStatus.making],
      },
    };
    const [count, latest] = await Promise.all([
      this.prisma.order.count({ where }),
      this.prisma.order.findFirst({
        where,
        orderBy: { createdAt: 'desc' },
        select: { createdAt: true },
      }),
    ]);
    return { count, updatedAt: latest?.createdAt ?? null };
  }

  private async advanceLocalUberOrderStatusAfterAccept(
    externalOrderId: string,
  ): Promise<void> {
    if (this.orderIngestionService) {
      await this.orderIngestionService.markAccepted(
        this.toClientRequestId(externalOrderId),
      );
      return;
    }
    const orderDelegate = this.prisma.order;

    const clientRequestId = this.toClientRequestId(externalOrderId);
    const existing = await orderDelegate.findUnique({
      where: { clientRequestId },
      select: { id: true, orderStableId: true, status: true, paidAt: true },
    });

    if (
      !existing ||
      (existing.status !== OrderStatus.pending &&
        existing.status !== OrderStatus.paid)
    ) {
      return;
    }

    const advancedAt = new Date();
    const targetStatus = OrderStatus.making;
    const result = await orderDelegate.updateMany({
      where: {
        id: existing.id,
        status: { in: [OrderStatus.pending, OrderStatus.paid] },
      },
      data: {
        status: targetStatus,
        paidAt: existing.paidAt ?? advancedAt,
        makingAt: advancedAt,
      },
    });

    if (result.count === 0) {
      return;
    }

    if (existing.orderStableId) {
      this.orderEventsBus?.emitOrderAccepted({
        orderId: existing.id,
        stableId: existing.orderStableId,
      });
    }
  }

  private async advanceLocalUberOrderStatusAfterConfirmedAction(
    externalOrderId: string,
    action: UberOrderActionName,
  ): Promise<void> {
    if (action === 'ACCEPT') {
      await this.advanceLocalUberOrderStatusAfterAccept(externalOrderId);
      return;
    }
    if (action !== 'READY_FOR_PICKUP') return;
    await this.prisma.order.updateMany({
      where: {
        clientRequestId: this.toClientRequestId(externalOrderId),
        status: { in: [OrderStatus.paid, OrderStatus.making] },
      },
      data: { status: OrderStatus.ready, readyAt: new Date() },
    });
  }

  private uberCancellationAmendmentId(eventId: string): string {
    return `uber_cancel_${createHash('sha256').update(eventId).digest('hex')}`;
  }

  private async resolvePosStoreId(uberStoreId: string): Promise<string> {
    const delegate = this.prisma.uberStoreMapping;
    const mapping = await delegate.findUnique({
      where: { uberStoreId },
      select: { posExternalStoreId: true },
    });
    return mapping?.posExternalStoreId?.trim() || uberStoreId;
  }

  private async resolvePublishedPriceCents(
    tx: Prisma.TransactionClient,
    storeId: string | null | undefined,
    uberItemId: string | null,
    orderedAt: Date,
  ): Promise<number | null> {
    if (!storeId || !uberItemId) return null;
    const delegate = tx.uberPublishedMenuItem;
    const snapshot = await delegate.findFirst({
      where: {
        uberStoreId: storeId,
        uberItemId,
        publishedAt: { lte: orderedAt },
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
      select: { publishedPriceCents: true },
    });
    return snapshot?.publishedPriceCents ?? null;
  }

  private async resolveUberProductStableId(
    tx: Prisma.TransactionClient,
    storeId: string | null | undefined,
    item: ParsedUberOrderItem,
    orderedAt: Date,
  ): Promise<string> {
    let stableId: string | null = null;
    if (item.externalItemId?.startsWith('sanq:')) {
      if (storeId) {
        const snapshot = await tx.uberPublishedMenuItem.findFirst({
          where: {
            uberStoreId: storeId,
            uberItemId: item.externalItemId,
            publishedAt: { lte: orderedAt },
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
          select: { menuItemStableId: true },
        });
        if (snapshot) stableId = snapshot.menuItemStableId;
      }

      if (!stableId) {
        const localItems = await tx.menuItem.findMany({
          select: { stableId: true },
        });
        const deterministic = localItems.find(
          (candidate) =>
            this.buildStableUberNodeId(
              'item',
              storeId ?? 'default',
              candidate.stableId,
            ) === item.externalItemId,
        );
        if (deterministic) stableId = deterministic.stableId;
      }
    }

    const candidates = [item.stableIdHint, item.externalItemId].filter(
      (value): value is string => !!value,
    );
    if (!stableId && candidates.length) {
      const local = await tx.menuItem.findFirst({
        where: { stableId: { in: candidates } },
        select: { stableId: true },
      });
      if (local) stableId = local.stableId;
      const config =
        !stableId &&
        (await tx.uberItemChannelConfig.findFirst({
          where: {
            AND: [
              ...(storeId
                ? [{ OR: [{ storeId }, { uberStoreId: storeId }] }]
                : []),
              {
                OR: [
                  { externalItemId: { in: candidates } },
                  { menuItemStableId: { in: candidates } },
                ],
              },
            ],
          },
          select: { menuItemStableId: true },
        }));
      if (config) stableId = config.menuItemStableId;
    }
    if (!stableId) {
      // Historical/external items can outlive the menu/config that originally
      // published them. Keep the order consumable and let displayName remain
      // the immutable Uber snapshot used by every UI/print fallback.
      stableId =
        item.stableIdHint?.trim() ||
        item.externalItemId?.trim() ||
        `uber-unmapped-${createHash('sha256')
          .update(item.displayName)
          .digest('hex')
          .slice(0, 20)}`;
      this.telemetry.workflowLog(
        'warn',
        `[ubereats order] unmapped item retained externalItemId=${item.externalItemId ?? 'missing'}`,
      );
    }
    return stableId;
  }

  private flattenUberModifiers(
    items: ParsedUberModifier[],
  ): ParsedUberModifier[] {
    return items.flatMap((item) => [
      item,
      ...this.flattenUberModifiers(item.children),
    ]);
  }

  private async toOrderOptionsSnapshot(
    tx: Prisma.TransactionClient,
    storeId: string | null | undefined,
    items: ParsedUberModifier[],
  ): Promise<Prisma.InputJsonValue> {
    return Promise.all(
      items.map(async (item, index) => {
        const group = await this.resolveUberModifierGroup(
          tx,
          storeId,
          item.parentExternalId,
        );
        const choices = await Promise.all(
          this.flattenUberModifiers([item]).map(async (choice, choiceIndex) => {
            const mapped = await this.resolveUberModifierChoice(
              tx,
              storeId,
              choice.externalId,
            );
            return {
              stableId:
                mapped?.stableId ??
                choice.externalId ??
                `uber-option-${index}-${choiceIndex}`,
              templateGroupStableId:
                group?.stableId ??
                choice.parentExternalId ??
                `uber-group-${index}`,
              nameEn: mapped?.nameEn ?? null,
              nameZh: mapped?.nameZh ?? null,
              displayName: choice.displayName,
              priceDeltaCents: choice.priceDeltaCents,
              quantity: choice.quantity,
              specialInstructions: choice.specialInstructions,
              sortOrder: choiceIndex,
            };
          }),
        );
        return {
          templateGroupStableId:
            group?.stableId ?? item.parentExternalId ?? `uber-group-${index}`,
          nameEn: group?.nameEn ?? null,
          nameZh: group?.nameZh ?? null,
          displayName: group ? null : item.displayName,
          minSelect: 0,
          maxSelect: null,
          sortOrder: index,
          choices,
        };
      }),
    );
  }

  private async resolveUberModifierGroup(
    tx: Prisma.TransactionClient,
    storeId: string | null | undefined,
    externalId: string | null,
  ) {
    if (!externalId) return null;
    const templates = await tx.menuOptionGroupTemplate.findMany({
      select: { stableId: true, nameEn: true, nameZh: true },
    });
    let stableId = templates.find(
      (template) =>
        template.stableId === externalId ||
        this.buildStableUberNodeId(
          'group',
          storeId ?? 'default',
          template.stableId,
        ) === externalId,
    )?.stableId;
    if (!stableId) {
      const config = await tx.uberModifierGroupConfig.findFirst({
        where: {
          ...(storeId ? { OR: [{ storeId }, { uberStoreId: storeId }] } : {}),
          externalModifierGroupId: externalId,
        },
        select: { templateGroupStableId: true },
      });
      stableId = config?.templateGroupStableId;
    }
    const template = templates.find(
      (candidate) => candidate.stableId === stableId,
    );
    return template
      ? {
          stableId: template.stableId,
          nameEn: template.nameEn,
          nameZh: template.nameZh,
        }
      : null;
  }

  private async resolveUberModifierChoice(
    tx: Prisma.TransactionClient,
    storeId: string | null | undefined,
    externalId: string | null,
  ) {
    if (!externalId) return null;
    const choices = await tx.menuOptionTemplateChoice.findMany({
      select: { stableId: true, nameEn: true, nameZh: true },
    });
    let stableId = choices.find(
      (choice) =>
        choice.stableId === externalId ||
        this.buildStableUberNodeId(
          'item',
          storeId ?? 'default',
          choice.stableId,
        ) === externalId,
    )?.stableId;
    if (!stableId) {
      const config = await tx.uberOptionItemConfig.findFirst({
        where: {
          ...(storeId ? { OR: [{ storeId }, { uberStoreId: storeId }] } : {}),
          externalItemId: externalId,
        },
        select: { optionChoiceStableId: true },
      });
      stableId = config?.optionChoiceStableId;
    }
    const choice = choices.find((candidate) => candidate.stableId === stableId);
    return choice
      ? {
          stableId: choice.stableId,
          nameEn: choice.nameEn,
          nameZh: choice.nameZh,
        }
      : null;
  }

  private validateOrderAmounts(order: ParsedUberOrder) {
    return validateUberOrderAmounts(order);
  }

  private parseOrderPayload(payload: unknown): ParsedUberOrder | null {
    return this.payloadParser.parse(payload);
  }

  private mapEventTypeToOrderStatus(eventType: string): OrderStatus | null {
    return mapUberEventTypeToOrderStatus(eventType);
  }

  private toClientRequestId(externalOrderId: string): string {
    return `ubereats:${externalOrderId}`;
  }

  private buildStableUberNodeId(
    nodeType: 'menu' | 'item' | 'group' | 'category' | 'publish',
    storeId: string,
    sourceStableId: string,
  ): string {
    const raw = `${nodeType}:${storeId}:${sourceStableId}`;
    return `sanq:${createHash('sha1').update(raw).digest('hex').slice(0, 24)}`;
  }

  private async ensureBusinessConfig() {
    const config = await this.prisma.businessConfig.findUnique({
      where: { id: 1 },
    });

    if (config) return config;

    return this.prisma.businessConfig.create({
      data: {
        id: 1,
        storeName: '',
      },
    });
  }

  private readDate(...values: unknown[]): Date | null {
    for (const value of values) {
      if (typeof value === 'string' || typeof value === 'number') {
        const date = new Date(value);
        if (!Number.isNaN(date.getTime())) return date;
      }
    }
    return null;
  }

  private asObject(value: unknown): Record<string, unknown> | null {
    if (value && typeof value === 'object' && !Array.isArray(value)) {
      return value as Record<string, unknown>;
    }
    return null;
  }

  private readString(...values: unknown[]): string | null {
    for (const value of values) {
      if (typeof value === 'string') {
        const trimmed = value.trim();
        if (trimmed.length > 0) return trimmed;
      }
    }
    return null;
  }

  private readCents(
    primary: unknown,
    fallback: unknown,
    defaultValue: number,
  ): number {
    const direct = this.toFiniteNumber(primary);
    if (direct !== null) return Math.max(0, Math.round(direct));

    const money = this.asObject(primary);
    const amount = this.toFiniteNumber(money?.amount);
    if (amount !== null) return Math.max(0, Math.round(amount));
    const value = this.toFiniteNumber(money?.value);
    if (value !== null) return Math.max(0, Math.round(value));

    const second = this.toFiniteNumber(fallback);
    if (second !== null) return Math.max(0, Math.round(second));

    return Math.max(0, Math.round(defaultValue));
  }

  private readOptionalCents(value: unknown): number | null {
    const direct = this.toFiniteNumber(value);
    if (direct !== null) return Math.max(0, Math.round(direct));

    const money = this.asObject(value);
    const amount = this.toFiniteNumber(money?.amount);
    if (amount !== null) return Math.max(0, Math.round(amount));
    const nestedValue = this.toFiniteNumber(money?.value);
    if (nestedValue !== null) return Math.max(0, Math.round(nestedValue));

    return null;
  }

  private toFiniteNumber(value: unknown): number | null {
    if (typeof value === 'number' && Number.isFinite(value)) return value;
    if (typeof value === 'string' && value.trim().length > 0) {
      const parsed = Number(value);
      if (Number.isFinite(parsed)) return parsed;
    }
    return null;
  }
}
