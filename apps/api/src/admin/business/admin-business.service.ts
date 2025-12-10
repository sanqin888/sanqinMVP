// apps/api/src/admin/business/admin-business.service.ts

import { Injectable, BadRequestException } from '@nestjs/common';
import type { BusinessConfig, BusinessHour, Holiday } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { AppLogger } from '../../common/app-logger';

export type DayConfigDto = {
  weekday: number; // 0-6
  openMinutes: number;
  closeMinutes: number;
  isClosed: boolean;
};

export type HolidayDto = {
  id?: number;
  date: string; // 'YYYY-MM-DD'
  name?: string;
  isClosed: boolean;
  openMinutes?: number | null;
  closeMinutes?: number | null;
};

export type BusinessConfigResponse = {
  timezone: string;
  isTemporarilyClosed: boolean;
  temporaryCloseReason: string | null;
  hours: DayConfigDto[];
  holidays: (HolidayDto & { id: number })[];
};

@Injectable()
export class AdminBusinessService {
  private readonly logger = new AppLogger(AdminBusinessService.name);

  constructor(private readonly prisma: PrismaService) {}

  /**
   * 统一返回给前端的配置：
   * - timezone
   * - isTemporarilyClosed / temporaryCloseReason
   * - 每周营业时间（7 天）
   * - 节假日列表
   */
  async getConfig(): Promise<BusinessConfigResponse> {
    const config = await this.ensureConfig();
    const hours = await this.ensureHoursInitialized();
    const holidays = await this.prisma.holiday.findMany({
      orderBy: { date: 'asc' },
    });

    return {
      timezone: config.timezone,
      isTemporarilyClosed: config.isTemporarilyClosed,
      temporaryCloseReason: config.temporaryCloseReason ?? null,
      hours: hours.map((h) => ({
        weekday: h.weekday,
        openMinutes: h.openMinutes ?? 0,
        closeMinutes: h.closeMinutes ?? 0,
        isClosed: h.isClosed,
      })),
      holidays: holidays.map((h) => ({
        id: h.id,
        date: this.dateToIsoDate(h.date),
        name: h.name ?? undefined,
        isClosed: h.isClosed,
        openMinutes: h.openMinutes ?? null,
        closeMinutes: h.closeMinutes ?? null,
      })),
    };
  }

  /**
   * 覆盖式更新每周营业时间：
   * - body.hours 是 0-6 共 7 条（不强制要求有 7 条，但建议前端这样做）
   * - 如果 isClosed=true，open/closeMinutes 会被忽略
   * - 内部实现：deleteMany + createMany
   */
  async updateHours(rawHours: unknown): Promise<BusinessConfigResponse> {
    if (!Array.isArray(rawHours)) {
      throw new BadRequestException('hours must be an array');
    }

    const sanitized: DayConfigDto[] = rawHours.map((entry, index) => {
      if (!entry || typeof entry !== 'object') {
        throw new BadRequestException(
          `hours[${index}] must be an object with weekday/openMinutes/closeMinutes/isClosed`,
        );
      }

      const e = entry as Partial<DayConfigDto>;
      const weekday = e.weekday;

      if (
        typeof weekday !== 'number' ||
        !Number.isFinite(weekday) ||
        weekday < 0 ||
        weekday > 6
      ) {
        throw new BadRequestException(
          `hours[${index}].weekday must be an integer between 0 and 6`,
        );
      }

      const isClosed = Boolean(e.isClosed);
      let openMinutes = 0;
      let closeMinutes = 0;

      if (!isClosed) {
        openMinutes = this.normalizeMinutes(
          `hours[${index}].openMinutes`,
          e.openMinutes,
        );
        closeMinutes = this.normalizeMinutes(
          `hours[${index}].closeMinutes`,
          e.closeMinutes,
        );

        if (openMinutes >= closeMinutes) {
          throw new BadRequestException(
            `hours[${index}]: openMinutes must be less than closeMinutes when isClosed = false`,
          );
        }
      }

      return {
        weekday,
        openMinutes,
        closeMinutes,
        isClosed,
      };
    });

    await this.prisma.$transaction(async (tx) => {
      await tx.businessHour.deleteMany({});
      if (sanitized.length > 0) {
        await tx.businessHour.createMany({
          data: sanitized.map((h) => ({
            weekday: h.weekday,
            openMinutes: h.openMinutes,
            closeMinutes: h.closeMinutes,
            isClosed: h.isClosed,
          })),
        });
      }
    });

    this.logger.log(
      `Business hours updated: ${sanitized
        .map(
          (h) =>
            `weekday=${h.weekday} closed=${h.isClosed} ${h.openMinutes}-${h.closeMinutes}`,
        )
        .join(', ')}`,
    );

    // 返回最新整体配置
    return this.getConfig();
  }

  /**
   * 更新“临时暂停接单”状态。
   * - isTemporarilyClosed = true 时，可选写 reason
   * - isTemporarilyClosed = false 时，自动清空 reason
   */
  async updateTemporaryClose(
    payload: unknown,
  ): Promise<BusinessConfigResponse> {
    if (!payload || typeof payload !== 'object') {
      throw new BadRequestException(
        'payload must be an object with isTemporarilyClosed (boolean)',
      );
    }

    const { isTemporarilyClosed, reason } = payload as {
      isTemporarilyClosed?: unknown;
      reason?: unknown;
    };

    if (typeof isTemporarilyClosed !== 'boolean') {
      throw new BadRequestException(
        'isTemporarilyClosed must be provided as boolean',
      );
    }

    const config = await this.ensureConfig();

    const trimmedReason =
      typeof reason === 'string' ? reason.trim() : undefined;

    await this.prisma.businessConfig.update({
      where: { id: config.id },
      data: {
        isTemporarilyClosed,
        temporaryCloseReason: isTemporarilyClosed
          ? trimmedReason && trimmedReason.length > 0
            ? trimmedReason
            : null
          : null,
      },
    });

    this.logger.log(
      `Temporary close updated: isTemporarilyClosed=${isTemporarilyClosed} reason="${
        trimmedReason ?? ''
      }"`,
    );

    return this.getConfig();
  }

  /**
   * 覆盖式保存节假日：
   * - 调用方传入的 holidays 会覆盖原有全部 Holiday 记录
   * - id 字段当前不参与 upsert，仅作为前端本地 key 用
   */
  async saveHolidays(raw: unknown): Promise<BusinessConfigResponse> {
    if (!raw || typeof raw !== 'object') {
      throw new BadRequestException('payload must be an object with holidays');
    }

    const { holidays } = raw as { holidays?: unknown };

    if (!Array.isArray(holidays)) {
      throw new BadRequestException('holidays must be an array');
    }

    const sanitized: {
      date: Date;
      name: string | null;
      isClosed: boolean;
      openMinutes: number | null;
      closeMinutes: number | null;
    }[] = [];

    holidays.forEach((entry, index) => {
      if (!entry || typeof entry !== 'object') {
        throw new BadRequestException(
          `holidays[${index}] must be an object with date/isClosed/optional name/openMinutes/closeMinutes`,
        );
      }

      const e = entry as HolidayDto;

      if (typeof e.date !== 'string' || e.date.trim().length === 0) {
        throw new BadRequestException(
          `holidays[${index}].date must be a non-empty string 'YYYY-MM-DD'`,
        );
      }

      const date = this.parseDate(e.date, index);
      const isClosed = Boolean(e.isClosed);

      const name =
        typeof e.name === 'string' && e.name.trim().length > 0
          ? e.name.trim()
          : null;

      let openMinutes: number | null = null;
      let closeMinutes: number | null = null;

      if (!isClosed) {
        openMinutes = this.normalizeMinutes(
          `holidays[${index}].openMinutes`,
          e.openMinutes,
        );
        closeMinutes = this.normalizeMinutes(
          `holidays[${index}].closeMinutes`,
          e.closeMinutes,
        );

        if (openMinutes >= closeMinutes) {
          throw new BadRequestException(
            `holidays[${index}]: openMinutes must be less than closeMinutes when isClosed = false`,
          );
        }
      }

      sanitized.push({
        date,
        name,
        isClosed,
        openMinutes,
        closeMinutes,
      });
    });

    await this.prisma.$transaction(async (tx) => {
      await tx.holiday.deleteMany({});
      if (sanitized.length > 0) {
        await tx.holiday.createMany({
          data: sanitized,
        });
      }
    });

    this.logger.log(
      `Holidays updated: count=${sanitized.length} dates=${sanitized
        .map((h) => this.dateToIsoDate(h.date))
        .join(', ')}`,
    );

    return this.getConfig();
  }

  // ========= 私有工具函数 =========

  /** 确保 BusinessConfig 存在（id 固定为 1） */
  private async ensureConfig(): Promise<BusinessConfig> {
    const existing = await this.prisma.businessConfig.findUnique({
      where: { id: 1 },
    });

    if (existing) return existing;

    this.logger.log('BusinessConfig not found, creating default row (id=1)');
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

  /** 确保一周的 BusinessHour 至少有一组记录，没有的话初始化为“全部休息” */
  private async ensureHoursInitialized(): Promise<BusinessHour[]> {
    let hours = await this.prisma.businessHour.findMany({
      orderBy: [{ weekday: 'asc' }, { openMinutes: 'asc' }],
    });

    if (hours.length === 0) {
      this.logger.log(
        'BusinessHour table is empty, initializing 7 closed days by default',
      );

      const data: Omit<BusinessHour, 'id' | 'createdAt' | 'updatedAt'>[] =
        Array.from({ length: 7 }).map((_, weekday) => ({
          weekday,
          openMinutes: 0,
          closeMinutes: 0,
          isClosed: true,
        }));

      await this.prisma.businessHour.createMany({ data });
      hours = await this.prisma.businessHour.findMany({
        orderBy: [{ weekday: 'asc' }, { openMinutes: 'asc' }],
      });
    }

    return hours;
  }

  /** 将 Date 转成 'YYYY-MM-DD' */
  private dateToIsoDate(date: Date): string {
    return date.toISOString().slice(0, 10);
  }

  /** 解析 'YYYY-MM-DD' → Date，错误时抛 BadRequestException */
  private parseDate(dateString: string, index: number): Date {
    const trimmed = dateString.trim();

    if (!/^\d{4}-\d{2}-\d{2}$/.test(trimmed)) {
      throw new BadRequestException(
        `holidays[${index}].date must be in 'YYYY-MM-DD' format`,
      );
    }

    const date = new Date(`${trimmed}T00:00:00.000Z`);
    if (Number.isNaN(date.getTime())) {
      throw new BadRequestException(
        `holidays[${index}].date is not a valid date`,
      );
    }
    return date;
  }

  /** 校验并归一化分钟数（0 ~ 1440） */
  private normalizeMinutes(label: string, value: unknown): number {
    if (typeof value !== 'number' || !Number.isFinite(value)) {
      throw new BadRequestException(`${label} must be a finite number`);
    }

    const minutes = Math.floor(value);
    if (minutes < 0 || minutes > 24 * 60) {
      throw new BadRequestException(
        `${label} must be between 0 and 1440 (inclusive)`,
      );
    }

    return minutes;
  }
}
