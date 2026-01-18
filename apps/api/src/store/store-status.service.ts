// apps/api/src/store/store-status.service.ts

import { Injectable } from '@nestjs/common';
import type { BusinessConfig } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { AppLogger } from '../common/app-logger';
import { DateTime } from 'luxon';

export type StoreStatus = {
  isOpenBySchedule: boolean;

  isTemporarilyClosed: boolean;
  temporaryCloseReason: string | null;
  publicNotice: string | null;

  isOpen: boolean;

  ruleSource:
    | 'REGULAR_HOURS'
    | 'HOLIDAY'
    | 'CLOSED_ALL_DAY'
    | 'TEMPORARY_CLOSE';

  now: string; // ISO（带 offset，按门店时区）
  timezone: string;

  today: {
    date: string; // YYYY-MM-DD（按门店时区）
    weekday: number; // 0=Sunday ... 6=Saturday（按门店时区）
    isHoliday: boolean;
    holidayName: string | null;
    isClosed: boolean;
    openMinutes: number | null;
    closeMinutes: number | null;
  };

  nextOpenAt?: string; // ISO（带 offset，按门店时区）
};

type StoreClock = {
  nowIso: string; // 带 offset
  todayStr: string; // YYYY-MM-DD（按门店时区）
  weekday: number; // 0-6（按门店时区）
  minutesSinceMidnight: number; // 0-1439（按门店时区）
  nowZ: DateTime; // 门店时区 DateTime
};

@Injectable()
export class StoreStatusService {
  private readonly logger = new AppLogger(StoreStatusService.name);

  constructor(private readonly prisma: PrismaService) {}

  async getCurrentStatus(): Promise<StoreStatus> {
    const config = await this.ensureConfig();
    const tz = config.timezone || 'America/Toronto';

    const { nowIso, todayStr, weekday, minutesSinceMidnight, nowZ } =
      this.getStoreClock(tz);

    // Holiday：按“门店时区的 YYYY-MM-DD”来匹配
    const holidays = await this.prisma.holiday.findMany();
    const todayHoliday = holidays.find((h) => {
      const hDateStr = DateTime.fromJSDate(h.date, { zone: 'utc' })
        .setZone(tz)
        .toFormat('yyyy-LL-dd');
      return hDateStr === todayStr;
    });
    const todayHolidayName = todayHoliday?.name ?? null;

    // BusinessHour：weekday 是 unique，直接 findUnique
    const todayHours = await this.prisma.businessHour.findUnique({
      where: { weekday },
    });

    let ruleSource: StoreStatus['ruleSource'] = 'REGULAR_HOURS';
    let isClosed = true;
    let openMinutes: number | null = null;
    let closeMinutes: number | null = null;

    if (todayHoliday) {
      ruleSource = 'HOLIDAY';
      isClosed = todayHoliday.isClosed;
      openMinutes = todayHoliday.openMinutes ?? null;
      closeMinutes = todayHoliday.closeMinutes ?? null;
    } else if (!todayHours) {
      ruleSource = 'CLOSED_ALL_DAY';
      isClosed = true;
    } else {
      ruleSource = todayHours.isClosed ? 'CLOSED_ALL_DAY' : 'REGULAR_HOURS';
      isClosed = todayHours.isClosed;
      openMinutes = todayHours.openMinutes ?? null;
      closeMinutes = todayHours.closeMinutes ?? null;
    }

    // ===== 按排班判断是否营业 =====
    let isOpenBySchedule = false;

    if (
      !isClosed &&
      openMinutes != null &&
      closeMinutes != null &&
      closeMinutes > openMinutes
    ) {
      isOpenBySchedule =
        minutesSinceMidnight >= openMinutes &&
        minutesSinceMidnight < closeMinutes;
    }

    const isTemporarilyClosed = !!config.isTemporarilyClosed;
    const isOpen = isOpenBySchedule && !isTemporarilyClosed;

    if (isTemporarilyClosed) {
      ruleSource = 'TEMPORARY_CLOSE';
    }

    let nextOpenAt: string | undefined;

    // 简单版：仅处理“今天未到开门时间”的 nextOpenAt（仍按门店时区输出带 offset）
    if (!isOpen && !isClosed && openMinutes != null) {
      if (minutesSinceMidnight < openMinutes) {
        const openZ = nowZ.startOf('day').plus({ minutes: openMinutes });
        nextOpenAt = this.toIsoWithOffset(openZ);
      }
    }

    return {
      isOpenBySchedule,
      isTemporarilyClosed,
      temporaryCloseReason: config.temporaryCloseReason ?? null,
      publicNotice: config.publicNotice ?? null,
      isOpen,
      ruleSource,
      now: nowIso,
      timezone: tz,
      today: {
        date: todayStr,
        weekday,
        isHoliday: !!todayHoliday,
        holidayName: todayHolidayName,
        isClosed,
        openMinutes,
        closeMinutes,
      },
      nextOpenAt,
    };
  }

  // ====== 内部工具 ======

  private getStoreClock(timezone: string): StoreClock {
    const tz = timezone || 'America/Toronto';

    const nowZ = DateTime.now().setZone(tz);
    if (!nowZ.isValid) {
      this.logger.warn(
        `Invalid timezone=${tz} for Luxon. Fallback to UTC. reason=${String(
          nowZ.invalidReason,
        )}`,
      );
      const fallback = DateTime.now().toUTC();
      return {
        nowIso: this.toIsoWithOffset(fallback),
        todayStr: fallback.toFormat('yyyy-LL-dd'),
        weekday: fallback.weekday % 7, // Sunday(7)->0
        minutesSinceMidnight: fallback.hour * 60 + fallback.minute,
        nowZ: fallback,
      };
    }

    const todayStr = nowZ.toFormat('yyyy-LL-dd');

    // Luxon weekday: Monday=1 ... Sunday=7  -> 0=Sunday ... 6=Saturday
    const weekday = nowZ.weekday % 7;

    const minutesSinceMidnight = nowZ.hour * 60 + nowZ.minute;

    return {
      nowIso: this.toIsoWithOffset(nowZ),
      todayStr,
      weekday,
      minutesSinceMidnight,
      nowZ,
    };
  }

  private toIsoWithOffset(dt: DateTime): string {
    // includeOffset: true 确保带 -05:00 / -04:00
    // Luxon 默认会带 offset，但这里显式写清楚，避免未来改动踩坑
    const iso = dt.toISO({ includeOffset: true, suppressMilliseconds: false });
    // toISO 可能返回 null（极端 invalid），兜底：
    return (
      iso ??
      dt.toUTC().toISO({ includeOffset: true }) ??
      new Date().toISOString()
    );
  }

  private async ensureConfig(): Promise<BusinessConfig> {
    const existing = await this.prisma.businessConfig.findUnique({
      where: { id: 1 },
    });

    if (existing) return existing;

    this.logger.log(
      'BusinessConfig not found when querying store status, creating default row (id=1)',
    );

    return this.prisma.businessConfig.create({
      data: {
        id: 1,
        storeName: '',
        timezone: 'America/Toronto',
        isTemporarilyClosed: false,
        temporaryCloseReason: null,
        publicNotice: null,
      },
    });
  }
}
