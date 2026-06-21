// apps/api/src/reports/reports.service.ts
import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { OrderStatus, Prisma } from '@prisma/client';
import { DateTime } from 'luxon';

interface ReportQueryDto {
  from?: string;
  to?: string;
}

type ReportOrderItem = {
  qty: number;
  productStableId: string;
  displayName: string | null;
  nameEn: string | null;
  nameZh: string | null;
  optionsJson: Prisma.JsonValue | null;
};

type TopItemAggregate = {
  name: string;
  quantity: number;
};

@Injectable()
export class ReportsService {
  constructor(private readonly prisma: PrismaService) {}

  private async buildTopItems(orderItems: ReportOrderItem[]) {
    const selectedChoiceStableIds = Array.from(
      new Set(orderItems.flatMap((item) => this.extractChoiceStableIds(item))),
    );

    const choices = selectedChoiceStableIds.length
      ? await this.prisma.menuOptionTemplateChoice.findMany({
          where: { stableId: { in: selectedChoiceStableIds } },
          select: { stableId: true, targetItemStableId: true },
        })
      : [];

    const choiceTargetByStableId = new Map(
      choices
        .filter((choice) => choice.targetItemStableId)
        .map((choice) => [
          choice.stableId,
          choice.targetItemStableId as string,
        ]),
    );

    const targetItemStableIds = Array.from(
      new Set(choiceTargetByStableId.values()),
    );
    const targetItems = targetItemStableIds.length
      ? await this.prisma.menuItem.findMany({
          where: { stableId: { in: targetItemStableIds }, deletedAt: null },
          select: { stableId: true, nameEn: true, nameZh: true },
        })
      : [];

    const targetNameByStableId = new Map(
      targetItems.map((item) => [
        item.stableId,
        this.resolveItemName({
          productStableId: item.stableId,
          displayName: null,
          nameEn: item.nameEn,
          nameZh: item.nameZh,
        }),
      ]),
    );

    const aggregate = new Map<string, TopItemAggregate>();
    const addItem = (key: string, name: string, quantity: number) => {
      const current = aggregate.get(key);
      aggregate.set(key, {
        name: current?.name ?? name,
        quantity: (current?.quantity ?? 0) + quantity,
      });
    };

    for (const orderItem of orderItems) {
      const targetStableIds = this.extractChoiceStableIds(orderItem)
        .map((choiceStableId) => choiceTargetByStableId.get(choiceStableId))
        .filter((stableId): stableId is string => Boolean(stableId));

      if (targetStableIds.length > 0) {
        for (const targetStableId of targetStableIds) {
          addItem(
            targetStableId,
            targetNameByStableId.get(targetStableId) ?? targetStableId,
            orderItem.qty,
          );
        }
        continue;
      }

      addItem(
        orderItem.productStableId,
        this.resolveItemName(orderItem),
        orderItem.qty,
      );
    }

    return Array.from(aggregate.values())
      .sort((a, b) => b.quantity - a.quantity)
      .slice(0, 10);
  }

  private extractChoiceStableIds(
    orderItem: Pick<ReportOrderItem, 'optionsJson'>,
  ) {
    if (!Array.isArray(orderItem.optionsJson)) {
      return [];
    }

    const stableIds: string[] = [];
    for (const group of orderItem.optionsJson) {
      if (!group || typeof group !== 'object' || !('choices' in group)) {
        continue;
      }
      const choices = (group as { choices?: unknown }).choices;
      if (!Array.isArray(choices)) {
        continue;
      }
      for (const choice of choices) {
        if (!choice || typeof choice !== 'object' || !('stableId' in choice)) {
          continue;
        }
        const stableId = (choice as { stableId?: unknown }).stableId;
        if (typeof stableId === 'string' && stableId.trim().length > 0) {
          stableIds.push(stableId);
        }
      }
    }

    return stableIds;
  }

  private resolveItemName(
    item: Pick<
      ReportOrderItem,
      'productStableId' | 'displayName' | 'nameEn' | 'nameZh'
    >,
  ) {
    return (
      item.displayName ||
      item.nameZh ||
      item.nameEn ||
      item.productStableId ||
      '未知商品'
    );
  }

  async getReport(query: ReportQueryDto) {
    // 1. 确定时间范围 (默认为多伦多时间的一整天)
    // 注意：这里的入参建议是 ISO 格式 (YYYY-MM-DD)
    const zone = process.env.TZ || 'America/Toronto';
    const now = DateTime.now().setZone(zone);

    const startDt = query.from
      ? DateTime.fromISO(query.from, { zone }).startOf('day')
      : now.startOf('day');

    const endDt = query.to
      ? DateTime.fromISO(query.to, { zone }).endOf('day')
      : now.endOf('day');

    const startDate = startDt.toJSDate();
    const endDate = endDt.toJSDate();

    // 2. 定义有效订单的状态
    // 我们只统计已支付、制作中、待取餐、已完成的订单。排除 pending(未支付) 和 refunded(已退款)
    const validStatuses: OrderStatus[] = [
      'paid',
      'making',
      'ready',
      'completed',
    ];

    const whereCondition = {
      createdAt: { gte: startDate, lte: endDate },
      status: { in: validStatuses },
    };

    // 3. 核心指标聚合 (KPI)
    const aggregations = await this.prisma.order.aggregate({
      where: whereCondition,
      _sum: {
        totalCents: true,
        subtotalCents: true,
        taxCents: true,
        deliveryFeeCents: true,
        // 注意：Schema 中没有 tipCents，故不统计小费
      },
      _count: {
        id: true,
      },
    });

    // 4. 按支付方式分组
    const byPaymentMethod = await this.prisma.order.groupBy({
      by: ['paymentMethod'],
      where: whereCondition,
      _sum: { totalCents: true },
      _count: { id: true },
    });

    // 5. 按用餐方式分组 (Fulfillment)
    const byFulfillment = await this.prisma.order.groupBy({
      by: ['fulfillmentType'],
      where: whereCondition,
      _sum: { totalCents: true },
      _count: { id: true },
    });

    // 6. 获取趋势数据 (用于画折线图)
    // 为了性能，只取必要的字段并在内存中处理时间分组
    const rawOrders = await this.prisma.order.findMany({
      where: whereCondition,
      select: {
        createdAt: true,
        totalCents: true,
      },
      orderBy: { createdAt: 'asc' },
    });

    // 7. 处理图表数据
    // 如果是同一天，按小时分组；如果是多天，按天分组
    const diffDays = endDt.diff(startDt, 'days').days;
    const isSingleDay = diffDays <= 1.1; // 稍微放宽一点浮点误差

    const chartDataMap = new Map<string, number>();

    rawOrders.forEach((order) => {
      // 将 UTC 时间转回店铺时区
      const dt = DateTime.fromJSDate(order.createdAt).setZone(zone);
      const key = isSingleDay
        ? dt.toFormat('HH:00')
        : dt.toFormat('yyyy-MM-dd');
      const current = chartDataMap.get(key) || 0;
      chartDataMap.set(key, current + order.totalCents);
    });

    // 补全缺失的时间点 (可选优化，这里先简单返回有的数据)
    const chartData = Array.from(chartDataMap.entries())
      .map(([date, cents]) => ({
        date,
        total: cents / 100, // 转为元
      }))
      // 确保按时间排序
      .sort((a, b) => a.date.localeCompare(b.date));

    // 8. 统计畅销单品 Top 10
    // 套餐会把选中的具体菜品快照写入 optionsJson，这里先取出订单项，
    // 再在内存中按真实菜品 stableId 聚合，避免用 displayName 合并导致重名/语言问题。
    const orderItems = await this.prisma.orderItem.findMany({
      where: {
        order: whereCondition,
      },
      select: {
        qty: true,
        productStableId: true,
        displayName: true,
        nameEn: true,
        nameZh: true,
        optionsJson: true,
      },
    });

    const topItems = await this.buildTopItems(orderItems);

    // 9. 计算最终结果
    const totalCents = aggregations._sum.totalCents ?? 0;
    const count = aggregations._count.id ?? 0;
    const averageOrderValueCents =
      count > 0 ? Math.round(totalCents / count) : 0;

    return {
      summary: {
        totalSales: totalCents / 100,
        subtotal: (aggregations._sum.subtotalCents ?? 0) / 100,
        tax: (aggregations._sum.taxCents ?? 0) / 100,
        deliveryFees: (aggregations._sum.deliveryFeeCents ?? 0) / 100,
        orderCount: count,
        averageOrderValue: averageOrderValueCents / 100,
      },
      chartData,
      breakdown: {
        payment: byPaymentMethod.map((p) => ({
          name: p.paymentMethod,
          value: (p._sum.totalCents ?? 0) / 100,
        })),
        fulfillment: byFulfillment.map((f) => ({
          name: f.fulfillmentType,
          value: (f._sum.totalCents ?? 0) / 100,
        })),
      },
      topItems,
    };
  }
}
