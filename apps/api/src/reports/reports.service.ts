import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

const DAY_IN_MS = 86_400_000;

const dateTimeFormatterCache = new Map<string, Intl.DateTimeFormat>();
const dateFormatterCache = new Map<string, Intl.DateTimeFormat>();

function getDateTimeFormatter(timeZone: string): Intl.DateTimeFormat {
  let formatter = dateTimeFormatterCache.get(timeZone);
  if (!formatter) {
    formatter = new Intl.DateTimeFormat('en-CA', {
      timeZone,
      hour12: false,
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
    });
    dateTimeFormatterCache.set(timeZone, formatter);
  }
  return formatter;
}

function getDateFormatter(timeZone: string): Intl.DateTimeFormat {
  let formatter = dateFormatterCache.get(timeZone);
  if (!formatter) {
    formatter = new Intl.DateTimeFormat('en-CA', {
      timeZone,
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
    });
    dateFormatterCache.set(timeZone, formatter);
  }
  return formatter;
}

function parseDateISO(dateISO: string): {
  year: number;
  month: number;
  day: number;
} {
  const parts = dateISO.split('-');
  if (parts.length !== 3) {
    throw new RangeError(`Invalid ISO date: ${dateISO}`);
  }
  const [year, month, day] = parts.map((value) => Number.parseInt(value, 10));
  if ([year, month, day].some((value) => Number.isNaN(value))) {
    throw new RangeError(`Invalid ISO date: ${dateISO}`);
  }
  return { year, month, day };
}

function getTimeZoneOffsetMinutes(date: Date, timeZone: string): number {
  const formatter = getDateTimeFormatter(timeZone);
  const formattedParts = formatter.formatToParts(date);
  const values: Partial<Record<string, number>> = {};
  for (const part of formattedParts) {
    if (part.type === 'literal') continue;
    values[part.type] = Number.parseInt(part.value, 10);
  }
  const year = values.year ?? 1970;
  const month = (values.month ?? 1) - 1;
  const day = values.day ?? 1;
  const hour = values.hour ?? 0;
  const minute = values.minute ?? 0;
  const second = values.second ?? 0;
  const asUTC = Date.UTC(year, month, day, hour, minute, second);
  return (asUTC - date.getTime()) / 60_000;
}

function localMidnightToUtc(
  dateISO: string,
  timeZone: string,
): {
  startUtc: Date;
  endUtc: Date;
  canonicalDate: string;
} {
  const { year, month, day } = parseDateISO(dateISO);
  const initialGuess = new Date(Date.UTC(year, month - 1, day, 0, 0, 0));

  let offsetMinutes = getTimeZoneOffsetMinutes(initialGuess, timeZone);
  let utcStart = new Date(initialGuess.getTime() - offsetMinutes * 60_000);

  const adjustedOffset = getTimeZoneOffsetMinutes(utcStart, timeZone);
  if (adjustedOffset !== offsetMinutes) {
    offsetMinutes = adjustedOffset;
    utcStart = new Date(initialGuess.getTime() - offsetMinutes * 60_000);
  }

  const formatter = getDateFormatter(timeZone);
  const canonicalDate = formatter.format(utcStart);

  return {
    startUtc: utcStart,
    endUtc: new Date(utcStart.getTime() + DAY_IN_MS),
    canonicalDate,
  };
}

type ChannelKey = 'web' | 'in_store' | 'ubereats' | (string & {});
type Bucket = {
  subtotalCents: number;
  taxCents: number;
  totalCents: number;
  count: number;
};

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

  async getDailyReport(dateISO: string): Promise<DailyReport> {
    const TZ = 'America/Toronto';
    const { startUtc, endUtc, canonicalDate } = localMidnightToUtc(dateISO, TZ);

    const orders = await this.prisma.order.findMany({
      where: { createdAt: { gte: startUtc, lt: endUtc } },
      select: {
        subtotalCents: true,
        taxCents: true,
        totalCents: true,
        channel: true,
      },
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

    const channelBuckets = orders.reduce<Record<ChannelKey, Bucket>>(
      (acc, o) => {
        const key = o.channel as ChannelKey;
        const b = acc[key] ?? {
          subtotalCents: 0,
          taxCents: 0,
          totalCents: 0,
          count: 0,
        };
        b.subtotalCents += o.subtotalCents;
        b.taxCents += o.taxCents;
        b.totalCents += o.totalCents;
        b.count += 1;
        acc[key] = b;
        return acc;
      },
      {} as Record<ChannelKey, Bucket>,
    );

    return {
      date: canonicalDate,
      subtotalCents: totals.subtotalCents,
      taxCents: totals.taxCents,
      totalCents: totals.totalCents,
      count: totals.count,
      channel: channelBuckets,
    };
  }
}
