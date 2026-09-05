import { Injectable } from '@nestjs/common';
import { PrismaService } from './orders-prisma';
import type {
  AdminMemberOrdersReadResult,
  AdminMemberTopPurchasedItemDto,
  AdminMemberTopPurchasedItemsResult,
} from './admin-member-orders-read.contract';

@Injectable()
export class AdminMemberOrdersReadService {
  constructor(private readonly prisma: PrismaService) {}

  async listOrders(
    userStableId: string,
    limitRaw?: string,
  ): Promise<AdminMemberOrdersReadResult> {
    const limit = limitRaw ? Number.parseInt(limitRaw, 10) || 50 : 50;
    const orders = await this.prisma.order.findMany({
      where: { userStableId },
      orderBy: { createdAt: 'desc' },
      take: limit,
      select: {
        orderStableId: true,
        clientRequestId: true,
        createdAt: true,
        status: true,
        totalCents: true,
        fulfillmentType: true,
        deliveryType: true,
      },
    });

    return {
      orders: orders.map((order) => ({
        orderStableId: order.orderStableId,
        clientRequestId: order.clientRequestId ?? null,
        createdAt: order.createdAt.toISOString(),
        status: order.status,
        totalCents: order.totalCents,
        fulfillmentType: order.fulfillmentType,
        deliveryType: order.deliveryType,
      })),
    };
  }

  async listTopPurchasedItems(
    userStableId: string,
    limitRaw?: string,
  ): Promise<AdminMemberTopPurchasedItemsResult> {
    const parsedLimit = limitRaw ? Number.parseInt(limitRaw, 10) : 10;
    const limit = Number.isFinite(parsedLimit)
      ? Math.max(1, Math.min(parsedLimit, 50))
      : 10;

    const items = await this.prisma.orderItem.findMany({
      where: {
        order: {
          userStableId,
          status: { in: ['paid', 'making', 'ready', 'completed'] },
        },
      },
      select: {
        productStableId: true,
        qty: true,
        displayName: true,
        nameZh: true,
        nameEn: true,
      },
    });

    const byProduct = new Map<string, AdminMemberTopPurchasedItemDto>();
    for (const item of items) {
      const fallbackName =
        item.displayName?.trim() ||
        item.nameZh?.trim() ||
        item.nameEn?.trim() ||
        item.productStableId;
      const existing = byProduct.get(item.productStableId);
      if (existing) {
        existing.purchaseCount += item.qty;
        if (existing.displayName === existing.productStableId) {
          existing.displayName = fallbackName;
        }
      } else {
        byProduct.set(item.productStableId, {
          productStableId: item.productStableId,
          displayName: fallbackName,
          purchaseCount: item.qty,
        });
      }
    }

    return {
      items: Array.from(byProduct.values())
        .sort((a, b) => b.purchaseCount - a.purchaseCount)
        .slice(0, limit),
    };
  }
}
