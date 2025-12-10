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
  now: string; // ISO 字符串
  timezone: string; // 目前从 BusinessConfig.timezone 取

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

@Injectable()
export class StoreStatusService {
  private readonly logger = new AppLogger(StoreStatusService.name);

  constructor(private readonly prisma: PrismaService) {}

  async getCurrentStatus(): Promise<StoreStatus> {
    const config = await this.ensureConfig();

    // 现在先用服务器本地时间作为门店时间（你部署在多伦多的话就是 Toronto）
    const now = new Date();
    const nowIso = now.toISOString();
    const todayStr = nowIso.slice(0, 10); // YYYY-MM-DD
    const weekday = now.getDay(); // 0-6
    const minutesSinceMidnight = now.getHours() * 60 + now.getMinutes();

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
      openMinutes = todayHours.openMinutes;
      closeMinutes = todayHours.closeMinutes;
    }

    let isOpenBySchedule = false;

    if (!isClosed && openMinutes != null && closeMinutes != null) {
      isOpenBySchedule =
        minutesSinceMidnight >= openMinutes &&
        minutesSinceMidnight < closeMinutes;
    }

    // 临时暂停接单覆盖一切渠道（web + POS）
    const isTemporarilyClosed = config.isTemporarilyClosed;
    const isOpen = isOpenBySchedule && !isTemporarilyClosed;

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
