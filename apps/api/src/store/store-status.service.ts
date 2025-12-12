// apps/api/src/store/store-status.service.ts

import { Injectable } from '@nestjs/common';
import type { BusinessConfig } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { AppLogger } from '../common/app-logger';

export type StoreStatus = {
  // 是否按“营业时间/节假日”判断为营业（不考虑临时暂停）
  isOpenBySchedule: boolean;

  // 是否被“临时暂停接单”关闭
  isTemporarilyClosed: boolean;
  temporaryCloseReason: string | null;

  // 真实对外状态：只要临时暂停 = true，就算关
  isOpen: boolean;

  // 用于前端文案显示状态来源
  ruleSource:
    | 'REGULAR_HOURS'
    | 'HOLIDAY'
    | 'CLOSED_ALL_DAY'
    | 'TEMPORARY_CLOSE';

  // 方便前端展示当前时间/日期
  now: string; // ISO 字符串（按门店时区计算）
  timezone: string; // 来自 BusinessConfig.timezone

  today: {
    date: string; // YYYY-MM-DD
    weekday: number; // 0=Sunday ... 6=Saturday
    isHoliday: boolean;
    holidayName: string | null;
    isClosed: boolean;
    openMinutes: number | null;
    closeMinutes: number | null;
  };

  // （简单版）如果今天还没到营业时间，给出今天的开门时间；否则 undefined
  nextOpenAt?: string;
};

type StoreClock = {
  now: Date;
  nowIso: string;
  todayStr: string; // YYYY-MM-DD
  weekday: number; // 0=Sunday ... 6=Saturday
  minutesSinceMidnight: number; // 0-1439
};

@Injectable()
export class StoreStatusService {
  private readonly logger = new AppLogger(StoreStatusService.name);

  constructor(private readonly prisma: PrismaService) {}

  async getCurrentStatus(): Promise<StoreStatus> {
    const config = await this.ensureConfig();

    // ⭐ 使用 BusinessConfig.timezone 计算门店当前时间（24 小时制）
    const { now, nowIso, todayStr, weekday, minutesSinceMidnight } =
      this.getStoreClock(config.timezone || 'America/Toronto');

    // 找今天的 Holiday（按日期字符串匹配）
    const holidays = await this.prisma.holiday.findMany();
    const todayHoliday = holidays.find(
      (h) => this.dateToIsoDate(h.date) === todayStr,
    );
    const todayHolidayName = todayHoliday?.name ?? null;

    // 找对应 weekday 的营业时间（我们约定每周只配一段）
    const todayHours = await this.prisma.businessHour.findFirst({
      where: { weekday },
      orderBy: { openMinutes: 'asc' },
    });

    let ruleSource: StoreStatus['ruleSource'] = 'REGULAR_HOURS';
    let isClosed = true;
    let openMinutes: number | null = null;
    let closeMinutes: number | null = null;

    if (todayHoliday) {
      // 节假日优先
      ruleSource = 'HOLIDAY';
      isClosed = todayHoliday.isClosed;
      openMinutes = todayHoliday.openMinutes ?? null;
      closeMinutes = todayHoliday.closeMinutes ?? null;
    } else if (!todayHours) {
      // 没配今天的营业时间 → 视为休息
      ruleSource = 'CLOSED_ALL_DAY';
      isClosed = true;
    } else {
      ruleSource = todayHours.isClosed ? 'CLOSED_ALL_DAY' : 'REGULAR_HOURS';
      isClosed = todayHours.isClosed;
      openMinutes = todayHours.openMinutes;
      closeMinutes = todayHours.closeMinutes;
    }

    // ===== 按排班判断“是否在营业时间内” =====
    let isOpenBySchedule = false;

    if (
      !isClosed &&
      openMinutes != null &&
      closeMinutes != null &&
      closeMinutes > openMinutes
    ) {
      // 这里全部按 24 小时制的“从凌晨开始的分钟数”
      isOpenBySchedule =
        minutesSinceMidnight >= openMinutes &&
        minutesSinceMidnight < closeMinutes;
    }

    // 临时暂停接单覆盖一切渠道（web + POS）
    const isTemporarilyClosed = config.isTemporarilyClosed;
    const isOpen = isOpenBySchedule && !isTemporarilyClosed;

    // 一旦临时暂停 → ruleSource 直接标记为 TEMPORARY_CLOSE，方便前端区分文案
    if (isTemporarilyClosed) {
      ruleSource = 'TEMPORARY_CLOSE';
    }

    let nextOpenAt: string | undefined;

    // （简单版）如果今天是营业日 & 现在还没到开门时间 → 给出今天的开门时间
    if (!isOpen && !isClosed && openMinutes != null) {
      if (minutesSinceMidnight < openMinutes) {
        const openDateTime = new Date(now);
        const hours = Math.floor(openMinutes / 60);
        const minutes = openMinutes % 60;
        openDateTime.setHours(hours, minutes, 0, 0);
        nextOpenAt = openDateTime.toISOString();
      }
    }

    return {
      isOpenBySchedule,
      isTemporarilyClosed,
      temporaryCloseReason: config.temporaryCloseReason ?? null,
      isOpen,
      ruleSource,
      now: nowIso,
      timezone: config.timezone,
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

  // ====== 内部小工具 ======

  /** 根据门店时区算“现在几点 / 今天星期几 / 今天是几号 / 已经过了多少分钟” */
  private getStoreClock(timezone: string): StoreClock {
    const tz = timezone || 'America/Toronto';
    const now = new Date();

    try {
      const formatter = new Intl.DateTimeFormat('en-CA', {
        timeZone: tz,
        year: 'numeric',
        month: '2-digit',
        day: '2-digit',
        hour: '2-digit',
        minute: '2-digit',
        hour12: false,
        weekday: 'long',
      });

      const parts = formatter.formatToParts(now);
      const get = (type: string) =>
        parts.find((p) => p.type === type)?.value ?? '0';

      const year = Number(get('year'));
      const month = Number(get('month'));
      const day = Number(get('day'));
      const hour = Number(get('hour'));
      const minute = Number(get('minute'));
      const weekdayLabel = get('weekday');

      const todayStr = [
        year.toString().padStart(4, '0'),
        month.toString().padStart(2, '0'),
        day.toString().padStart(2, '0'),
      ].join('-');

      const minutesSinceMidnight = hour * 60 + minute;

      // 把英文 weekday 映射成 0-6
      const weekdayMap: Record<string, number> = {
        Sunday: 0,
        Monday: 1,
        Tuesday: 2,
        Wednesday: 3,
        Thursday: 4,
        Friday: 5,
        Saturday: 6,
      };
      const weekday =
        weekdayMap[weekdayLabel] ?? new Date(`${todayStr}T00:00:00`).getDay();

      // 构造一个“门店本地时间”的 Date 对象（秒/毫秒用服务器当前，影响不大）
      const storeNow = new Date(
        year,
        month - 1,
        day,
        hour,
        minute,
        now.getSeconds(),
        now.getMilliseconds(),
      );
      const nowIso = storeNow.toISOString();

      return { now: storeNow, nowIso, todayStr, weekday, minutesSinceMidnight };
    } catch (err) {
      this.logger.warn(
        `Failed to compute store clock with timezone=${tz}, fallback to server local time. Error: ${String(
          err,
        )}`,
      );

      // 回退方案：直接用服务器本地时间
      const fallbackNow = new Date();
      const fallbackIso = fallbackNow.toISOString();
      const fallbackTodayStr = fallbackIso.slice(0, 10); // YYYY-MM-DD
      const fallbackWeekday = fallbackNow.getDay();
      const fallbackMinutes =
        fallbackNow.getHours() * 60 + fallbackNow.getMinutes();

      return {
        now: fallbackNow,
        nowIso: fallbackIso,
        todayStr: fallbackTodayStr,
        weekday: fallbackWeekday,
        minutesSinceMidnight: fallbackMinutes,
      };
    }
  }

  /** 确保 BusinessConfig 至少有一条记录（id=1） */
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
        storeName: null,
        timezone: 'America/Toronto',
        isTemporarilyClosed: false,
        temporaryCloseReason: null,
      },
    });
  }

  /** 把 Date 存的节假日统一转成 YYYY-MM-DD 字符串 */
  private dateToIsoDate(date: Date): string {
    return date.toISOString().slice(0, 10);
  }
}
