// apps/api/src/promotions/promotions.service.ts
import { BadRequestException, Inject, Injectable } from '@nestjs/common';
import type { DailySpecialDto, SpecialPricingMode } from '@shared/menu';
import type { Channel } from '@shared/order';
import { PrismaService } from '../prisma/prisma.service';
import {
  isDailySpecialActiveNow,
  resolveEffectivePriceCents,
  resolveStoreNow,
} from './daily-specials';
import type {
  OrderPromotionContext,
  PromotionContextReaderPort,
} from './promotion-context.contract';
import {
  BRAND_STORE_CONFIG_READER,
  type BrandStoreConfigReaderPort,
} from '../store/public-api';
import type {
  DailySpecialCatalogItemSnapshot,
  DailySpecialOffersPort,
  DailySpecialUpsertPayload,
} from './daily-special-offers.contract';
import type {
  PromotionRuleChannel,
  PromotionRuleManagementDto,
  PromotionRuleStackingPolicy,
  PromotionRuleStatus,
  PromotionRuleType,
  PromotionRuleWriteModel,
} from './promotion-rule-management.contract';

const SPECIAL_PRICING_MODES: readonly SpecialPricingMode[] = [
  'OVERRIDE_PRICE',
  'DISCOUNT_DELTA',
  'DISCOUNT_PERCENT',
];

function toIso(value: Date | null | undefined): string | null {
  return value ? value.toISOString() : null;
}

function parseIsoOrNull(value: unknown): Date | null {
  if (value === null || value === undefined || value === '') return null;
  if (typeof value !== 'string') {
    throw new BadRequestException(
      'tempUnavailableUntil must be ISO string or null',
    );
  }
  const timestamp = Date.parse(value);
  if (!Number.isFinite(timestamp)) {
    throw new BadRequestException(
      'tempUnavailableUntil must be valid ISO string',
    );
  }
  return new Date(timestamp);
}

function catalogItemPriceMap(
  catalogItems: readonly DailySpecialCatalogItemSnapshot[],
): Map<string, number> {
  return new Map(
    catalogItems.map((item) => [item.itemStableId, item.basePriceCents]),
  );
}

type PromotionRulePersistenceRecord = {
  stableId: string;
  titleZh: string;
  titleEn: string | null;
  description: string | null;
  type: string;
  status: string;
  priority: number;
  stackingPolicy: string;
  excludesCoupons: boolean;
  excludesItemPromotions: boolean;
  channels: string[];
  validFrom: Date | null;
  validTo: Date | null;
  weekdays: number[];
  startMinutes: number | null;
  endMinutes: number | null;
  config: unknown;
};

function toPromotionRuleManagementDto(
  rule: PromotionRulePersistenceRecord,
): PromotionRuleManagementDto {
  return {
    stableId: rule.stableId,
    titleZh: rule.titleZh,
    titleEn: rule.titleEn,
    description: rule.description,
    type: rule.type as PromotionRuleType,
    status: rule.status as PromotionRuleStatus,
    priority: rule.priority,
    stackingPolicy: rule.stackingPolicy as PromotionRuleStackingPolicy,
    excludesCoupons: rule.excludesCoupons,
    excludesItemPromotions: rule.excludesItemPromotions,
    channels: rule.channels as PromotionRuleChannel[],
    validFrom: toIso(rule.validFrom),
    validTo: toIso(rule.validTo),
    weekdays: rule.weekdays,
    startMinutes: rule.startMinutes,
    endMinutes: rule.endMinutes,
    config: rule.config,
  };
}

@Injectable()
export class PromotionsService
  implements PromotionContextReaderPort, DailySpecialOffersPort
{
  constructor(
    private readonly prisma: PrismaService,
    @Inject(BRAND_STORE_CONFIG_READER)
    private readonly brandStoreConfigReader: BrandStoreConfigReaderPort,
  ) {}

  async getOrderPromotionContext(
    channel: Channel,
  ): Promise<OrderPromotionContext> {
    const [storeConfig, rules] = await Promise.all([
      this.brandStoreConfigReader.getConfiguredStoreSnapshot(),
      this.prisma.promotionRule.findMany({
        where: {
          status: 'ACTIVE',
          deletedAt: null,
          channels: { has: channel },
        },
        orderBy: [{ priority: 'asc' }, { createdAt: 'asc' }],
      }),
    ]);

    return {
      now: resolveStoreNow(storeConfig.timezone || 'America/Toronto'),
      rules: rules.map((rule) => ({
        stableId: rule.stableId,
        titleZh: rule.titleZh,
        titleEn: rule.titleEn,
        type: rule.type,
        status: rule.status,
        priority: rule.priority,
        stackingPolicy: rule.stackingPolicy,
        excludesCoupons: rule.excludesCoupons,
        excludesItemPromotions: rule.excludesItemPromotions,
        channels: rule.channels,
        validFrom: rule.validFrom,
        validTo: rule.validTo,
        weekdays: rule.weekdays,
        startMinutes: rule.startMinutes,
        endMinutes: rule.endMinutes,
        config: rule.config,
      })),
    };
  }

  async listPromotionRulesForManagement(): Promise<
    PromotionRuleManagementDto[]
  > {
    const rules = await this.prisma.promotionRule.findMany({
      where: { deletedAt: null },
      orderBy: [{ status: 'asc' }, { priority: 'asc' }, { createdAt: 'desc' }],
    });
    return rules.map(toPromotionRuleManagementDto);
  }

  async getPromotionRuleForManagement(
    stableId: string,
  ): Promise<PromotionRuleManagementDto | null> {
    const rule = await this.prisma.promotionRule.findFirst({
      where: { stableId, deletedAt: null },
    });
    return rule ? toPromotionRuleManagementDto(rule) : null;
  }

  async createPromotionRuleForManagement(
    stableId: string | undefined,
    data: PromotionRuleWriteModel,
  ): Promise<PromotionRuleManagementDto> {
    const rule = await this.prisma.promotionRule.create({
      data: {
        ...(stableId ? { stableId } : {}),
        ...data,
      },
    });
    return toPromotionRuleManagementDto(rule);
  }

  async updatePromotionRuleForManagement(
    stableId: string,
    data: PromotionRuleWriteModel,
  ): Promise<PromotionRuleManagementDto | null> {
    const existing = await this.prisma.promotionRule.findFirst({
      where: { stableId, deletedAt: null },
      select: { id: true },
    });
    if (!existing) return null;

    const rule = await this.prisma.promotionRule.update({
      where: { id: existing.id },
      data,
    });
    return toPromotionRuleManagementDto(rule);
  }

  async deletePromotionRuleForManagement(
    stableId: string,
  ): Promise<PromotionRuleManagementDto | null> {
    const existing = await this.prisma.promotionRule.findFirst({
      where: { stableId, deletedAt: null },
      select: { id: true },
    });
    if (!existing) return null;

    const rule = await this.prisma.promotionRule.update({
      where: { id: existing.id },
      data: { deletedAt: new Date(), status: 'ENDED' },
    });
    return toPromotionRuleManagementDto(rule);
  }

  async getDailySpecials(
    weekday: number | undefined,
    catalogItems: readonly DailySpecialCatalogItemSnapshot[],
  ): Promise<{ specials: DailySpecialDto[] }> {
    if (weekday !== undefined && (weekday < 1 || weekday > 7)) {
      throw new BadRequestException('weekday must be between 1 and 7');
    }

    const specials = await this.prisma.menuDailySpecial.findMany({
      where: {
        deletedAt: null,
        ...(weekday ? { weekday } : { weekday: { in: [1, 2, 3, 4, 5, 6, 7] } }),
      },
      orderBy: [{ weekday: 'asc' }, { sortOrder: 'asc' }, { createdAt: 'asc' }],
    });
    const itemPriceMap = catalogItemPriceMap(catalogItems);

    return {
      specials: specials.map((special) => {
        const basePriceCents = itemPriceMap.get(special.itemStableId) ?? 0;
        return {
          stableId: special.stableId,
          weekday: special.weekday,
          itemStableId: special.itemStableId,
          pricingMode: special.pricingMode,
          overridePriceCents: special.overridePriceCents ?? null,
          discountDeltaCents: special.discountDeltaCents ?? null,
          discountPercent: special.discountPercent ?? null,
          startDate: toIso(special.startDate),
          endDate: toIso(special.endDate),
          startMinutes: special.startMinutes ?? null,
          endMinutes: special.endMinutes ?? null,
          disallowCoupons: special.disallowCoupons,
          isEnabled: special.isEnabled,
          sortOrder: special.sortOrder,
          basePriceCents,
          effectivePriceCents: resolveEffectivePriceCents(
            basePriceCents,
            special,
          ),
        };
      }),
    };
  }

  async getActiveDailySpecials(
    catalogItems: readonly DailySpecialCatalogItemSnapshot[],
  ): Promise<{ specials: DailySpecialDto[] }> {
    const { timezone } =
      await this.brandStoreConfigReader.getConfiguredStoreSnapshot();
    const now = resolveStoreNow(timezone || 'America/Toronto');
    const rawDailySpecials = await this.prisma.menuDailySpecial.findMany({
      where: {
        weekday: now.weekday,
        isEnabled: true,
        deletedAt: null,
      },
      orderBy: [{ sortOrder: 'asc' }, { createdAt: 'asc' }],
    });
    const itemPriceMap = catalogItemPriceMap(catalogItems);
    const specials: DailySpecialDto[] = [];

    for (const special of rawDailySpecials) {
      if (!isDailySpecialActiveNow(special, now)) continue;
      const basePriceCents = itemPriceMap.get(special.itemStableId);
      if (basePriceCents === undefined) continue;

      specials.push({
        stableId: special.stableId,
        weekday: special.weekday,
        itemStableId: special.itemStableId,
        pricingMode: special.pricingMode,
        overridePriceCents: special.overridePriceCents ?? null,
        discountDeltaCents: special.discountDeltaCents ?? null,
        discountPercent: special.discountPercent ?? null,
        startDate: toIso(special.startDate),
        endDate: toIso(special.endDate),
        startMinutes: special.startMinutes ?? null,
        endMinutes: special.endMinutes ?? null,
        disallowCoupons: special.disallowCoupons,
        isEnabled: special.isEnabled,
        sortOrder: special.sortOrder,
        basePriceCents,
        effectivePriceCents: resolveEffectivePriceCents(
          basePriceCents,
          special,
        ),
      });
    }

    specials.sort((left, right) => left.sortOrder - right.sortOrder);
    return { specials };
  }

  async upsertDailySpecials(
    payload: DailySpecialUpsertPayload,
    catalogItems: readonly DailySpecialCatalogItemSnapshot[],
  ): Promise<void> {
    if (!payload || !Array.isArray(payload.specials)) {
      throw new BadRequestException('specials must be an array');
    }

    const normalized = payload.specials.map((raw) => {
      const weekday = Number(raw.weekday);
      if (!Number.isInteger(weekday) || weekday < 1 || weekday > 7) {
        throw new BadRequestException('weekday must be between 1 and 7');
      }
      const itemStableId = raw.itemStableId?.trim();
      if (!itemStableId) {
        throw new BadRequestException('itemStableId is required');
      }
      if (!SPECIAL_PRICING_MODES.includes(raw.pricingMode)) {
        throw new BadRequestException('pricingMode is invalid');
      }

      const parseMinutes = (value: number | null | undefined) => {
        if (value === null || value === undefined) return null;
        if (!Number.isFinite(value)) {
          throw new BadRequestException('minutes must be a number');
        }
        const minutes = Math.trunc(value);
        if (minutes < 0 || minutes > 24 * 60 - 1) {
          throw new BadRequestException('minutes must be between 0 and 1439');
        }
        return minutes;
      };

      return {
        stableId: raw.stableId?.trim() || null,
        weekday,
        itemStableId,
        pricingMode: raw.pricingMode,
        overridePriceCents:
          typeof raw.overridePriceCents === 'number'
            ? Math.trunc(raw.overridePriceCents)
            : null,
        discountDeltaCents:
          typeof raw.discountDeltaCents === 'number'
            ? Math.trunc(raw.discountDeltaCents)
            : null,
        discountPercent:
          typeof raw.discountPercent === 'number'
            ? Math.trunc(raw.discountPercent)
            : null,
        startDate: raw.startDate ? parseIsoOrNull(raw.startDate) : null,
        endDate: raw.endDate ? parseIsoOrNull(raw.endDate) : null,
        startMinutes: parseMinutes(raw.startMinutes),
        endMinutes: parseMinutes(raw.endMinutes),
        disallowCoupons:
          typeof raw.disallowCoupons === 'boolean' ? raw.disallowCoupons : true,
        isEnabled: typeof raw.isEnabled === 'boolean' ? raw.isEnabled : true,
        sortOrder:
          typeof raw.sortOrder === 'number' ? Math.trunc(raw.sortOrder) : 0,
      };
    });

    const duplicates = new Set<string>();
    const uniqueKeySet = new Set<string>();
    for (const special of normalized) {
      const key = `${special.weekday}:${special.itemStableId}`;
      if (uniqueKeySet.has(key)) duplicates.add(key);
      uniqueKeySet.add(key);
    }
    if (duplicates.size > 0) {
      throw new BadRequestException(
        'duplicate daily specials found for the same weekday and item',
      );
    }

    const itemPriceMap = catalogItemPriceMap(catalogItems);
    for (const special of normalized) {
      const basePriceCents = itemPriceMap.get(special.itemStableId);
      if (basePriceCents === undefined) {
        throw new BadRequestException(
          `Menu item not found: ${special.itemStableId}`,
        );
      }
      if (special.pricingMode === 'OVERRIDE_PRICE') {
        if (typeof special.overridePriceCents !== 'number') {
          throw new BadRequestException(
            'overridePriceCents is required for OVERRIDE_PRICE',
          );
        }
        if (special.overridePriceCents < 0) {
          throw new BadRequestException(
            'overridePriceCents must be non-negative',
          );
        }
      }
      if (special.pricingMode === 'DISCOUNT_DELTA') {
        if (typeof special.discountDeltaCents !== 'number') {
          throw new BadRequestException(
            'discountDeltaCents is required for DISCOUNT_DELTA',
          );
        }
        if (special.discountDeltaCents < 0) {
          throw new BadRequestException(
            'discountDeltaCents must be non-negative',
          );
        }
      }
      if (special.pricingMode === 'DISCOUNT_PERCENT') {
        if (
          typeof special.discountPercent !== 'number' ||
          special.discountPercent < 1 ||
          special.discountPercent > 100
        ) {
          throw new BadRequestException(
            'discountPercent must be between 1 and 100',
          );
        }
      }

      const effectivePriceCents = resolveEffectivePriceCents(
        basePriceCents,
        special,
      );
      if (effectivePriceCents > basePriceCents) {
        throw new BadRequestException(
          'daily special price cannot exceed base price',
        );
      }
    }

    const weekdays = Array.from(
      new Set(normalized.map((special) => special.weekday)),
    );

    await this.prisma.$transaction(async (tx) => {
      const existing = await tx.menuDailySpecial.findMany({
        where: { weekday: { in: weekdays }, deletedAt: null },
      });
      const existingByStableId = new Map(
        existing.map((special) => [special.stableId, special]),
      );
      const incomingStableIds = new Set(
        normalized
          .map((special) => special.stableId)
          .filter((stableId): stableId is string => Boolean(stableId)),
      );
      const toSoftDelete = existing.filter(
        (special) => !incomingStableIds.has(special.stableId),
      );
      if (toSoftDelete.length > 0) {
        await tx.menuDailySpecial.updateMany({
          where: {
            stableId: { in: toSoftDelete.map((special) => special.stableId) },
          },
          data: { deletedAt: new Date() },
        });
      }

      for (const special of normalized) {
        const data = {
          weekday: special.weekday,
          itemStableId: special.itemStableId,
          pricingMode: special.pricingMode,
          overridePriceCents: special.overridePriceCents,
          discountDeltaCents: special.discountDeltaCents,
          discountPercent: special.discountPercent,
          startDate: special.startDate,
          endDate: special.endDate,
          startMinutes: special.startMinutes,
          endMinutes: special.endMinutes,
          disallowCoupons: special.disallowCoupons,
          isEnabled: special.isEnabled,
          sortOrder: special.sortOrder,
          deletedAt: null,
        };
        if (special.stableId && existingByStableId.has(special.stableId)) {
          await tx.menuDailySpecial.update({
            where: { stableId: special.stableId },
            data,
          });
        } else {
          await tx.menuDailySpecial.create({
            data: {
              ...(special.stableId ? { stableId: special.stableId } : {}),
              ...data,
            },
          });
        }
      }
    });
  }
}
