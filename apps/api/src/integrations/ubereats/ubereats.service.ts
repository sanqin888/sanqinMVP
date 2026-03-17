import { BadRequestException, Injectable } from '@nestjs/common';
import {
  Channel,
  OrderStatus,
  PaymentMethod,
  UberMenuPublishStatus,
  type Prisma,
} from '@prisma/client';
import { AppLogger } from '../../common/app-logger';
import { PrismaService } from '../../prisma/prisma.service';

type UberWebhookInput = {
  headers: Record<string, unknown>;
  body: unknown;
  rawBody: string;
};

type ParsedUberOrder = {
  externalOrderId: string;
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

@Injectable()
export class UberEatsService {
  private readonly logger = new AppLogger(UberEatsService.name);

  constructor(private readonly prisma: PrismaService) {}

  async handleWebhook(input: UberWebhookInput): Promise<{
    eventType: string;
    processed: boolean;
    orderStableId: string | null;
  }> {
    const eventType = this.readEventType(input.body);
    const parsedOrder = this.parseOrderPayload(input.body);

    this.logger.log(
      `[ubereats webhook] eventType=${eventType} body=${input.rawBody}`,
    );

    if (!parsedOrder) {
      await this.captureEvent('ubereats_webhook_ignored', {
        eventType,
      });
      return { eventType, processed: false, orderStableId: null };
    }

    const order = await this.upsertUberOrder(parsedOrder, eventType);
    return {
      eventType,
      processed: true,
      orderStableId: order.orderStableId,
    };
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

    await this.captureEvent('ubereats_store_status_synced', payload);

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

    const createdOrUpdated = await this.prisma.order.upsert({
      where: { clientRequestId },
      create: {
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
      update: {
        status: mappedStatus,
        subtotalCents: order.subtotalCents,
        taxCents: order.taxCents,
        totalCents: order.totalCents,
        paymentTotalCents: order.totalCents,
        contactName: order.contactName,
        contactPhone: order.contactPhone,
      },
      select: {
        orderStableId: true,
      },
    });

    await this.captureEvent('ubereats_order_upserted', {
      eventType,
      externalOrderId: order.externalOrderId,
      orderStableId: createdOrUpdated.orderStableId,
      mappedStatus,
    });

    return createdOrUpdated;
  }

  private parseOrderPayload(payload: unknown): ParsedUberOrder | null {
    if (!payload || typeof payload !== 'object') return null;

    const root = payload as Record<string, unknown>;
    const orderNode =
      this.asObject(root.order) ??
      this.asObject(root.data) ??
      this.asObject(this.asObject(root.data)?.order ?? null);

    if (!orderNode) return null;

    const externalOrderId = this.readString(
      orderNode.order_id,
      orderNode.id,
      orderNode.external_order_id,
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

    const contact = this.asObject(orderNode.customer) ?? orderNode;

    return {
      externalOrderId,
      subtotalCents,
      taxCents,
      totalCents,
      contactName: this.readString(contact.name, contact.full_name),
      contactPhone: this.readString(contact.phone, contact.phone_number),
      paidAt: new Date(),
    };
  }

  private readEventType(payload: unknown): string {
    if (!payload || typeof payload !== 'object') return 'unknown';
    const root = payload as Record<string, unknown>;
    return (
      this.readString(root.event_type, root.type, root.action) ?? 'unknown'
    );
  }

  private mapEventTypeToOrderStatus(eventType: string): OrderStatus {
    if (eventType.includes('accept')) return OrderStatus.paid;
    if (eventType.includes('progress') || eventType.includes('making')) {
      return OrderStatus.making;
    }
    if (eventType.includes('ready')) return OrderStatus.ready;
    if (eventType.includes('complete')) return OrderStatus.completed;
    if (eventType.includes('cancel') || eventType.includes('reject')) {
      return OrderStatus.refunded;
    }
    return OrderStatus.paid;
  }

  private toClientRequestId(externalOrderId: string): string {
    return `ubereats:${externalOrderId}`;
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
