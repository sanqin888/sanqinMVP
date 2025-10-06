import { Injectable } from '@nestjs/common';
import { Prisma, OrderStatus } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { DateTime } from 'luxon';

type Channel = 'web' | 'in_store' | 'ubereats';

interface ChannelSummary {
  orders: number;
  subtotalCents: number;
  taxCents: number;
  totalCents: number;
}

export interface DailyReport {
  date: string;
  timezone: string;
  orders: number;
  subtotalCents: number;
  taxCents: number;
  totalCents: number;
  byChannel: Partial<Record<'web' | 'in_store' | 'ubereats', {
    orders: number; subtotalCents: number; taxCents: number; totalCents: number;}>>;
}

@Injectable()
export class ReportsService {
  constructor(private readonly prisma: PrismaService) {}

  async getDailyReport(dateStr: string): Promise<DailyReport> {
    const tz = process.env.TZ || 'America/Toronto';

    // 当地当天的 [start, end) 转成 UTC 的 JS Date
    const base = DateTime.fromISO(dateStr, { zone: tz }).startOf('day');
    const start = base.toUTC().toJSDate();
    const end = base.plus({ days: 1 }).toUTC().toJSDate();

    const included: OrderStatus[] = [
      OrderStatus.paid,
      OrderStatus.making,
      OrderStatus.ready,
      OrderStatus.completed,
    ];

    const where: Prisma.OrderWhereInput = {
      createdAt: { gte: start, lt: end },
      status: { in: included },
    };

    const overall = await this.prisma.order.aggregate({
      where,
      _count: { _all: true },
      _sum: { subtotalCents: true, taxCents: true, totalCents: true },
    });

    const grouped = await this.prisma.order.groupBy({
      by: ['channel'],
      where,
      _count: { _all: true },
      _sum: { subtotalCents: true, taxCents: true, totalCents: true },
    });

    const byChannel: Partial<Record<Channel, ChannelSummary>> = {};
    for (const g of grouped) {
      const ch = g.channel as Channel;
      byChannel[ch] = {
        orders: g._count._all,
        subtotalCents: g._sum.subtotalCents ?? 0,
        taxCents: g._sum.taxCents ?? 0,
        totalCents: g._sum.totalCents ?? 0,
      };
    }

    return {
      date: dateStr,
      timezone: tz,
      orders: overall._count._all ?? 0,
      subtotalCents: overall._sum.subtotalCents ?? 0,
      taxCents: overall._sum.taxCents ?? 0,
      totalCents: overall._sum.totalCents ?? 0,
      byChannel,
    };
  }
}
