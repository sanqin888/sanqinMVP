import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import {
  Channel,
  CouponStackingPolicy,
  Prisma,
  PromotionRuleStatus,
  PromotionRuleType,
} from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';

export type AdminPromotionRulePayload = {
  stableId?: string;
  titleZh: string;
  titleEn?: string | null;
  description?: string | null;
  type: PromotionRuleType;
  status?: PromotionRuleStatus;
  priority?: number;
  stackingPolicy?: CouponStackingPolicy;
  excludesCoupons?: boolean;
  excludesItemPromotions?: boolean;
  channels?: Channel[];
  validFrom?: string | null;
  validTo?: string | null;
  weekdays?: number[];
  startMinutes?: number | null;
  endMinutes?: number | null;
  config: unknown;
};

type JsonObject = Record<string, unknown>;

const RULE_TYPES = new Set<PromotionRuleType>(Object.values(PromotionRuleType));
const RULE_STATUSES = new Set<PromotionRuleStatus>(
  Object.values(PromotionRuleStatus),
);
const STACKING_POLICIES = new Set<CouponStackingPolicy>(
  Object.values(CouponStackingPolicy),
);
const CHANNELS = new Set<Channel>(Object.values(Channel));

function isRecord(value: unknown): value is JsonObject {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function requireText(value: unknown, field: string): string {
  if (typeof value !== 'string' || !value.trim()) {
    throw new BadRequestException(`${field} is required`);
  }
  return value.trim();
}

function nullableText(value: unknown): string | null {
  if (value === null || value === undefined) return null;
  if (typeof value !== 'string') {
    throw new BadRequestException('text field must be a string');
  }
  const trimmed = value.trim();
  return trimmed || null;
}

function requireNumber(
  record: JsonObject,
  key: string,
  options: { min: number; max?: number; integer?: boolean },
): number {
  const value = record[key];
  if (typeof value !== 'number' || !Number.isFinite(value)) {
    throw new BadRequestException(`config.${key} must be a number`);
  }
  const normalized = options.integer ? Math.round(value) : value;
  if (normalized < options.min) {
    throw new BadRequestException(`config.${key} is below the allowed minimum`);
  }
  if (typeof options.max === 'number' && normalized > options.max) {
    throw new BadRequestException(`config.${key} exceeds the allowed maximum`);
  }
  return normalized;
}

function optionalNumber(
  record: JsonObject,
  key: string,
  options: { min: number; max?: number; integer?: boolean },
): number | null {
  const value = record[key];
  if (value === null || value === undefined || value === '') return null;
  return requireNumber(record, key, options);
}

function requireStringArray(
  record: JsonObject,
  key: string,
  options?: { allowEmpty?: boolean },
): string[] {
  const value = record[key];
  if (!Array.isArray(value)) {
    throw new BadRequestException(`config.${key} must be an array`);
  }
  const normalized = value
    .filter((item): item is string => typeof item === 'string')
    .map((item) => item.trim())
    .filter(Boolean);
  if (normalized.length !== value.length) {
    throw new BadRequestException(`config.${key} contains an invalid item`);
  }
  if (!options?.allowEmpty && normalized.length === 0) {
    throw new BadRequestException(`config.${key} must not be empty`);
  }
  return Array.from(new Set(normalized));
}

function optionalTargetItems(record: JsonObject): string[] {
  if (record.targetItemStableIds === undefined) return [];
  return requireStringArray(record, 'targetItemStableIds', {
    allowEmpty: true,
  });
}

function addOptionalMinSpend(
  target: Record<string, Prisma.InputJsonValue>,
  record: JsonObject,
): void {
  const minSpendCents = optionalNumber(record, 'minSpendCents', {
    min: 0,
    integer: true,
  });
  if (minSpendCents !== null) target.minSpendCents = minSpendCents;
}

function normalizeConfig(
  type: PromotionRuleType,
  value: unknown,
): Prisma.InputJsonValue {
  if (!isRecord(value)) {
    throw new BadRequestException('config must be an object');
  }

  switch (type) {
    case PromotionRuleType.PERCENTAGE_OFF: {
      const config: Record<string, Prisma.InputJsonValue> = {
        discountPercent: requireNumber(value, 'discountPercent', {
          min: 1,
          max: 100,
          integer: true,
        }),
        targetItemStableIds: optionalTargetItems(value),
      };
      addOptionalMinSpend(config, value);
      return config;
    }
    case PromotionRuleType.FIXED_AMOUNT_OFF: {
      const config: Record<string, Prisma.InputJsonValue> = {
        discountCents: requireNumber(value, 'discountCents', {
          min: 1,
          integer: true,
        }),
        targetItemStableIds: optionalTargetItems(value),
      };
      addOptionalMinSpend(config, value);
      return config;
    }
    case PromotionRuleType.BUY_X_GET_Y: {
      const buyItemStableIds = requireStringArray(value, 'buyItemStableIds');
      const getItemStableIds = requireStringArray(value, 'getItemStableIds');
      const buySet = new Set(buyItemStableIds);
      const getSet = new Set(getItemStableIds);
      const overlapCount = [...buySet].filter((item) =>
        getSet.has(item),
      ).length;
      const sameTargets =
        buySet.size === getSet.size && overlapCount === buySet.size;
      if (overlapCount > 0 && !sameTargets) {
        throw new BadRequestException(
          'BUY_X_GET_Y buy/get item sets must be identical or disjoint',
        );
      }

      const config: Record<string, Prisma.InputJsonValue> = {
        buyItemStableIds,
        buyQuantity: requireNumber(value, 'buyQuantity', {
          min: 1,
          integer: true,
        }),
        getItemStableIds,
        getQuantity: requireNumber(value, 'getQuantity', {
          min: 1,
          integer: true,
        }),
        discountPercent:
          optionalNumber(value, 'discountPercent', {
            min: 1,
            max: 100,
            integer: true,
          }) ?? 100,
      };
      addOptionalMinSpend(config, value);
      return config;
    }
    case PromotionRuleType.FREE_ITEM: {
      const config: Record<string, Prisma.InputJsonValue> = {
        itemStableIds: requireStringArray(value, 'itemStableIds'),
        quantity:
          optionalNumber(value, 'quantity', { min: 1, integer: true }) ?? 1,
      };
      addOptionalMinSpend(config, value);
      return config;
    }
    case PromotionRuleType.LOYALTY_MULTIPLIER: {
      const config: Record<string, Prisma.InputJsonValue> = {
        multiplier: requireNumber(value, 'multiplier', { min: 1, max: 10 }),
      };
      addOptionalMinSpend(config, value);
      return config;
    }
    default:
      throw new BadRequestException('unsupported promotion type');
  }
}

function parseCalendarDate(value: string | null | undefined, field: string) {
  if (value === null || value === undefined || value === '') return null;
  const normalized = value.trim();
  if (!/^\d{4}-\d{2}-\d{2}$/.test(normalized)) {
    throw new BadRequestException(`${field} must use YYYY-MM-DD`);
  }
  const [yearText, monthText, dayText] = normalized.split('-');
  const year = Number(yearText);
  const month = Number(monthText);
  const day = Number(dayText);
  const date = new Date(Date.UTC(year, month - 1, day));
  if (
    Number.isNaN(date.getTime()) ||
    date.getUTCFullYear() !== year ||
    date.getUTCMonth() !== month - 1 ||
    date.getUTCDate() !== day
  ) {
    throw new BadRequestException(`${field} is invalid`);
  }
  return date;
}

function normalizeMinutes(
  value: number | null | undefined,
  field: string,
): number | null {
  if (value === null || value === undefined) return null;
  if (!Number.isInteger(value) || value < 0 || value > 1439) {
    throw new BadRequestException(`${field} must be between 0 and 1439`);
  }
  return value;
}

function normalizeWeekdays(value: number[] | undefined): number[] {
  if (!value) return [];
  if (
    value.some(
      (weekday) => !Number.isInteger(weekday) || weekday < 1 || weekday > 7,
    )
  ) {
    throw new BadRequestException('weekdays must contain values from 1 to 7');
  }
  return Array.from(new Set(value)).sort((left, right) => left - right);
}

function normalizeChannels(value: Channel[] | undefined): Channel[] {
  const channels = value ?? [Channel.web, Channel.in_store];
  if (
    channels.length === 0 ||
    channels.some((channel) => !CHANNELS.has(channel))
  ) {
    throw new BadRequestException(
      'channels must contain a supported order channel',
    );
  }
  return Array.from(new Set(channels));
}

@Injectable()
export class AdminPromotionsService {
  constructor(private readonly prisma: PrismaService) {}

  async listRules() {
    return this.prisma.promotionRule.findMany({
      where: { deletedAt: null },
      orderBy: [{ status: 'asc' }, { priority: 'asc' }, { createdAt: 'desc' }],
    });
  }

  async getRule(stableId: string) {
    const rule = await this.prisma.promotionRule.findFirst({
      where: { stableId, deletedAt: null },
    });
    if (!rule) throw new NotFoundException('promotion rule not found');
    return rule;
  }

  async createRule(payload: AdminPromotionRulePayload) {
    const data = this.normalizePayload(payload);
    return this.prisma.promotionRule.create({
      data: {
        ...(payload.stableId?.trim()
          ? { stableId: payload.stableId.trim() }
          : {}),
        ...data,
      },
    });
  }

  async updateRule(stableId: string, payload: AdminPromotionRulePayload) {
    const existing = await this.prisma.promotionRule.findFirst({
      where: { stableId, deletedAt: null },
      select: { id: true },
    });
    if (!existing) throw new NotFoundException('promotion rule not found');

    return this.prisma.promotionRule.update({
      where: { id: existing.id },
      data: this.normalizePayload(payload),
    });
  }

  async deleteRule(stableId: string) {
    const existing = await this.prisma.promotionRule.findFirst({
      where: { stableId, deletedAt: null },
      select: { id: true },
    });
    if (!existing) throw new NotFoundException('promotion rule not found');

    return this.prisma.promotionRule.update({
      where: { id: existing.id },
      data: { deletedAt: new Date(), status: PromotionRuleStatus.ENDED },
    });
  }

  private normalizePayload(payload: AdminPromotionRulePayload) {
    if (!RULE_TYPES.has(payload.type)) {
      throw new BadRequestException('unsupported promotion type');
    }
    const status = payload.status ?? PromotionRuleStatus.DRAFT;
    if (!RULE_STATUSES.has(status)) {
      throw new BadRequestException('unsupported promotion status');
    }
    const stackingPolicy =
      payload.stackingPolicy ?? CouponStackingPolicy.EXCLUSIVE;
    if (!STACKING_POLICIES.has(stackingPolicy)) {
      throw new BadRequestException('unsupported stacking policy');
    }
    const priority = payload.priority ?? 175;
    if (!Number.isInteger(priority) || priority < 101 || priority > 1000) {
      throw new BadRequestException('priority must be between 101 and 1000');
    }
    const validFrom = parseCalendarDate(payload.validFrom, 'validFrom');
    const validTo = parseCalendarDate(payload.validTo, 'validTo');
    if (validFrom && validTo && validFrom.getTime() > validTo.getTime()) {
      throw new BadRequestException('validFrom must be on or before validTo');
    }
    const startMinutes = normalizeMinutes(payload.startMinutes, 'startMinutes');
    const endMinutes = normalizeMinutes(payload.endMinutes, 'endMinutes');
    if (
      startMinutes !== null &&
      endMinutes !== null &&
      endMinutes < startMinutes
    ) {
      throw new BadRequestException(
        'endMinutes must be on or after startMinutes',
      );
    }

    return {
      titleZh: requireText(payload.titleZh, 'titleZh'),
      titleEn: nullableText(payload.titleEn),
      description: nullableText(payload.description),
      type: payload.type,
      status,
      priority,
      stackingPolicy,
      excludesCoupons: payload.excludesCoupons ?? false,
      excludesItemPromotions: payload.excludesItemPromotions ?? false,
      channels: normalizeChannels(payload.channels),
      validFrom,
      validTo,
      weekdays: normalizeWeekdays(payload.weekdays),
      startMinutes,
      endMinutes,
      config: normalizeConfig(payload.type, payload.config),
    };
  }
}
