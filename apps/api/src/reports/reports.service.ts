import { BadRequestException, Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

export type DailyReport = {
  count: number;
  subtotalCents: number;
  taxCents: number;
  totalCents: number;
};

@Injectable()
export class ReportsService {
  constructor(private readonly prisma: PrismaService) {}

  /** 解析 YYYY-MM-DD */
  private parseISODate(dateISO: string): { y: number; m: number; d: number } {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(dateISO)) {
      throw new BadRequestException('date must be YYYY-MM-DD');
    }
    const [y, m, d] = dateISO.split('-').map((n) => Number(n));
    return { y, m, d };
  }

  /**
   * 计算某个 UTC 时间戳在给定时区下的偏移（毫秒）。
   * 原理：把该 UTC 时间格式化为该时区的“本地时间”，再将其按 UTC 解析回时间戳，二者差值即偏移。
   */
  private offsetMs(zone: string, atUTCms: number): number {
    const dtf = new Intl.DateTimeFormat('en-CA', {
      timeZone: zone,
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
      hour12: false,
    });

    const parts = dtf.formatToParts(new Date(atUTCms));
    let y = 0,
      m = 0,
      d = 0,
      h = 0,
      mi = 0,
      s = 0;

    for (const p of parts) {
      switch (p.type) {
        case 'year':
          y = Number(p.value);
          break;
        case 'month':
          m = Number(p.value);
          break;
        case 'day':
          d = Number(p.value);
          break;
        case 'hour':
          h = Number(p.value);
          break;
        case 'minute':
          mi = Number(p.value);
          break;
        case 'second':
          s = Number(p.value);
          break;
        default:
          break;
      }
    }
    // 以 UTC 方式解析刚才的“本地时间”
    const asUTC = Date.UTC(y, m - 1, d, h, mi, s, 0);
    return asUTC - atUTCms;
  }

  /** 计算“某时区下某天的起止时间”对应的 UTC Date */
  private dayRangeInUTC(
    dateISO: string,
    zone = process.env.TZ ?? 'America/Toronto',
  ): { start: Date; end: Date } {
    const { y, m, d } = this.parseISODate(dateISO);

    const approxStartUTC = Date.UTC(y, m - 1, d, 0, 0, 0, 0);
    const startUTC = approxStartUTC - this.offsetMs(zone, approxStartUTC);

    const approxEndUTC = Date.UTC(y, m - 1, d, 23, 59, 59, 999);
    const endUTC = approxEndUTC - this.offsetMs(zone, approxEndUTC);

    return { start: new Date(startUTC), end: new Date(endUTC) };
  }

  async daily(dateISO: string): Promise<DailyReport> {
    const { start, end } = this.dayRangeInUTC(dateISO);

    const agg = await this.prisma.order.aggregate({
      where: { createdAt: { gte: start, lte: end } },
      _sum: { subtotalCents: true, taxCents: true, totalCents: true },
      _count: { _all: true },
    });

    return {
      count: agg._count?._all ?? 0,
      subtotalCents: agg._sum.subtotalCents ?? 0,
      taxCents: agg._sum.taxCents ?? 0,
      totalCents: agg._sum.totalCents ?? 0,
    };
  }
}
