import { Injectable, NotFoundException } from '@nestjs/common';
import type { OrderJsonValue } from '@shared/order';
import { PrismaService } from '../prisma/prisma.service';
import type {
  PosOrderAmendmentReadRecord,
  PosOrderFinancialSummaryQuery,
  PosOrderFinancialSummaryRecord,
  PosOrderReadPort,
} from './pos-order-read.contract';
import { OrdersService } from './orders.service';

@Injectable()
export class PosOrderReadService implements PosOrderReadPort {
  constructor(
    private readonly prisma: PrismaService,
    private readonly orders: OrdersService,
  ) {}

  async listFinancialSummaryOrders(
    query: PosOrderFinancialSummaryQuery,
  ): Promise<PosOrderFinancialSummaryRecord[]> {
    const orders = await this.prisma.order.findMany({
      where: {
        storeId: query.storeStableId,
        paidAt: { gte: query.paidFrom, lt: query.paidToExclusive },
        ...(query.fulfillmentType
          ? { fulfillmentType: query.fulfillmentType }
          : {}),
      },
      orderBy: { paidAt: 'desc' },
      select: {
        id: true,
        orderStableId: true,
        clientRequestId: true,
        paidAt: true,
        channel: true,
        fulfillmentType: true,
        status: true,
        subtotalCents: true,
        subtotalAfterDiscountCents: true,
        totalCents: true,
        taxCents: true,
        deliveryFeeCents: true,
        deliveryCostCents: true,
        paymentMethod: true,
      },
    });

    if (orders.length === 0) return [];

    const amendmentTotals = await this.prisma.orderAmendment.groupBy({
      by: ['orderId'],
      where: { orderId: { in: orders.map((order) => order.id) } },
      _sum: { refundCents: true, additionalChargeCents: true },
    });
    const totalsByOrderId = new Map(
      amendmentTotals.map((row) => [
        row.orderId,
        {
          refundCents: row._sum.refundCents ?? 0,
          additionalChargeCents: row._sum.additionalChargeCents ?? 0,
        },
      ]),
    );

    return orders.map((order) => {
      const totals = totalsByOrderId.get(order.id) ?? {
        refundCents: 0,
        additionalChargeCents: 0,
      };
      return {
        orderStableId: order.orderStableId,
        clientRequestId: order.clientRequestId,
        paidAt: order.paidAt,
        channel: order.channel,
        fulfillmentType: order.fulfillmentType,
        status: order.status,
        subtotalCents: order.subtotalCents,
        subtotalAfterDiscountCents: order.subtotalAfterDiscountCents,
        totalCents: order.totalCents,
        taxCents: order.taxCents,
        deliveryFeeCents: order.deliveryFeeCents,
        deliveryCostCents: order.deliveryCostCents,
        paymentMethod: order.paymentMethod,
        refundCents: totals.refundCents,
        additionalChargeCents: totals.additionalChargeCents,
      };
    });
  }

  async listAmendmentsForStore(
    orderStableId: string,
    storeStableId: string,
  ): Promise<PosOrderAmendmentReadRecord[]> {
    await this.orders.getByStableIdForStore(orderStableId, storeStableId);

    const order = await this.prisma.order.findUnique({
      where: { orderStableId },
      select: { id: true },
    });
    if (!order) throw new NotFoundException('order not found');

    const amendments = await this.prisma.orderAmendment.findMany({
      where: { orderId: order.id },
      include: { items: true },
    });

    return amendments.map((amendment) => ({
      amendmentStableId: amendment.amendmentStableId,
      type: amendment.type,
      paymentMethod: amendment.paymentMethod,
      reason: amendment.reason,
      deltaCents: amendment.deltaCents,
      refundCents: amendment.refundCents,
      additionalChargeCents: amendment.additionalChargeCents,
      summaryJson: amendment.summaryJson as OrderJsonValue | null,
      items: amendment.items.map((item) => ({
        action: item.action,
        productStableId: item.productStableId,
        displayName: item.displayName,
        nameEn: item.nameEn,
        nameZh: item.nameZh,
        qty: item.qty,
        unitPriceCents: item.unitPriceCents,
        optionsJson: item.optionsJson as OrderJsonValue | null,
      })),
    }));
  }
}
