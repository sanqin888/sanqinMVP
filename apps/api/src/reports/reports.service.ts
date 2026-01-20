// apps/api/src/reports/reports.service.ts
import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { OrderStatus } from '@prisma/client';
import { DateTime } from 'luxon';

interface ReportQueryDto {
  from?: string;
  to?: string;
}

@Injectable()
export class ReportsService {
  constructor(private readonly prisma: PrismaService) {}

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
    const topItemsRaw = await this.prisma.orderItem.groupBy({
      by: ['displayName'],
      where: {
        order: whereCondition,
      },
      _sum: {
        qty: true,
      },
      orderBy: {
        _sum: {
          qty: 'desc',
        },
      },
      take: 10,
    });

    const topItems = topItemsRaw.map((item) => ({
      name: item.displayName || '未知商品',
      quantity: item._sum.qty ?? 0,
    }));

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
