import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import type {
  PromotionRuleChannel,
  PromotionRuleJsonObject,
  PromotionRuleManagementDto,
  PromotionRuleManagementInput,
  PromotionRuleManagementPort,
  PromotionRuleStackingPolicy,
  PromotionRuleStatus,
  PromotionRuleType,
  PromotionRuleWriteModel,
} from './promotion-rule-management.contract';
import { PromotionsService } from './promotions.service';

type JsonObject = Record<string, unknown>;

const RULE_TYPES = new Set<PromotionRuleType>([
  'PERCENTAGE_OFF',
  'FIXED_AMOUNT_OFF',
  'BUY_X_GET_Y',
  'FREE_ITEM',
  'LOYALTY_MULTIPLIER',
]);
const RULE_STATUSES = new Set<PromotionRuleStatus>([
  'DRAFT',
  'ACTIVE',
  'PAUSED',
  'ENDED',
]);
const STACKING_POLICIES = new Set<PromotionRuleStackingPolicy>([
  'EXCLUSIVE',
  'STACKABLE',
]);
const CHANNELS = new Set<PromotionRuleChannel>(['web', 'in_store', 'ubereats']);

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

function optionalBoolean(record: JsonObject, key: string): boolean {
  const value = record[key];
  if (value === undefined) return false;
  if (typeof value !== 'boolean') {
    throw new BadRequestException(`config.${key} must be a boolean`);
  }
  return value;
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
  target: PromotionRuleJsonObject,
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
): PromotionRuleJsonObject {
  if (!isRecord(value)) {
    throw new BadRequestException('config must be an object');
  }

  const membersOnly = optionalBoolean(value, 'membersOnly');

  switch (type) {
    case 'PERCENTAGE_OFF': {
      const config: PromotionRuleJsonObject = {
        membersOnly,
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
    case 'FIXED_AMOUNT_OFF': {
      const config: PromotionRuleJsonObject = {
        membersOnly,
        discountCents: requireNumber(value, 'discountCents', {
          min: 1,
          integer: true,
        }),
        targetItemStableIds: optionalTargetItems(value),
      };
      addOptionalMinSpend(config, value);
      return config;
    }
    case 'BUY_X_GET_Y': {
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

      const config: PromotionRuleJsonObject = {
        membersOnly,
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
    case 'FREE_ITEM': {
      const config: PromotionRuleJsonObject = {
        membersOnly,
        itemStableIds: requireStringArray(value, 'itemStableIds'),
        quantity:
          optionalNumber(value, 'quantity', { min: 1, integer: true }) ?? 1,
      };
      addOptionalMinSpend(config, value);
      return config;
    }
    case 'LOYALTY_MULTIPLIER': {
      const config: PromotionRuleJsonObject = {
        membersOnly,
        multiplier: requireNumber(value, 'multiplier', { min: 1, max: 10 }),
      };
      addOptionalMinSpend(config, value);
      return config;
    }
    default:
      throw new BadRequestException('unsupported promotion type');
  }
}

function parseCalendarDate(
  value: string | null | undefined,
  field: string,
): Date | null {
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

function normalizeChannels(
  value: PromotionRuleChannel[] | undefined,
): PromotionRuleChannel[] {
  const channels = value ?? ['web', 'in_store'];
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

function normalizePayload(
  input: PromotionRuleManagementInput,
): PromotionRuleWriteModel {
  if (!RULE_TYPES.has(input.type)) {
    throw new BadRequestException('unsupported promotion type');
  }
  const status = input.status ?? 'DRAFT';
  if (!RULE_STATUSES.has(status)) {
    throw new BadRequestException('unsupported promotion status');
  }
  const stackingPolicy = input.stackingPolicy ?? 'EXCLUSIVE';
  if (!STACKING_POLICIES.has(stackingPolicy)) {
    throw new BadRequestException('unsupported stacking policy');
  }
  const priority = input.priority ?? 175;
  if (!Number.isInteger(priority) || priority < 101 || priority > 1000) {
    throw new BadRequestException('priority must be between 101 and 1000');
  }
  const validFrom = parseCalendarDate(input.validFrom, 'validFrom');
  const validTo = parseCalendarDate(input.validTo, 'validTo');
  if (validFrom && validTo && validFrom.getTime() > validTo.getTime()) {
    throw new BadRequestException('validFrom must be on or before validTo');
  }
  const startMinutes = normalizeMinutes(input.startMinutes, 'startMinutes');
  const endMinutes = normalizeMinutes(input.endMinutes, 'endMinutes');
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
    titleZh: requireText(input.titleZh, 'titleZh'),
    titleEn: nullableText(input.titleEn),
    description: nullableText(input.description),
    type: input.type,
    status,
    priority,
    stackingPolicy,
    excludesCoupons: input.excludesCoupons ?? false,
    excludesItemPromotions: input.excludesItemPromotions ?? false,
    channels: normalizeChannels(input.channels),
    validFrom,
    validTo,
    weekdays: normalizeWeekdays(input.weekdays),
    startMinutes,
    endMinutes,
    config: normalizeConfig(input.type, input.config),
  };
}

@Injectable()
export class PromotionRuleManagementService implements PromotionRuleManagementPort {
  constructor(private readonly promotions: PromotionsService) {}

  listRules(): Promise<PromotionRuleManagementDto[]> {
    return this.promotions.listPromotionRulesForManagement();
  }

  async getRule(stableId: string): Promise<PromotionRuleManagementDto> {
    const rule = await this.promotions.getPromotionRuleForManagement(stableId);
    if (!rule) throw new NotFoundException('promotion rule not found');
    return rule;
  }

  createRule(
    input: PromotionRuleManagementInput,
  ): Promise<PromotionRuleManagementDto> {
    return this.promotions.createPromotionRuleForManagement(
      input.stableId?.trim() || undefined,
      normalizePayload(input),
    );
  }

  async updateRule(
    stableId: string,
    input: PromotionRuleManagementInput,
  ): Promise<PromotionRuleManagementDto> {
    const rule = await this.promotions.updatePromotionRuleForManagement(
      stableId,
      normalizePayload(input),
    );
    if (!rule) throw new NotFoundException('promotion rule not found');
    return rule;
  }

  async deleteRule(stableId: string): Promise<PromotionRuleManagementDto> {
    const rule =
      await this.promotions.deletePromotionRuleForManagement(stableId);
    if (!rule) throw new NotFoundException('promotion rule not found');
    return rule;
  }
}
