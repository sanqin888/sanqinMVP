// apps/api/src/admin/business/admin-business.service.ts

import { Injectable, BadRequestException, Inject } from '@nestjs/common';
import { AppLogger } from '../../common/app-logger';
import {
  BRAND_STORE_CONFIG_READER,
  BRAND_STORE_CONFIG_WRITER,
  STORE_SCHEDULE_READER,
  STORE_SCHEDULE_WRITER,
  type BrandConfigSnapshot,
  type BrandConfigUpdateInput,
  type BrandStoreConfigReaderPort,
  type BrandStoreConfigWriterPort,
  type StoreBusinessHour,
  type StoreConfigSnapshot,
  type StoreConfigUpdateInput,
  type StoreHoliday,
  type StoreScheduleReaderPort,
  type StoreScheduleWriterPort,
  type StoreWeekday,
} from '../../store/public-api';
import {
  UBER_EATS_STORE_STATUS_SYNC,
  type UberEatsStoreStatusSyncPort,
} from '../../integrations/ubereats/public-api';

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

const LEGACY_LOYALTY_POLICY_FIELDS = [
  'earnPtPerDollar',
  'redeemDollarPerPoint',
  'referralPtPerDollar',
  'tierMultiplierBronze',
  'tierMultiplierSilver',
  'tierMultiplierGold',
  'tierMultiplierPlatinum',
  'tierThresholdSilver',
  'tierThresholdGold',
  'tierThresholdPlatinum',
] as const;

export type BusinessConfigResponse = {
  timezone: string;
  isTemporarilyClosed: boolean;
  temporaryCloseReason: string | null;
  publicNotice: string | null;
  publicNoticeEn: string | null;
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
  brandNameZh: string | null;
  brandNameEn: string | null;
  siteUrl: string | null;
  emailFromNameZh: string | null;
  emailFromNameEn: string | null;
  emailFromAddress: string | null;
  smsSignature: string | null;
  supportPhone: string | null;
  supportEmail: string | null;
  salesTaxRate: number;
  wechatAlipayExchangeRate: number;
  enableUberDirect: boolean;
  allergyHandlingMode: 'RELAY_ALL' | 'DENY_LIST' | 'DENY_ALL';
  unsupportedAllergens: string[];
  hours: DayConfigDto[];
  holidays: HolidayDto[];
};

@Injectable()
export class AdminBusinessService {
  private readonly logger = new AppLogger(AdminBusinessService.name);

  constructor(
    @Inject(BRAND_STORE_CONFIG_READER)
    private readonly brandStoreConfigReader: BrandStoreConfigReaderPort,
    @Inject(BRAND_STORE_CONFIG_WRITER)
    private readonly brandStoreConfigWriter: BrandStoreConfigWriterPort,
    @Inject(STORE_SCHEDULE_READER)
    private readonly storeScheduleReader: StoreScheduleReaderPort,
    @Inject(STORE_SCHEDULE_WRITER)
    private readonly storeScheduleWriter: StoreScheduleWriterPort,
    @Inject(UBER_EATS_STORE_STATUS_SYNC)
    private readonly uberEatsService: UberEatsStoreStatusSyncPort,
  ) {}

  getBrandConfig(): Promise<BrandConfigSnapshot> {
    return this.brandStoreConfigReader.getBrandSnapshot();
  }

  getStoreConfig(): Promise<StoreConfigSnapshot> {
    return this.brandStoreConfigReader.getStoreSnapshot();
  }

  async updateBrandConfig(payload: unknown): Promise<BrandConfigSnapshot> {
    if (!payload || typeof payload !== 'object') {
      throw new BadRequestException('brand config payload must be an object');
    }
    const body = payload as Record<string, unknown>;
    await this.updateConfig({
      brandNameZh: body.brandNameZh,
      brandNameEn: body.brandNameEn,
      siteUrl: body.siteUrl,
      emailFromNameZh: body.emailFromNameZh,
      emailFromNameEn: body.emailFromNameEn,
      emailFromAddress: body.emailFromAddress,
      smsSignature: body.smsSignature,
      supportPhone: body.supportPhone,
      supportEmail: body.supportEmail,
      wechatAlipayExchangeRate: body.wechatAlipayExchangeRate,
    });
    return this.getBrandConfig();
  }

  async updateStoreConfig(payload: unknown): Promise<StoreConfigSnapshot> {
    if (!payload || typeof payload !== 'object') {
      throw new BadRequestException('store config payload must be an object');
    }
    const body = payload as Record<string, unknown>;
    await this.updateConfig({
      timezone: body.timezone,
      isTemporarilyClosed: body.isTemporarilyClosed,
      reason: body.temporaryCloseReason,
      publicNotice: body.publicNotice,
      publicNoticeEn: body.publicNoticeEn,
      deliveryBaseFeeCents: body.deliveryBaseFeeCents,
      priorityPerKmCents: body.priorityPerKmCents,
      maxDeliveryRangeKm: body.maxDeliveryRangeKm,
      priorityDefaultDistanceKm: body.priorityDefaultDistanceKm,
      storeLatitude: body.latitude,
      storeLongitude: body.longitude,
      storeAddressLine1: body.addressLine1,
      storeAddressLine2: body.addressLine2,
      storeCity: body.city,
      storeProvince: body.province,
      storePostalCode: body.postalCode,
      salesTaxRate: body.salesTaxRate,
      enableUberDirect: body.enableUberDirect,
      allergyHandlingMode: body.allergyHandlingMode,
      unsupportedAllergens: body.unsupportedAllergens,
    });
    return this.getStoreConfig();
  }

  async getStoreHours(): Promise<StoreBusinessHour[]> {
    const store = await this.brandStoreConfigReader.getStoreSnapshot();
    return this.ensureHoursInitialized(store.storeStableId);
  }

  async updateStoreHours(rawHours: unknown): Promise<StoreBusinessHour[]> {
    await this.updateHours(rawHours);
    return this.getStoreHours();
  }

  async getStoreHolidays(): Promise<StoreHoliday[]> {
    const store = await this.brandStoreConfigReader.getStoreSnapshot();
    return this.storeScheduleReader.listHolidays(store.storeStableId);
  }

  async updateStoreHolidays(raw: unknown): Promise<StoreHoliday[]> {
    await this.saveHolidays(raw);
    return this.getStoreHolidays();
  }

  /**
   * 统一返回给前端的配置：
   * - timezone
   * - isTemporarilyClosed / temporaryCloseReason
   * - 每周营业时间（7 天）
   * - 节假日列表
   */
  async getConfig(): Promise<BusinessConfigResponse> {
    const brandStoreConfig = await this.brandStoreConfigReader.getSnapshot();
    const { brand, store } = brandStoreConfig;
    const [hours, holidays] = await Promise.all([
      this.ensureHoursInitialized(store.storeStableId),
      this.storeScheduleReader.listHolidays(store.storeStableId),
    ]);

    return {
      timezone: store.timezone,
      isTemporarilyClosed: store.isTemporarilyClosed,
      temporaryCloseReason: store.temporaryCloseReason,
      publicNotice: store.publicNotice,
      publicNoticeEn: store.publicNoticeEn,
      deliveryBaseFeeCents: store.deliveryBaseFeeCents,
      priorityPerKmCents: store.priorityPerKmCents,
      maxDeliveryRangeKm: store.maxDeliveryRangeKm,
      priorityDefaultDistanceKm: store.priorityDefaultDistanceKm,
      storeLatitude: store.latitude,
      storeLongitude: store.longitude,
      storeAddressLine1: store.addressLine1,
      storeAddressLine2: store.addressLine2,
      storeCity: store.city,
      storeProvince: store.province,
      storePostalCode: store.postalCode,
      brandNameZh: brand.brandNameZh,
      brandNameEn: brand.brandNameEn,
      siteUrl: brand.siteUrl,
      emailFromNameZh: brand.emailFromNameZh,
      emailFromNameEn: brand.emailFromNameEn,
      emailFromAddress: brand.emailFromAddress,
      smsSignature: brand.smsSignature,
      supportPhone: brand.supportPhone,
      supportEmail: brand.supportEmail,
      salesTaxRate: store.salesTaxRate,
      wechatAlipayExchangeRate: Number(
        brand.wechatAlipayExchangeRate.toFixed(2),
      ),
      enableUberDirect: store.enableUberDirect,
      allergyHandlingMode: store.allergyHandlingMode,
      unsupportedAllergens: store.unsupportedAllergens,
      hours: hours.map((h) => ({
        weekday: h.weekday,
        openMinutes: h.openMinutes ?? 0,
        closeMinutes: h.closeMinutes ?? 0,
        isClosed: h.isClosed,
      })),
      holidays: holidays.map((h) => ({
        date: h.date,
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

    const storeStableId = (
      await this.brandStoreConfigReader.getStoreSnapshot()
    ).storeStableId;
    await this.storeScheduleWriter.replaceBusinessHours(
      storeStableId,
      sanitized.map((h): StoreBusinessHour => ({
        weekday: h.weekday as StoreWeekday,
        openMinutes: h.isClosed ? null : h.openMinutes,
        closeMinutes: h.isClosed ? null : h.closeMinutes,
        isClosed: h.isClosed,
      })),
    );

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

    const rejectedLoyaltyFields = LEGACY_LOYALTY_POLICY_FIELDS.filter((field) =>
      Object.prototype.hasOwnProperty.call(payload, field),
    );
    if (rejectedLoyaltyFields.length > 0) {
      throw new BadRequestException(
        'Loyalty policy fields are no longer accepted by Admin Business config; ' +
          `use /admin/benefits/loyalty-policy instead: ${rejectedLoyaltyFields.join(', ')}`,
      );
    }

    const {
      timezone,
      isTemporarilyClosed,
      reason,
      publicNotice,
      publicNoticeEn,
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
      brandNameZh,
      brandNameEn,
      siteUrl,
      emailFromNameZh,
      emailFromNameEn,
      emailFromAddress,
      smsSignature,
      supportPhone,
      supportEmail,
      salesTaxRate,
      wechatAlipayExchangeRate,
      enableUberDirect,
      allergyHandlingMode,
      unsupportedAllergens,
    } = payload as {
      timezone?: unknown;
      isTemporarilyClosed?: unknown;
      reason?: unknown;
      publicNotice?: unknown;
      publicNoticeEn?: unknown;
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
      brandNameZh?: unknown;
      brandNameEn?: unknown;
      siteUrl?: unknown;
      emailFromNameZh?: unknown;
      emailFromNameEn?: unknown;
      emailFromAddress?: unknown;
      smsSignature?: unknown;
      supportPhone?: unknown;
      supportEmail?: unknown;
      salesTaxRate?: unknown;
      wechatAlipayExchangeRate?: unknown;
      enableUberDirect?: unknown;
      allergyHandlingMode?: unknown;
      unsupportedAllergens?: unknown;
    };

    if (
      typeof isTemporarilyClosed !== 'boolean' &&
      isTemporarilyClosed !== undefined
    ) {
      throw new BadRequestException(
        'isTemporarilyClosed must be provided as boolean',
      );
    }

    const storeConfigSnapshot =
      await this.brandStoreConfigReader.getStoreSnapshot();

    const trimmedReason =
      typeof reason === 'string' ? reason.trim() : undefined;

    const brandUpdates: BrandConfigUpdateInput = {};
    const storeUpdates: StoreConfigUpdateInput = {};

    if (allergyHandlingMode !== undefined) {
      if (
        allergyHandlingMode !== 'RELAY_ALL' &&
        allergyHandlingMode !== 'DENY_LIST' &&
        allergyHandlingMode !== 'DENY_ALL'
      ) {
        throw new BadRequestException(
          'allergyHandlingMode must be RELAY_ALL, DENY_LIST, or DENY_ALL',
        );
      }
      storeUpdates.allergyHandlingMode = allergyHandlingMode;
    }

    if (unsupportedAllergens !== undefined) {
      if (!Array.isArray(unsupportedAllergens)) {
        throw new BadRequestException('unsupportedAllergens must be an array');
      }
      const normalized = unsupportedAllergens.map((value, index) => {
        if (typeof value !== 'string') {
          throw new BadRequestException(
            `unsupportedAllergens[${index}] must be a string`,
          );
        }
        const code = value.trim().toUpperCase();
        if (!code || code.length > 64 || !/^[A-Z0-9_-]+$/.test(code)) {
          throw new BadRequestException(
            `unsupportedAllergens[${index}] must be a non-empty allergen code containing only letters, numbers, _ or -`,
          );
        }
        return code;
      });
      storeUpdates.unsupportedAllergens = [...new Set(normalized)];
    }

    if (timezone !== undefined) {
      storeUpdates.timezone = this.normalizeTimezone('timezone', timezone);
    }

    if (typeof isTemporarilyClosed === 'boolean') {
      storeUpdates.isTemporarilyClosed = isTemporarilyClosed;
      storeUpdates.temporaryCloseReason = isTemporarilyClosed
        ? trimmedReason && trimmedReason.length > 0
          ? trimmedReason
          : null
        : null;
    } else if (
      trimmedReason !== undefined &&
      storeConfigSnapshot.isTemporarilyClosed
    ) {
      // 允许单独更新 reason（仅当当前是暂停状态）
      storeUpdates.temporaryCloseReason =
        trimmedReason.length > 0 ? trimmedReason : null;
    }

    if (publicNotice !== undefined) {
      storeUpdates.publicNotice = this.normalizeOptionalText(
        'publicNotice',
        publicNotice,
      );
    }

    if (publicNoticeEn !== undefined) {
      storeUpdates.publicNoticeEn = this.normalizeOptionalText(
        'publicNoticeEn',
        publicNoticeEn,
      );
    }

    if (deliveryBaseFeeCents !== undefined) {
      storeUpdates.deliveryBaseFeeCents = this.normalizeFeeCents(
        'deliveryBaseFeeCents',
        deliveryBaseFeeCents,
      );
    }

    if (priorityPerKmCents !== undefined) {
      storeUpdates.priorityPerKmCents = this.normalizeFeeCents(
        'priorityPerKmCents',
        priorityPerKmCents,
      );
    }

    if (maxDeliveryRangeKm !== undefined) {
      storeUpdates.maxDeliveryRangeKm = this.normalizePositiveNumber(
        'maxDeliveryRangeKm',
        maxDeliveryRangeKm,
      );
    }

    if (priorityDefaultDistanceKm !== undefined) {
      storeUpdates.priorityDefaultDistanceKm = this.normalizePositiveNumber(
        'priorityDefaultDistanceKm',
        priorityDefaultDistanceKm,
      );
    }

    if (storeLatitude !== undefined) {
      storeUpdates.latitude = this.normalizeOptionalNumber(
        'storeLatitude',
        storeLatitude,
      );
    }

    if (storeLongitude !== undefined) {
      storeUpdates.longitude = this.normalizeOptionalNumber(
        'storeLongitude',
        storeLongitude,
      );
    }

    if (storeAddressLine1 !== undefined) {
      storeUpdates.addressLine1 = this.normalizeOptionalText(
        'storeAddressLine1',
        storeAddressLine1,
      );
    }

    if (storeAddressLine2 !== undefined) {
      storeUpdates.addressLine2 = this.normalizeOptionalText(
        'storeAddressLine2',
        storeAddressLine2,
      );
    }

    if (storeCity !== undefined) {
      storeUpdates.city = this.normalizeOptionalText('storeCity', storeCity);
    }

    if (storeProvince !== undefined) {
      storeUpdates.province = this.normalizeOptionalText(
        'storeProvince',
        storeProvince,
      );
    }

    if (storePostalCode !== undefined) {
      storeUpdates.postalCode = this.normalizeOptionalText(
        'storePostalCode',
        storePostalCode,
      );
    }

    if (brandNameZh !== undefined) {
      brandUpdates.brandNameZh = this.normalizeOptionalText(
        'brandNameZh',
        brandNameZh,
      );
    }

    if (brandNameEn !== undefined) {
      brandUpdates.brandNameEn = this.normalizeOptionalText(
        'brandNameEn',
        brandNameEn,
      );
    }

    if (siteUrl !== undefined) {
      brandUpdates.siteUrl = this.normalizeOptionalText('siteUrl', siteUrl);
    }

    if (emailFromNameZh !== undefined) {
      brandUpdates.emailFromNameZh = this.normalizeOptionalText(
        'emailFromNameZh',
        emailFromNameZh,
      );
    }

    if (emailFromNameEn !== undefined) {
      brandUpdates.emailFromNameEn = this.normalizeOptionalText(
        'emailFromNameEn',
        emailFromNameEn,
      );
    }

    if (emailFromAddress !== undefined) {
      brandUpdates.emailFromAddress = this.normalizeOptionalText(
        'emailFromAddress',
        emailFromAddress,
      );
    }

    if (smsSignature !== undefined) {
      brandUpdates.smsSignature = this.normalizeOptionalText(
        'smsSignature',
        smsSignature,
      );
    }

    if (supportPhone !== undefined) {
      brandUpdates.supportPhone = this.normalizeOptionalText(
        'supportPhone',
        supportPhone,
      );
    }

    if (supportEmail !== undefined) {
      brandUpdates.supportEmail = this.normalizeOptionalText(
        'supportEmail',
        supportEmail,
      );
    }

    if (salesTaxRate !== undefined) {
      storeUpdates.salesTaxRate = this.normalizeRate(
        'salesTaxRate',
        salesTaxRate,
      );
    }

    if (wechatAlipayExchangeRate !== undefined) {
      brandUpdates.wechatAlipayExchangeRate = this.normalizeExchangeRate(
        'wechatAlipayExchangeRate',
        wechatAlipayExchangeRate,
      );
    }

    if (enableUberDirect !== undefined) {
      if (typeof enableUberDirect !== 'boolean') {
        throw new BadRequestException('enableUberDirect must be a boolean');
      }
      storeUpdates.enableUberDirect = enableUberDirect;
    }

    const hasBrandUpdates = Object.keys(brandUpdates).length > 0;
    const hasStoreUpdates = Object.keys(storeUpdates).length > 0;
    if (!hasBrandUpdates && !hasStoreUpdates) {
      return this.getConfig();
    }

    const temporaryPauseChanged =
      (storeUpdates.isTemporarilyClosed !== undefined &&
        storeUpdates.isTemporarilyClosed !==
          storeConfigSnapshot.isTemporarilyClosed) ||
      (storeUpdates.temporaryCloseReason !== undefined &&
        storeUpdates.temporaryCloseReason !==
          storeConfigSnapshot.temporaryCloseReason);

    if (hasBrandUpdates || hasStoreUpdates) {
      await this.brandStoreConfigWriter.updateConfig({
        brand: hasBrandUpdates ? brandUpdates : undefined,
        store: hasStoreUpdates ? storeUpdates : undefined,
      });
    }

    if (temporaryPauseChanged) {
      await this.syncUberStoreStatusSafely('admin_business_config');
    }

    this.logger.log(
      `Business config updated: isTemporarilyClosed=${storeUpdates.isTemporarilyClosed ?? storeConfigSnapshot.isTemporarilyClosed} reason="${
        storeUpdates.temporaryCloseReason ?? trimmedReason ?? ''
      }" baseFee=${storeUpdates.deliveryBaseFeeCents ?? storeConfigSnapshot.deliveryBaseFeeCents} perKm=${
        storeUpdates.priorityPerKmCents ??
        storeConfigSnapshot.priorityPerKmCents
      } taxRate=${storeUpdates.salesTaxRate ?? storeConfigSnapshot.salesTaxRate}`,
    );

    return this.getConfig();
  }

  private async syncUberStoreStatusSafely(source: string) {
    try {
      await this.uberEatsService.syncStoreStatusToUber();
    } catch (error) {
      const message = error instanceof Error ? error.message : `${error}`;
      this.logger.warn(
        `Failed to sync Uber store status after ${source}: ${message}`,
      );
    }
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

    const sanitized: StoreHoliday[] = [];

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
        date: this.dateToIsoDate(date),
        name,
        isClosed,
        openMinutes,
        closeMinutes,
      });
    });

    const storeStableId = (
      await this.brandStoreConfigReader.getStoreSnapshot()
    ).storeStableId;
    await this.storeScheduleWriter.replaceHolidays(storeStableId, sanitized);

    this.logger.log(
      `Holidays updated: count=${sanitized.length} dates=${sanitized
        .map((h) => h.date)
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

  /** 确保当前门店至少有一组 BusinessHour；没有时初始化为“全部休息”。 */
  private async ensureHoursInitialized(
    storeStableId: string,
  ): Promise<StoreBusinessHour[]> {
    let hours = await this.storeScheduleReader.listBusinessHours(storeStableId);

    if (hours.length === 0) {
      this.logger.log(
        `BusinessHour is empty for store=${storeStableId}, initializing 7 closed days by default`,
      );

      const data: StoreBusinessHour[] = Array.from({ length: 7 }).map(
        (_, weekday) => ({
          weekday: weekday as StoreWeekday,
          openMinutes: null,
          closeMinutes: null,
          isClosed: true,
        }),
      );

      await this.storeScheduleWriter.replaceBusinessHours(storeStableId, data);
      hours = await this.storeScheduleReader.listBusinessHours(storeStableId);
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

  private normalizeExchangeRate(label: string, value: unknown): number {
    if (typeof value !== 'number' || !Number.isFinite(value)) {
      throw new BadRequestException(`${label} must be a finite number`);
    }

    if (value <= 0) {
      throw new BadRequestException(`${label} must be > 0`);
    }

    return Number(value.toFixed(2));
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
}
