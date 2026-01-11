// apps/api/src/admin/business/admin-business.service.ts

import { Injectable, BadRequestException } from '@nestjs/common';
import type { BusinessConfig, BusinessHour } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { AppLogger } from '../../common/app-logger';

export type DayConfigDto = {
  weekday: number; // 0-6
  openMinutes: number;
  closeMinutes: number;
  isClosed: boolean;
};

export type HolidayDto = {
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
  deliveryBaseFeeCents: number;
  priorityPerKmCents: number;
  maxDeliveryRangeKm: number;
  priorityDefaultDistanceKm: number;
  storeLatitude: number | null;
  storeLongitude: number | null;
  storeAddressLine1: string | null;
  storeAddressLine2: string | null;
  storeCity: string | null;
  storeProvince: string | null;
  storePostalCode: string | null;
  supportPhone: string | null;
  supportEmail: string | null;
  salesTaxRate: number;
  earnPtPerDollar: number;
  redeemDollarPerPoint: number;
  referralPtPerDollar: number;
  tierThresholdSilver: number;
  tierThresholdGold: number;
  tierThresholdPlatinum: number;
  enableDoorDash: boolean;
  enableUberDirect: boolean;
  hours: DayConfigDto[];
  holidays: HolidayDto[];
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
      deliveryBaseFeeCents: config.deliveryBaseFeeCents,
      priorityPerKmCents: config.priorityPerKmCents,
      maxDeliveryRangeKm: config.maxDeliveryRangeKm,
      priorityDefaultDistanceKm: config.priorityDefaultDistanceKm,
      storeLatitude: config.storeLatitude ?? null,
      storeLongitude: config.storeLongitude ?? null,
      storeAddressLine1: config.storeAddressLine1 ?? null,
      storeAddressLine2: config.storeAddressLine2 ?? null,
      storeCity: config.storeCity ?? null,
      storeProvince: config.storeProvince ?? null,
      storePostalCode: config.storePostalCode ?? null,
      supportPhone: config.supportPhone ?? null,
      supportEmail: config.supportEmail ?? null,
      salesTaxRate: config.salesTaxRate,
      earnPtPerDollar: config.earnPtPerDollar,
      redeemDollarPerPoint: config.redeemDollarPerPoint,
      referralPtPerDollar: config.referralPtPerDollar,
      tierThresholdSilver: config.tierThresholdSilver,
      tierThresholdGold: config.tierThresholdGold,
      tierThresholdPlatinum: config.tierThresholdPlatinum,
      enableDoorDash: config.enableDoorDash,
      enableUberDirect: config.enableUberDirect,
      hours: hours.map((h) => ({
        weekday: h.weekday,
        openMinutes: h.openMinutes ?? 0,
        closeMinutes: h.closeMinutes ?? 0,
        isClosed: h.isClosed,
      })),
      holidays: holidays.map((h) => ({
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
   * - 可同时更新配送费/税率
   */
  async updateConfig(payload: unknown): Promise<BusinessConfigResponse> {
    if (!payload || typeof payload !== 'object') {
      throw new BadRequestException(
        'payload must be an object with isTemporarilyClosed (boolean)',
      );
    }

    const {
      timezone,
      isTemporarilyClosed,
      reason,
      deliveryBaseFeeCents,
      priorityPerKmCents,
      maxDeliveryRangeKm,
      priorityDefaultDistanceKm,
      storeLatitude,
      storeLongitude,
      storeAddressLine1,
      storeAddressLine2,
      storeCity,
      storeProvince,
      storePostalCode,
      storeAddress,
      supportPhone,
      supportEmail,
      salesTaxRate,
      earnPtPerDollar,
      redeemDollarPerPoint,
      referralPtPerDollar,
      tierThresholdSilver,
      tierThresholdGold,
      tierThresholdPlatinum,
      enableDoorDash,
      enableUberDirect,
    } = payload as {
      timezone?: unknown;
      isTemporarilyClosed?: unknown;
      reason?: unknown;
      deliveryBaseFeeCents?: unknown;
      priorityPerKmCents?: unknown;
      maxDeliveryRangeKm?: unknown;
      priorityDefaultDistanceKm?: unknown;
      storeLatitude?: unknown;
      storeLongitude?: unknown;
      storeAddressLine1?: unknown;
      storeAddressLine2?: unknown;
      storeCity?: unknown;
      storeProvince?: unknown;
      storePostalCode?: unknown;
      storeAddress?: unknown;
      supportPhone?: unknown;
      supportEmail?: unknown;
      salesTaxRate?: unknown;
      earnPtPerDollar?: unknown;
      redeemDollarPerPoint?: unknown;
      referralPtPerDollar?: unknown;
      tierThresholdSilver?: unknown;
      tierThresholdGold?: unknown;
      tierThresholdPlatinum?: unknown;
      enableDoorDash?: unknown;
      enableUberDirect?: unknown;
    };

    if (
      typeof isTemporarilyClosed !== 'boolean' &&
      isTemporarilyClosed !== undefined
    ) {
      throw new BadRequestException(
        'isTemporarilyClosed must be provided as boolean',
      );
    }

    const config = await this.ensureConfig();

    const trimmedReason =
      typeof reason === 'string' ? reason.trim() : undefined;

    const updates: Partial<BusinessConfig> = {};

    if (timezone !== undefined) {
      updates.timezone = this.normalizeTimezone('timezone', timezone);
    }

    if (typeof isTemporarilyClosed === 'boolean') {
      updates.isTemporarilyClosed = isTemporarilyClosed;
      updates.temporaryCloseReason = isTemporarilyClosed
        ? trimmedReason && trimmedReason.length > 0
          ? trimmedReason
          : null
        : null;
    } else if (trimmedReason !== undefined && config.isTemporarilyClosed) {
      // 允许单独更新 reason（仅当当前是暂停状态）
      updates.temporaryCloseReason =
        trimmedReason.length > 0 ? trimmedReason : null;
    }

    if (deliveryBaseFeeCents !== undefined) {
      updates.deliveryBaseFeeCents = this.normalizeFeeCents(
        'deliveryBaseFeeCents',
        deliveryBaseFeeCents,
      );
    }

    if (priorityPerKmCents !== undefined) {
      updates.priorityPerKmCents = this.normalizeFeeCents(
        'priorityPerKmCents',
        priorityPerKmCents,
      );
    }

    if (maxDeliveryRangeKm !== undefined) {
      updates.maxDeliveryRangeKm = this.normalizePositiveNumber(
        'maxDeliveryRangeKm',
        maxDeliveryRangeKm,
      );
    }

    if (priorityDefaultDistanceKm !== undefined) {
      updates.priorityDefaultDistanceKm = this.normalizePositiveNumber(
        'priorityDefaultDistanceKm',
        priorityDefaultDistanceKm,
      );
    }

    if (storeLatitude !== undefined) {
      updates.storeLatitude = this.normalizeOptionalNumber(
        'storeLatitude',
        storeLatitude,
      );
    }

    if (storeLongitude !== undefined) {
      updates.storeLongitude = this.normalizeOptionalNumber(
        'storeLongitude',
        storeLongitude,
      );
    }

    if (storeAddressLine1 !== undefined) {
      updates.storeAddressLine1 = this.normalizeOptionalText(
        'storeAddressLine1',
        storeAddressLine1,
      );
    }

    if (storeAddressLine2 !== undefined) {
      updates.storeAddressLine2 = this.normalizeOptionalText(
        'storeAddressLine2',
        storeAddressLine2,
      );
    }

    if (storeCity !== undefined) {
      updates.storeCity = this.normalizeOptionalText('storeCity', storeCity);
    }

    if (storeProvince !== undefined) {
      updates.storeProvince = this.normalizeOptionalText(
        'storeProvince',
        storeProvince,
      );
    }

    if (storePostalCode !== undefined) {
      updates.storePostalCode = this.normalizeOptionalText(
        'storePostalCode',
        storePostalCode,
      );
    }

    if (supportPhone !== undefined) {
      updates.supportPhone = this.normalizeOptionalText(
        'supportPhone',
        supportPhone,
      );
    }

    if (supportEmail !== undefined) {
      updates.supportEmail = this.normalizeOptionalText(
        'supportEmail',
        supportEmail,
      );
    }

    if (salesTaxRate !== undefined) {
      updates.salesTaxRate = this.normalizeRate('salesTaxRate', salesTaxRate);
    }

    if (earnPtPerDollar !== undefined) {
      updates.earnPtPerDollar = this.normalizePositiveNumber(
        'earnPtPerDollar',
        earnPtPerDollar,
      );
    }

    if (redeemDollarPerPoint !== undefined) {
      updates.redeemDollarPerPoint = this.normalizePositiveNumber(
        'redeemDollarPerPoint',
        redeemDollarPerPoint,
      );
    }

    if (referralPtPerDollar !== undefined) {
      updates.referralPtPerDollar = this.normalizePositiveNumber(
        'referralPtPerDollar',
        referralPtPerDollar,
      );
    }

    if (tierThresholdSilver !== undefined) {
      updates.tierThresholdSilver = this.normalizeTierThreshold(
        'tierThresholdSilver',
        tierThresholdSilver,
      );
    }

    if (tierThresholdGold !== undefined) {
      updates.tierThresholdGold = this.normalizeTierThreshold(
        'tierThresholdGold',
        tierThresholdGold,
      );
    }

    if (tierThresholdPlatinum !== undefined) {
      updates.tierThresholdPlatinum = this.normalizeTierThreshold(
        'tierThresholdPlatinum',
        tierThresholdPlatinum,
      );
    }

    if (enableDoorDash !== undefined) {
      if (typeof enableDoorDash !== 'boolean') {
        throw new BadRequestException('enableDoorDash must be a boolean');
      }
      updates.enableDoorDash = enableDoorDash;
    }

    if (enableUberDirect !== undefined) {
      if (typeof enableUberDirect !== 'boolean') {
        throw new BadRequestException('enableUberDirect must be a boolean');
      }
      updates.enableUberDirect = enableUberDirect;
    }

    if (Object.keys(updates).length === 0) {
      return this.getConfig();
    }

    await this.prisma.businessConfig.update({
      where: { id: config.id },
      data: updates,
    });

    this.logger.log(
      `Business config updated: isTemporarilyClosed=${updates.isTemporarilyClosed ?? config.isTemporarilyClosed} reason="${
        updates.temporaryCloseReason ?? trimmedReason ?? ''
      }" baseFee=${updates.deliveryBaseFeeCents ?? config.deliveryBaseFeeCents} perKm=${
        updates.priorityPerKmCents ?? config.priorityPerKmCents
      } taxRate=${updates.salesTaxRate ?? config.salesTaxRate}`,
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

  private normalizeTimezone(label: string, value: unknown): string {
    if (typeof value !== 'string') {
      throw new BadRequestException(`${label} must be a string`);
    }
    const tz = value.trim();
    if (!tz) {
      throw new BadRequestException(`${label} must be a non-empty string`);
    }

    // IANA timezone 校验：无效会抛 RangeError
    try {
      new Intl.DateTimeFormat('en-US', { timeZone: tz }).format(new Date());
    } catch {
      throw new BadRequestException(
        `${label} must be a valid IANA time zone, e.g. "America/Toronto"`,
      );
    }

    return tz;
  }

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

      await this.prisma.businessHour.createMany({
        data,
        skipDuplicates: true,
      });
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

  /** 校验配送费（单位：分） */
  private normalizeFeeCents(label: string, value: unknown): number {
    if (typeof value !== 'number' || !Number.isFinite(value)) {
      throw new BadRequestException(`${label} must be a finite number`);
    }

    const cents = Math.round(value);
    if (cents < 0) {
      throw new BadRequestException(`${label} must be >= 0`);
    }

    return cents;
  }

  /** 校验税率（0 ~ 1 之间的小数） */
  private normalizeRate(label: string, value: unknown): number {
    if (typeof value !== 'number' || !Number.isFinite(value)) {
      throw new BadRequestException(`${label} must be a finite number`);
    }

    if (value < 0 || value > 1) {
      throw new BadRequestException(`${label} must be between 0 and 1`);
    }

    return Number(value.toFixed(4));
  }

  private normalizePositiveNumber(label: string, value: unknown): number {
    if (typeof value !== 'number' || !Number.isFinite(value)) {
      throw new BadRequestException(`${label} must be a finite number`);
    }

    if (value < 0) {
      throw new BadRequestException(`${label} must be >= 0`);
    }

    return Number(value.toFixed(4));
  }

  private normalizeOptionalNumber(
    label: string,
    value: unknown,
  ): number | null {
    if (value === null) return null;
    if (typeof value !== 'number' || !Number.isFinite(value)) {
      throw new BadRequestException(`${label} must be a finite number or null`);
    }
    return value;
  }

  private normalizeOptionalText(label: string, value: unknown): string | null {
    if (value === null) return null;
    if (typeof value !== 'string') {
      throw new BadRequestException(`${label} must be a string or null`);
    }
    const trimmed = value.trim();
    return trimmed.length > 0 ? trimmed : null;
  }

  private normalizeTierThreshold(label: string, value: unknown): number {
    if (typeof value !== 'number' || !Number.isFinite(value)) {
      throw new BadRequestException(`${label} must be a finite number`);
    }

    const cents = Math.round(value);
    if (cents < 0) {
      throw new BadRequestException(`${label} must be >= 0`);
    }

    return cents;
  }
}
