// apps/api/src/business-hours/business-hours.service.ts
import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import {
  type BusinessHourDto,
  type WeekdayNumber,
} from './dto/business-hours.dto';

const ALL_WEEKDAYS: WeekdayNumber[] = [0, 1, 2, 3, 4, 5, 6];

// 默认营业时间（你可以按自己店的实际情况改）
const DEFAULT_HOURS: BusinessHourDto[] = [
  // Sunday
  { weekday: 0, openMinutes: null, closeMinutes: null, isClosed: true },
  // Monday
  { weekday: 1, openMinutes: 11 * 60, closeMinutes: 21 * 60, isClosed: false },
  // Tuesday
  { weekday: 2, openMinutes: 11 * 60, closeMinutes: 21 * 60, isClosed: false },
  // Wednesday
  { weekday: 3, openMinutes: 11 * 60, closeMinutes: 21 * 60, isClosed: false },
  // Thursday
  { weekday: 4, openMinutes: 11 * 60, closeMinutes: 21 * 60, isClosed: false },
  // Friday
  { weekday: 5, openMinutes: 11 * 60, closeMinutes: 21 * 60, isClosed: false },
  // Saturday
  { weekday: 6, openMinutes: 11 * 60, closeMinutes: 21 * 60, isClosed: false },
];

@Injectable()
export class BusinessHoursService {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * 如果表是空的，用 DEFAULT_HOURS 初始化一遍
   */
  private async ensureSeeded(): Promise<void> {
    const count = await this.prisma.businessHour.count();
    if (count > 0) return;

    await this.prisma.$transaction(
      DEFAULT_HOURS.map((h) =>
        this.prisma.businessHour.create({
          data: {
            weekday: h.weekday,
            openMinutes: h.openMinutes,
            closeMinutes: h.closeMinutes,
            isClosed: h.isClosed,
          },
        }),
      ),
    );
  }

  async getAll(): Promise<BusinessHourDto[]> {
    await this.ensureSeeded();

    const rows = await this.prisma.businessHour.findMany({
      orderBy: { weekday: 'asc' },
    });

    return rows.map<BusinessHourDto>((row) => ({
      weekday: row.weekday as WeekdayNumber,
      openMinutes: row.openMinutes,
      closeMinutes: row.closeMinutes,
      isClosed: row.isClosed,
    }));
  }

  async updateAll(hours: BusinessHourDto[]): Promise<BusinessHourDto[]> {
    // 校验 weekday 合法且不重复
    const seen = new Set<WeekdayNumber>();

    for (const h of hours) {
      if (!ALL_WEEKDAYS.includes(h.weekday)) {
        throw new Error(`Invalid weekday value: ${h.weekday}`);
      }
      if (seen.has(h.weekday)) {
        throw new Error(`Duplicate weekday in payload: ${h.weekday}`);
      }
      seen.add(h.weekday);

      if (!h.isClosed) {
        const o = normalizeMinutes(h.openMinutes);
        const c = normalizeMinutes(h.closeMinutes);
        if (o === null || c === null) {
          throw new Error(
            `openMinutes/closeMinutes required when isClosed = false (weekday=${h.weekday})`,
          );
        }
        if (o >= c) {
          throw new Error(
            `openMinutes must be < closeMinutes when isClosed = false (weekday=${h.weekday})`,
          );
        }
      }
    }

    // 用 weekday 做 upsert（因为 schema 里 weekday 已经加了 @unique）
    await this.prisma.$transaction(
      hours.map((h) =>
        this.prisma.businessHour.upsert({
          where: { weekday: h.weekday },
          create: {
            weekday: h.weekday,
            openMinutes: h.isClosed ? null : normalizeMinutes(h.openMinutes),
            closeMinutes: h.isClosed ? null : normalizeMinutes(h.closeMinutes),
            isClosed: h.isClosed,
          },
          update: {
            openMinutes: h.isClosed ? null : normalizeMinutes(h.openMinutes),
            closeMinutes: h.isClosed ? null : normalizeMinutes(h.closeMinutes),
            isClosed: h.isClosed,
          },
        }),
      ),
    );

    return this.getAll();
  }
}

/**
 * 把传进来的分钟数归一化到 0–1439；允许 null，非法值抛错
 */
function normalizeMinutes(value: number | null | undefined): number | null {
  if (value == null) return null;
  if (!Number.isFinite(value)) {
    throw new Error(`Invalid minutes value: ${value}`);
  }
  const v = Math.round(value);
  if (v < 0 || v >= 24 * 60) {
    throw new Error(`Minutes must be between 0 and 1439, got ${v}`);
  }
  return v;
}
