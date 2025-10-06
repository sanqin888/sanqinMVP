import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { DateTime } from 'luxon';

type ChannelKey = 'web' | 'in_store' | 'ubereats' | (string & {});
type Bucket = { subtotalCents: number; taxCents: number; totalCents: number; count: number };

export interface DailyReport {
  date: string; // ISO date
  subtotalCents: number;
  taxCents: number;
  totalCents: number;
  count: number;
  channel: Record<ChannelKey, Bucket>;
}

@Injectable()
export class ReportsService {
  constructor(private readonly prisma: PrismaService) {}

  async daily(dateISO: string): Promise<DailyReport> {
    const TZ = 'America/Toronto';

    const localStart: DateTime = DateTime.fromISO(dateISO, { zone: TZ }).startOf('day');
    const localEnd: DateTime = localStart.plus({ days: 1 });
    const startUtc: Date = localStart.toUTC().toJSDate();
    const endUtc: Date = localEnd.toUTC().toJSDate();

    const orders = await this.prisma.order.findMany({
      where: { createdAt: { gte: startUtc, lt: endUtc } },
      select: { subtotalCents: true, taxCents: true, totalCents: true, channel: true },
    });

    const totals = orders.reduce<Bucket>(
      (agg, o) => {
        agg.subtotalCents += o.subtotalCents;
        agg.taxCents += o.taxCents;
        agg.totalCents += o.totalCents;
        agg.count += 1;
        return agg;
      },
      { subtotalCents: 0, taxCents: 0, totalCents: 0, count: 0 },
    );

    const channelBuckets = orders.reduce<Record<ChannelKey, Bucket>>((acc, o) => {
      const key = o.channel as ChannelKey;
      const b = acc[key] ?? { subtotalCents: 0, taxCents: 0, totalCents: 0, count: 0 };
      b.subtotalCents += o.subtotalCents;
      b.taxCents += o.taxCents;
      b.totalCents += o.totalCents;
      b.count += 1;
      acc[key] = b;
      return acc;
    }, {} as Record<ChannelKey, Bucket>);

    return {
      date: localStart.toISODate() ?? dateISO,
      subtotalCents: totals.subtotalCents,
      taxCents: totals.taxCents,
      totalCents: totals.totalCents,
      count: totals.count,
      channel: channelBuckets,
    };
  }
}
