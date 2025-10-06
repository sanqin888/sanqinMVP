import { BadRequestException, Injectable } from '@nestjs/common';
import { DateTime } from 'luxon';
import { PrismaService } from '../prisma/prisma.service';

export type DailyReport = {
  orderCount: number;
  subtotalCents: number;
  taxCents: number;
  totalCents: number;
};

@Injectable()
export class ReportsService {
  constructor(private readonly prisma: PrismaService) {}

  async daily(dateISO: string): Promise<DailyReport> {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(dateISO)) {
      throw new BadRequestException('date must be YYYY-MM-DD');
    }

    const tz = process.env.TZ ?? 'America/Toronto';
    const start = DateTime.fromISO(dateISO, { zone: tz }).startOf('day').toUTC().toJSDate();
    const end = DateTime.fromISO(dateISO, { zone: tz }).endOf('day').toUTC().toJSDate();

    const where = { createdAt: { gte: start, lte: end } };

    // 订单数与金额聚合
    const [orderCount, agg] = await Promise.all([
      this.prisma.order.count({ where }),
      this.prisma.order.aggregate({
        where,
        _sum: { subtotalCents: true, taxCents: true, totalCents: true },
      }),
    ]);

    return {
      orderCount,
      subtotalCents: agg._sum.subtotalCents ?? 0,
      taxCents: agg._sum.taxCents ?? 0,
      totalCents: agg._sum.totalCents ?? 0,
    };
  }
}
