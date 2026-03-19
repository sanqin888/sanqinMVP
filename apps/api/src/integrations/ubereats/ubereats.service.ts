//apps/api/src/integrations/ubereats/ubereats.service.ts
import {
  BadRequestException,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import {
  Channel,
  OrderStatus,
  PaymentMethod,
  UberMenuPublishStatus,
  UberOpsTicketPriority,
  UberOpsTicketStatus,
  UberOpsTicketType,
  type Prisma,
} from '@prisma/client';
import { createHmac, timingSafeEqual } from 'crypto';
import { AppLogger } from '../../common/app-logger';
import { PrismaService } from '../../prisma/prisma.service';
import { UberAuthService } from './uber-auth.service';

type UberWebhookInput = {
  headers: Record<string, unknown>;
  body: unknown;
  rawBody: string;
};

type ParsedUberOrder = {
  externalOrderId: string;
  storeId?: string | null;
  subtotalCents: number;
  taxCents: number;
  totalCents: number;
  contactName?: string | null;
  contactPhone?: string | null;
  paidAt: Date;
};

type UberStoreScopedInput = {
  storeId?: string;
};

type UpsertPriceBookItemInput = UberStoreScopedInput & {
  menuItemStableId: string;
  priceCents: number;
  isAvailable?: boolean;
};

type PublishMenuInput = UberStoreScopedInput & {
  dryRun?: boolean;
};

type SyncAvailabilityInput = UberStoreScopedInput & {
  menuItemStableId: string;
  isAvailable: boolean;
};

type GenerateReconciliationReportInput = UberStoreScopedInput & {
  rangeStart?: string;
  rangeEnd?: string;
};

type CreateOpsTicketInput = UberStoreScopedInput & {
  type: UberOpsTicketType;
  title: string;
  description?: string;
  priority?: UberOpsTicketPriority;
  externalOrderId?: string;
  menuItemStableId?: string;
  context?: Prisma.JsonObject;
};

@Injectable()
export class UberEatsService {
  private readonly logger = new AppLogger(UberEatsService.name);
  private readonly uberApiBaseUrl =
    process.env.UBER_EATS_API_BASE_URL?.trim() || 'https://api.uber.com';

  constructor(
    private readonly prisma: PrismaService,
    private readonly uberAuthService: UberAuthService,
  ) {}

  async debugAccessToken() {
    const token = await this.uberAuthService.getAccessToken();

    return {
      ok: true,
      tokenPrefix: token.slice(0, 12),
      tokenLength: token.length,
    };
  }

  async debugCreatedOrders(storeId?: string) {
    const normalizedStoreId = this.normalizeStoreId(storeId);
    const token = await this.uberAuthService.getAccessToken(
      'eats.store.orders.read',
    );
    const url = this.buildCreatedOrdersUrl(normalizedStoreId);

    let response: Response;
    try {
      response = await fetch(url, {
        method: 'GET',
        headers: {
          Authorization: `Bearer ${token}`,
          Accept: 'application/json',
        },
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      this.logger.error(
        `[ubereats debug] created-orders request failed storeId=${normalizedStoreId} message=${message}`,
      );
      throw new BadRequestException({
        ok: false,
        storeId: normalizedStoreId,
        message: '调用 Uber created-orders 接口失败',
        detail: message,
      });
    }

    const rawText = await response.text();
    const parsed = this.tryParseJson(rawText);

    if (!response.ok) {
      const detail = this.summarizeDebugResponse(parsed, rawText);
      this.logger.error(
        `[ubereats debug] created-orders upstream error storeId=${normalizedStoreId} status=${response.status} detail=${detail}`,
      );
      throw new BadRequestException({
        ok: false,
        storeId: normalizedStoreId,
        status: response.status,
        message: 'Uber created-orders 接口返回错误',
        detail,
      });
    }

    const orders = this.extractCreatedOrders(parsed);

    this.logger.log(
      `[ubereats debug] created-orders success storeId=${normalizedStoreId} count=${orders.length}`,
    );

    return {
      ok: true,
      storeId: normalizedStoreId,
      tokenPrefix: token.slice(0, 12),
      tokenLength: token.length,
      orderCount: orders.length,
      orders: orders.map((order) => ({
        id: order.id,
        currentState: order.current_state,
        placedAt: order.placed_at,
      })),
    };
  }

  async handleWebhook(input: UberWebhookInput): Promise<void> {
    this.verifyWebhookSignature(input.headers, input.rawBody);

    const eventType = this.readEventType(input.body);
    const eventId =
      this.readEventId(input.headers, input.body) ??
      `no-event-id:${eventType}:${this.hashForFallback(input.rawBody)}`;

    this.logger.log(
      `[ubereats webhook] eventType=${eventType} eventId=${eventId} bodyLength=${input.rawBody.length}`,
    );

    const alreadySeen = await this.hasSeenWebhookEvent(eventId);
    if (alreadySeen) {
      this.logger.warn(
        `[ubereats webhook] duplicate ignored eventType=${eventType} eventId=${eventId}`,
      );
      return;
    }

    switch (this.normalizeEventType(eventType)) {
      case 'orders.notification':
      case 'orders.accepted':
      case 'orders.in_progress':
      case 'orders.making':
      case 'orders.ready_for_pickup':
      case 'orders.completed':
      case 'orders.cancelled':
      case 'orders.rejected':
        await this.handleOrderWebhook(eventType, eventId, input.body);
        return;

      case 'store.provisioned':
        await this.handleStoreProvisionedWebhook(
          eventType,
          eventId,
          input.body,
        );
        return;

      case 'store.deprovisioned':
        await this.handleStoreDeprovisionedWebhook(
          eventType,
          eventId,
          input.body,
        );
        return;

      case 'store.status.changed':
        await this.handleStoreStatusChangedWebhook(
          eventType,
          eventId,
          input.body,
        );
        return;

      default:
        await this.captureEvent('ubereats_webhook_unhandled', {
          eventType,
          eventId,
        });
        return;
    }
  }

  async syncOrderStatusToUber(externalOrderId: string, status: OrderStatus) {
    const clientRequestId = this.toClientRequestId(externalOrderId);
    const order = await this.prisma.order.findUnique({
      where: { clientRequestId },
      select: { id: true, orderStableId: true },
    });

    if (!order) {
      await this.captureEvent('ubereats_order_sync_failed', {
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

    const updated = await this.prisma.order.update({
      where: { id: order.id },
      data: { status },
      select: { orderStableId: true, status: true },
    });

    await this.captureEvent('ubereats_order_status_synced', {
      externalOrderId,
      orderStableId: updated.orderStableId,
      status,
    });

    return {
      ok: true,
      externalOrderId,
      orderStableId: updated.orderStableId,
      status: updated.status,
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

  async syncStoreStatusToUber() {
    const config = await this.ensureBusinessConfig();

    const payload = {
      isOpen: !config.isTemporarilyClosed,
      isTemporarilyClosed: config.isTemporarilyClosed,
      temporaryCloseReason: config.temporaryCloseReason,
      updatedAt: config.updatedAt,
    };

    await this.captureEvent('ubereats_store_status_synced', {
      ...payload,
      updatedAt: payload.updatedAt.toISOString(),
    });

    return {
      ok: true,
      payload,
    };
  }

  async listUberPriceBook(storeId?: string) {
    const normalizedStoreId = this.normalizeStoreId(storeId);
    const items = await this.prisma.uberPriceBookItem.findMany({
      where: { storeId: normalizedStoreId },
      orderBy: { updatedAt: 'desc' },
      take: 500,
      select: {
        menuItemStableId: true,
        priceCents: true,
        isAvailable: true,
        updatedAt: true,
      },
    });

    return {
      storeId: normalizedStoreId,
      count: items.length,
      items,
    };
  }

  async upsertUberPriceBookItem(input: UpsertPriceBookItemInput) {
    const normalizedStoreId = this.normalizeStoreId(input.storeId);
    await this.ensureMenuItemExists(input.menuItemStableId);

    const row = await this.prisma.uberPriceBookItem.upsert({
      where: {
        storeId_menuItemStableId: {
          storeId: normalizedStoreId,
          menuItemStableId: input.menuItemStableId,
        },
      },
      create: {
        storeId: normalizedStoreId,
        menuItemStableId: input.menuItemStableId,
        priceCents: Math.max(1, Math.round(input.priceCents)),
        isAvailable: input.isAvailable ?? true,
      },
      update: {
        priceCents: Math.max(1, Math.round(input.priceCents)),
        ...(typeof input.isAvailable === 'boolean'
          ? { isAvailable: input.isAvailable }
          : {}),
      },
    });

    await this.captureEvent('ubereats_price_book_item_upserted', {
      storeId: normalizedStoreId,
      menuItemStableId: input.menuItemStableId,
      priceCents: row.priceCents,
      isAvailable: row.isAvailable,
    });

    return {
      ok: true,
      storeId: normalizedStoreId,
      item: row,
    };
  }

  async publishUberMenu(input: PublishMenuInput) {
    const normalizedStoreId = this.normalizeStoreId(input.storeId);
    const pairs = await this.collectPublishItems(normalizedStoreId);
    const changedItems = pairs.filter((pair) => pair.hasDelta).length;

    const payload: Prisma.JsonObject = {
      storeId: normalizedStoreId,
      dryRun: !!input.dryRun,
      items: pairs.map((pair) => ({
        menuItemStableId: pair.menuItemStableId,
        basePriceCents: pair.basePriceCents,
        uberPriceCents: pair.uberPriceCents,
        isAvailable: pair.isAvailable,
      })),
      summary: {
        totalItems: pairs.length,
        changedItems,
      },
    };

    if (input.dryRun) {
      await this.captureEvent('ubereats_menu_publish_dry_run', payload);
      return {
        ok: true,
        dryRun: true,
        storeId: normalizedStoreId,
        totalItems: pairs.length,
        changedItems,
      };
    }

    const version = await this.prisma.uberMenuPublishVersion.create({
      data: {
        storeId: normalizedStoreId,
        status: UberMenuPublishStatus.SUCCESS,
        totalItems: pairs.length,
        changedItems,
        payload,
      },
      select: {
        versionStableId: true,
        createdAt: true,
      },
    });

    await this.captureEvent('ubereats_menu_published', {
      storeId: normalizedStoreId,
      versionStableId: version.versionStableId,
      totalItems: pairs.length,
      changedItems,
    });

    return {
      ok: true,
      dryRun: false,
      storeId: normalizedStoreId,
      versionStableId: version.versionStableId,
      createdAt: version.createdAt,
      totalItems: pairs.length,
      changedItems,
    };
  }

  async syncMenuItemAvailability(input: SyncAvailabilityInput) {
    const normalizedStoreId = this.normalizeStoreId(input.storeId);
    await this.ensureMenuItemExists(input.menuItemStableId);

    const priceBookItem = await this.prisma.uberPriceBookItem.findUnique({
      where: {
        storeId_menuItemStableId: {
          storeId: normalizedStoreId,
          menuItemStableId: input.menuItemStableId,
        },
      },
    });

    if (!priceBookItem) {
      throw new BadRequestException(
        `未找到 ${input.menuItemStableId} 的 Uber 价目表配置，请先配置 price book`,
      );
    }

    const updated = await this.prisma.uberPriceBookItem.update({
      where: {
        storeId_menuItemStableId: {
          storeId: normalizedStoreId,
          menuItemStableId: input.menuItemStableId,
        },
      },
      data: {
        isAvailable: input.isAvailable,
      },
      select: {
        menuItemStableId: true,
        isAvailable: true,
        updatedAt: true,
      },
    });

    await this.captureEvent('ubereats_menu_item_availability_synced', {
      storeId: normalizedStoreId,
      menuItemStableId: input.menuItemStableId,
      isAvailable: updated.isAvailable,
    });

    return {
      ok: true,
      storeId: normalizedStoreId,
      item: updated,
    };
  }

  async generateReconciliationReport(input: GenerateReconciliationReportInput) {
    const normalizedStoreId = this.normalizeStoreId(input.storeId);
    const range = this.resolveReportRange(input.rangeStart, input.rangeEnd);

    const [orders, failedSyncEvents, openTickets] = await Promise.all([
      this.prisma.order.findMany({
        where: {
          channel: Channel.ubereats,
          createdAt: {
            gte: range.rangeStart,
            lt: range.rangeEnd,
          },
        },
        select: {
          status: true,
          totalCents: true,
        },
      }),
      this.prisma.analyticsEvent.count({
        where: {
          source: 'ubereats',
          eventName: {
            in: [
              'ubereats_order_sync_failed',
              'ubereats_menu_publish_failed',
              'ubereats_menu_item_availability_sync_failed',
            ],
          },
          createdAt: {
            gte: range.rangeStart,
            lt: range.rangeEnd,
          },
        },
      }),
      this.prisma.uberOpsTicket.count({
        where: {
          storeId: normalizedStoreId,
          status: {
            in: [UberOpsTicketStatus.OPEN, UberOpsTicketStatus.IN_PROGRESS],
          },
        },
      }),
    ]);

    const summary = {
      totalOrders: orders.length,
      totalAmountCents: orders.reduce((sum, row) => sum + row.totalCents, 0),
      syncedOrders: orders.filter((row) => row.status !== OrderStatus.pending)
        .length,
      pendingOrders: orders.filter((row) => row.status === OrderStatus.pending)
        .length,
      failedSyncEvents,
      discrepancyOrders: openTickets,
    };

    const payload: Prisma.JsonObject = {
      rangeStart: range.rangeStart.toISOString(),
      rangeEnd: range.rangeEnd.toISOString(),
      summary,
    };

    const report = await this.prisma.uberReconciliationReport.create({
      data: {
        storeId: normalizedStoreId,
        rangeStart: range.rangeStart,
        rangeEnd: range.rangeEnd,
        ...summary,
        payload,
      },
      select: {
        reportStableId: true,
        createdAt: true,
      },
    });

    await this.captureEvent('ubereats_reconciliation_report_generated', {
      storeId: normalizedStoreId,
      reportStableId: report.reportStableId,
      ...summary,
    });

    return {
      ok: true,
      storeId: normalizedStoreId,
      reportStableId: report.reportStableId,
      createdAt: report.createdAt,
      ...summary,
      rangeStart: range.rangeStart,
      rangeEnd: range.rangeEnd,
    };
  }

  async listReconciliationReports(storeId?: string, limit = 20) {
    const normalizedStoreId = this.normalizeStoreId(storeId);
    const take = Math.min(Math.max(1, Number(limit) || 20), 100);

    const rows = await this.prisma.uberReconciliationReport.findMany({
      where: { storeId: normalizedStoreId },
      orderBy: { createdAt: 'desc' },
      take,
      select: {
        reportStableId: true,
        rangeStart: true,
        rangeEnd: true,
        totalOrders: true,
        totalAmountCents: true,
        failedSyncEvents: true,
        discrepancyOrders: true,
        createdAt: true,
      },
    });

    return {
      storeId: normalizedStoreId,
      count: rows.length,
      items: rows,
    };
  }

  async createOpsTicket(input: CreateOpsTicketInput) {
    const normalizedStoreId = this.normalizeStoreId(input.storeId);

    if (input.externalOrderId) {
      await this.ensureUberOrderExists(input.externalOrderId);
    }
    if (input.menuItemStableId) {
      await this.ensureMenuItemExists(input.menuItemStableId);
    }

    const ticket = await this.prisma.uberOpsTicket.create({
      data: {
        storeId: normalizedStoreId,
        type: input.type,
        status: UberOpsTicketStatus.OPEN,
        priority: input.priority ?? UberOpsTicketPriority.MEDIUM,
        title: input.title,
        description: input.description,
        externalOrderId: input.externalOrderId,
        menuItemStableId: input.menuItemStableId,
        context: input.context,
      },
      select: {
        ticketStableId: true,
        status: true,
        priority: true,
        createdAt: true,
      },
    });

    await this.captureEvent('ubereats_ops_ticket_created', {
      storeId: normalizedStoreId,
      ticketStableId: ticket.ticketStableId,
      type: input.type,
      priority: ticket.priority,
    });

    return {
      ok: true,
      storeId: normalizedStoreId,
      ...ticket,
    };
  }

  async listOpsTickets(storeId?: string, status?: UberOpsTicketStatus) {
    const normalizedStoreId = this.normalizeStoreId(storeId);
    const rows = await this.prisma.uberOpsTicket.findMany({
      where: {
        storeId: normalizedStoreId,
        ...(status ? { status } : {}),
      },
      orderBy: [{ status: 'asc' }, { priority: 'desc' }, { createdAt: 'desc' }],
      take: 200,
      select: {
        ticketStableId: true,
        type: true,
        status: true,
        priority: true,
        title: true,
        externalOrderId: true,
        menuItemStableId: true,
        retryCount: true,
        lastError: true,
        createdAt: true,
        updatedAt: true,
      },
    });

    return {
      storeId: normalizedStoreId,
      count: rows.length,
      items: rows,
    };
  }

  async retryOpsTicket(ticketStableId: string) {
    const ticket = await this.prisma.uberOpsTicket.findUnique({
      where: { ticketStableId },
    });

    if (!ticket) {
      throw new BadRequestException(`工单 ${ticketStableId} 不存在`);
    }

    let errorMessage: string | null = null;

    try {
      await this.prisma.uberOpsTicket.update({
        where: { ticketStableId },
        data: { status: UberOpsTicketStatus.IN_PROGRESS },
      });

      if (ticket.type === UberOpsTicketType.ORDER_STATUS_SYNC) {
        if (!ticket.externalOrderId) {
          throw new BadRequestException('订单状态同步工单缺少 externalOrderId');
        }
        await this.syncOrderStatusToUber(
          ticket.externalOrderId,
          OrderStatus.paid,
        );
      } else if (ticket.type === UberOpsTicketType.STORE_STATUS_SYNC) {
        await this.syncStoreStatusToUber();
      } else if (ticket.type === UberOpsTicketType.MENU_PUBLISH) {
        await this.publishUberMenu({ storeId: ticket.storeId, dryRun: false });
      } else if (ticket.type === UberOpsTicketType.MENU_ITEM_AVAILABILITY) {
        if (!ticket.menuItemStableId) {
          throw new BadRequestException('商品状态工单缺少 menuItemStableId');
        }
        await this.syncMenuItemAvailability({
          storeId: ticket.storeId,
          menuItemStableId: ticket.menuItemStableId,
          isAvailable: true,
        });
      }
    } catch (error) {
      errorMessage = error instanceof Error ? error.message : 'unknown_error';
    }

    const updated = await this.prisma.uberOpsTicket.update({
      where: { ticketStableId },
      data: errorMessage
        ? {
            status: UberOpsTicketStatus.OPEN,
            retryCount: { increment: 1 },
            lastError: errorMessage,
          }
        : {
            status: UberOpsTicketStatus.RESOLVED,
            retryCount: { increment: 1 },
            lastError: null,
            resolvedAt: new Date(),
          },
      select: {
        ticketStableId: true,
        status: true,
        retryCount: true,
        lastError: true,
        resolvedAt: true,
      },
    });

    await this.captureEvent('ubereats_ops_ticket_retried', {
      ticketStableId,
      status: updated.status,
      retryCount: updated.retryCount,
      ...(updated.lastError ? { lastError: updated.lastError } : {}),
    });

    return {
      ok: !updated.lastError,
      ...updated,
    };
  }

  private async handleOrderWebhook(
    eventType: string,
    eventId: string,
    payload: unknown,
  ) {
    const parsedOrder = this.parseOrderPayload(payload);

    if (!parsedOrder) {
      await this.captureEvent('ubereats_order_webhook_parse_failed', {
        eventType,
        eventId,
      });
      return;
    }

    const order = await this.upsertUberOrder(parsedOrder, eventType);

    await this.captureEvent('ubereats_webhook_processed', {
      eventType,
      eventId,
      externalOrderId: parsedOrder.externalOrderId,
      orderStableId: order.orderStableId,
      storeId: parsedOrder.storeId ?? this.normalizeStoreId(undefined),
    });
  }

  private async handleStoreProvisionedWebhook(
    eventType: string,
    eventId: string,
    payload: unknown,
  ) {
    const storeId = this.extractStoreId(payload);

    await this.captureEvent('ubereats_store_provisioned', {
      eventType,
      eventId,
      storeId: storeId ?? 'unknown',
    });
  }

  private async handleStoreDeprovisionedWebhook(
    eventType: string,
    eventId: string,
    payload: unknown,
  ) {
    const storeId = this.extractStoreId(payload);

    await this.captureEvent('ubereats_store_deprovisioned', {
      eventType,
      eventId,
      storeId: storeId ?? 'unknown',
    });
  }

  private async handleStoreStatusChangedWebhook(
    eventType: string,
    eventId: string,
    payload: unknown,
  ) {
    const storeId = this.extractStoreId(payload);

    await this.captureEvent('ubereats_store_status_changed', {
      eventType,
      eventId,
      storeId: storeId ?? 'unknown',
    });
  }

  private resolveReportRange(rangeStart?: string, rangeEnd?: string) {
    const end = rangeEnd ? new Date(rangeEnd) : new Date();
    const start = rangeStart
      ? new Date(rangeStart)
      : new Date(end.getTime() - 24 * 60 * 60 * 1000);

    if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime())) {
      throw new BadRequestException('对账时间范围格式不正确');
    }

    if (start >= end) {
      throw new BadRequestException('对账时间范围不合法：start 必须早于 end');
    }

    return {
      rangeStart: start,
      rangeEnd: end,
    };
  }

  private async ensureUberOrderExists(externalOrderId: string) {
    const row = await this.prisma.order.findUnique({
      where: {
        clientRequestId: this.toClientRequestId(externalOrderId),
      },
      select: { id: true },
    });

    if (!row) {
      throw new BadRequestException(`Uber 订单 ${externalOrderId} 不存在`);
    }
  }

  private async collectPublishItems(storeId: string) {
    const [menuItems, priceBookItems] = await Promise.all([
      this.prisma.menuItem.findMany({
        where: { deletedAt: null },
        select: {
          stableId: true,
          basePriceCents: true,
          isAvailable: true,
        },
      }),
      this.prisma.uberPriceBookItem.findMany({
        where: { storeId },
        select: {
          menuItemStableId: true,
          priceCents: true,
          isAvailable: true,
        },
      }),
    ]);

    const priceMap = new Map(
      priceBookItems.map((item) => [item.menuItemStableId, item]),
    );

    return menuItems.map((menuItem) => {
      const priceBookItem = priceMap.get(menuItem.stableId);
      const uberPriceCents =
        priceBookItem?.priceCents ?? menuItem.basePriceCents;
      const isAvailable =
        priceBookItem?.isAvailable !== undefined
          ? priceBookItem.isAvailable
          : menuItem.isAvailable;

      return {
        menuItemStableId: menuItem.stableId,
        basePriceCents: menuItem.basePriceCents,
        uberPriceCents,
        isAvailable,
        hasDelta:
          uberPriceCents !== menuItem.basePriceCents ||
          isAvailable !== menuItem.isAvailable,
      };
    });
  }

  private async upsertUberOrder(order: ParsedUberOrder, eventType: string) {
    const clientRequestId = this.toClientRequestId(order.externalOrderId);
    const mappedStatus = this.mapEventTypeToOrderStatus(eventType);

    const existing = await this.prisma.order.findUnique({
      where: { clientRequestId },
      select: {
        id: true,
        orderStableId: true,
        status: true,
      },
    });

    if (!existing) {
      const created = await this.prisma.order.create({
        data: {
          channel: Channel.ubereats,
          clientRequestId,
          status: mappedStatus,
          paidAt: order.paidAt,
          paymentMethod: PaymentMethod.UBEREATS,
          subtotalCents: order.subtotalCents,
          taxCents: order.taxCents,
          totalCents: order.totalCents,
          paymentTotalCents: order.totalCents,
          contactName: order.contactName,
          contactPhone: order.contactPhone,
        },
        select: {
          orderStableId: true,
          status: true,
        },
      });

      await this.captureEvent('ubereats_order_upserted', {
        eventType,
        externalOrderId: order.externalOrderId,
        orderStableId: created.orderStableId,
        mappedStatus: created.status,
        action: 'created',
      });

      return { orderStableId: created.orderStableId };
    }

    const nextStatus = this.shouldAdvanceOrderStatus(
      existing.status,
      mappedStatus,
    )
      ? mappedStatus
      : existing.status;

    const updated = await this.prisma.order.update({
      where: { id: existing.id },
      data: {
        status: nextStatus,
        subtotalCents: order.subtotalCents,
        taxCents: order.taxCents,
        totalCents: order.totalCents,
        paymentTotalCents: order.totalCents,
        contactName: order.contactName,
        contactPhone: order.contactPhone,
      },
      select: {
        orderStableId: true,
        status: true,
      },
    });

    await this.captureEvent('ubereats_order_upserted', {
      eventType,
      externalOrderId: order.externalOrderId,
      orderStableId: updated.orderStableId,
      mappedStatus,
      finalStatus: updated.status,
      action: 'updated',
    });

    return { orderStableId: updated.orderStableId };
  }

  private parseOrderPayload(payload: unknown): ParsedUberOrder | null {
    if (!payload || typeof payload !== 'object') return null;

    const root = payload as Record<string, unknown>;
    const dataNode = this.asObject(root.data);
    const orderNode =
      this.asObject(root.order) ?? this.asObject(dataNode?.order) ?? dataNode;

    if (!orderNode) return null;

    const externalOrderId = this.readString(
      orderNode.order_id,
      orderNode.id,
      orderNode.external_order_id,
      orderNode.display_id,
    );
    if (!externalOrderId) return null;

    const subtotalCents = this.readCents(
      orderNode.subtotal,
      orderNode.subtotal_cents,
      0,
    );
    const taxCents = this.readCents(orderNode.tax, orderNode.tax_cents, 0);
    const totalCents = this.readCents(
      orderNode.total,
      orderNode.total_cents,
      subtotalCents + taxCents,
    );

    const customer =
      this.asObject(orderNode.customer) ??
      this.asObject(orderNode.eater) ??
      orderNode;

    const paidAt = this.readDate(
      orderNode.paid_at,
      orderNode.created_at,
      orderNode.placed_at,
      root.created_at,
    );

    return {
      externalOrderId,
      storeId:
        this.readString(
          orderNode.store_id,
          dataNode?.store_id,
          root.store_id,
        ) ?? null,
      subtotalCents,
      taxCents,
      totalCents,
      contactName: this.readString(customer.name, customer.full_name),
      contactPhone: this.readString(customer.phone, customer.phone_number),
      paidAt: paidAt ?? new Date(),
    };
  }

  private readEventType(payload: unknown): string {
    if (!payload || typeof payload !== 'object') return 'unknown';
    const root = payload as Record<string, unknown>;
    return (
      this.readString(root.event_type, root.type, root.action) ?? 'unknown'
    );
  }

  private normalizeEventType(eventType: string): string {
    return eventType.trim().toLowerCase();
  }

  private mapEventTypeToOrderStatus(eventType: string): OrderStatus {
    const normalized = this.normalizeEventType(eventType);

    if (normalized.includes('complete')) return OrderStatus.completed;
    if (normalized.includes('ready')) return OrderStatus.ready;
    if (normalized.includes('progress') || normalized.includes('making')) {
      return OrderStatus.making;
    }
    if (normalized.includes('cancel') || normalized.includes('reject')) {
      return OrderStatus.refunded;
    }
    if (normalized.includes('accept')) return OrderStatus.paid;
    if (normalized.includes('notification')) return OrderStatus.pending;

    return OrderStatus.pending;
  }

  private shouldAdvanceOrderStatus(
    current: OrderStatus,
    next: OrderStatus,
  ): boolean {
    const rank: Partial<Record<OrderStatus, number>> = {
      [OrderStatus.pending]: 10,
      [OrderStatus.paid]: 20,
      [OrderStatus.making]: 30,
      [OrderStatus.ready]: 40,
      [OrderStatus.completed]: 50,
      [OrderStatus.refunded]: 60,
    };

    return (rank[next] ?? 0) >= (rank[current] ?? 0);
  }

  private toClientRequestId(externalOrderId: string): string {
    return `ubereats:${externalOrderId}`;
  }

  private buildCreatedOrdersUrl(storeId: string): string {
    const base = this.uberApiBaseUrl.replace(/\/$/, '');
    return `${base}/v1/eats/stores/${encodeURIComponent(storeId)}/created-orders`;
  }

  private tryParseJson(rawText: string): unknown {
    if (!rawText) {
      return null;
    }

    try {
      return JSON.parse(rawText);
    } catch {
      return null;
    }
  }

  private summarizeDebugResponse(parsed: unknown, rawText: string): string {
    if (parsed && typeof parsed === 'object') {
      return JSON.stringify(parsed).slice(0, 500);
    }

    return rawText.slice(0, 500) || 'empty response body';
  }

  private extractCreatedOrders(
    payload: unknown,
  ): Array<{ id?: string; current_state?: string; placed_at?: string }> {
    if (!payload || typeof payload !== 'object') {
      return [];
    }

    const orders = (payload as { orders?: unknown }).orders;
    if (!Array.isArray(orders)) {
      return [];
    }

    return orders
      .filter(
        (order): order is Record<string, unknown> =>
          !!order && typeof order === 'object',
      )
      .map((order) => ({
        id: typeof order.id === 'string' ? order.id : undefined,
        current_state:
          typeof order.current_state === 'string'
            ? order.current_state
            : undefined,
        placed_at:
          typeof order.placed_at === 'string' ? order.placed_at : undefined,
      }));
  }

  private normalizeStoreId(storeId?: string): string {
    return storeId?.trim() || 'default';
  }

  private async ensureMenuItemExists(menuItemStableId: string) {
    const menuItem = await this.prisma.menuItem.findUnique({
      where: { stableId: menuItemStableId },
      select: { stableId: true },
    });

    if (!menuItem) {
      throw new BadRequestException(`菜单项 ${menuItemStableId} 不存在`);
    }
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

  private async captureEvent(eventName: string, payload: Prisma.JsonObject) {
    await this.prisma.analyticsEvent.create({
      data: {
        eventName,
        source: 'ubereats',
        payload,
      },
    });
  }

  private verifyWebhookSignature(
    headers: Record<string, unknown>,
    rawBody: string,
  ) {
    const configuredSecret = process.env.UBER_EATS_CLIENT_SECRET?.trim();
    if (!configuredSecret) {
      throw new Error('UBER_EATS_CLIENT_SECRET 未配置');
    }

    const receivedSignature = this.readHeader(
      headers,
      'x-uber-signature',
      'x-uber-eats-signature',
    );

    if (!receivedSignature) {
      throw new UnauthorizedException('Missing Uber signature header');
    }

    const expected = createHmac('sha256', configuredSecret)
      .update(rawBody, 'utf8')
      .digest('hex');

    const expectedBuffer = Buffer.from(expected, 'utf8');
    const receivedBuffer = Buffer.from(receivedSignature.trim(), 'utf8');

    if (
      expectedBuffer.length !== receivedBuffer.length ||
      !timingSafeEqual(expectedBuffer, receivedBuffer)
    ) {
      throw new UnauthorizedException('Invalid Uber signature');
    }
  }

  private readEventId(
    headers: Record<string, unknown>,
    payload: unknown,
  ): string | null {
    const fromHeader = this.readHeader(
      headers,
      'x-request-id',
      'x-uber-request-id',
      'x-event-id',
      'uber-event-id',
    );
    if (fromHeader) return fromHeader;

    if (!payload || typeof payload !== 'object') return null;
    const root = payload as Record<string, unknown>;
    return this.readString(
      root.event_id,
      root.id,
      this.asObject(root.data)?.id,
    );
  }

  private async hasSeenWebhookEvent(eventId: string): Promise<boolean> {
    const row = await this.prisma.analyticsEvent.findFirst({
      where: {
        source: 'ubereats',
        eventName: 'ubereats_webhook_processed',
        payload: {
          path: ['eventId'],
          equals: eventId,
        },
      },
      select: { id: true },
    });

    return !!row;
  }

  private extractStoreId(payload: unknown): string | null {
    if (!payload || typeof payload !== 'object') return null;

    const root = payload as Record<string, unknown>;
    const dataNode = this.asObject(root.data);

    return this.readString(
      root.store_id,
      dataNode?.store_id,
      this.asObject(dataNode?.store)?.id,
    );
  }

  private readHeader(
    headers: Record<string, unknown>,
    ...keys: string[]
  ): string | null {
    for (const key of keys) {
      const direct = headers[key];
      const lower = headers[key.toLowerCase()];
      const upper = headers[key.toUpperCase()];
      const value = direct ?? lower ?? upper;

      if (typeof value === 'string' && value.trim()) {
        return value.trim();
      }
      if (Array.isArray(value)) {
        const values = value as unknown[];
        const first = values.find(
          (item: unknown) => typeof item === 'string' && item.trim(),
        );
        if (typeof first === 'string') return first.trim();
      }
    }
    return null;
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

  private hashForFallback(rawBody: string): string {
    return createHmac('sha256', 'ubereats-fallback')
      .update(rawBody, 'utf8')
      .digest('hex');
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

    const second = this.toFiniteNumber(fallback);
    if (second !== null) return Math.max(0, Math.round(second));

    return Math.max(0, Math.round(defaultValue));
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
