import { Inject, Injectable } from '@nestjs/common';
import { PrismaService } from '../../../../prisma/prisma.service';
import {
  UBER_STORE_CONFIG_QUERY,
  type UberStoreConfigQueryPort,
} from '../../application/shared/uber-store-config.port';
import type {
  UberMenuPublishSnapshot,
  UberMenuSnapshotRepositoryPort,
} from '../../application/menu/uber-menu-publication.ports';
import { UberValidationError } from '../../application/shared/uber-application.error';
import { composeUberDisplayName } from '../../domain/menu/uber-menu-payload.builder';
import {
  readUberPreparationType,
  resolveUberMenuAvailability,
} from '../../domain/menu/uber-menu.types';

/** Prisma rows are translated here; the application boundary only sees stable menu DTOs. */
@Injectable()
export class UberMenuSnapshotPrismaAdapter implements UberMenuSnapshotRepositoryPort {
  constructor(
    private readonly prisma: PrismaService,
    @Inject(UBER_STORE_CONFIG_QUERY)
    private readonly storeConfig: UberStoreConfigQueryPort,
  ) {}

  async loadPublishSnapshot(
    storeStableId: string,
    uberStoreId: string,
  ): Promise<UberMenuPublishSnapshot | null> {
    const storeId = storeStableId;
    const [
      mapping,
      storeConfig,
      categories,
      menuItems,
      templates,
      rawItemConfigs,
      rawOptionConfigs,
      rawGroupConfigs,
      rawCategoryConfigs,
    ] = await Promise.all([
      this.prisma.uberStoreMapping.findFirst({
        where: {
          uberStoreId,
          posExternalStoreId: storeStableId,
          isProvisioned: true,
        },
        select: { uberStoreId: true },
      }),
      this.storeConfig.getStoreConfig(storeStableId),
      this.prisma.menuCategory.findMany({
        where: { deletedAt: null, isActive: true },
        orderBy: [{ sortOrder: 'asc' }, { id: 'asc' }],
        select: { id: true, stableId: true, nameEn: true, nameZh: true },
      }),
      this.prisma.menuItem.findMany({
        where: {
          deletedAt: null,
          visibility: 'PUBLIC',
          publishToUberEats: true,
        },
        orderBy: [{ sortOrder: 'asc' }, { id: 'asc' }],
        select: {
          stableId: true,
          categoryId: true,
          nameEn: true,
          nameZh: true,
          basePriceCents: true,
          isAvailable: true,
          tempUnavailableUntil: true,
          imageUrl: true,
          ingredientsEn: true,
          optionGroups: {
            where: { isEnabled: true },
            orderBy: [{ sortOrder: 'asc' }, { id: 'asc' }],
            select: { templateGroup: { select: { stableId: true } } },
          },
        },
      }),
      this.prisma.menuOptionGroupTemplate.findMany({
        where: { deletedAt: null, isAvailable: true },
        orderBy: [{ sortOrder: 'asc' }, { id: 'asc' }],
        select: {
          stableId: true,
          nameEn: true,
          nameZh: true,
          defaultMinSelect: true,
          defaultMaxSelect: true,
          options: {
            where: { deletedAt: null },
            orderBy: [{ sortOrder: 'asc' }, { id: 'asc' }],
            select: {
              stableId: true,
              nameEn: true,
              nameZh: true,
              priceDeltaCents: true,
              isAvailable: true,
              tempUnavailableUntil: true,
            },
          },
        },
      }),
      this.prisma.uberItemChannelConfig.findMany({
        where: { storeId: storeStableId },
        select: {
          storeId: true,
          menuItemStableId: true,
          priceCents: true,
          isAvailable: true,
          displayName: true,
          displayDescription: true,
          preparationType: true,
        },
      }),
      this.prisma.uberOptionItemConfig.findMany({
        where: { storeId: storeStableId },
        select: {
          storeId: true,
          optionChoiceStableId: true,
          priceDeltaCents: true,
          isAvailable: true,
          displayName: true,
          preparationType: true,
        },
      }),
      this.prisma.uberModifierGroupConfig.findMany({
        where: { storeId: storeStableId },
        select: {
          storeId: true,
          templateGroupStableId: true,
          displayName: true,
          minSelect: true,
          maxSelect: true,
          isActive: true,
        },
      }),
      this.prisma.uberCategoryConfig.findMany({
        where: { storeId: storeStableId },
        select: {
          storeId: true,
          menuCategoryStableId: true,
          displayName: true,
        },
      }),
    ]);
    if (!mapping) return null;

    const timezone = storeConfig.timezone.trim();
    if (!timezone) {
      throw new UberValidationError({
        code: 'UBER_MENU_SCHEDULE_INVALID',
        message: '发布 Uber 菜单前必须配置门店时区。',
        operation: 'uber.menu.publish',
      });
    }
    const salesTaxRate = storeConfig.salesTaxRate;
    if (
      typeof salesTaxRate !== 'number' ||
      !Number.isFinite(salesTaxRate) ||
      salesTaxRate < 0 ||
      salesTaxRate > 1
    ) {
      throw new UberValidationError({
        code: 'UBER_TAX_RATE_INVALID',
        message:
          'salesTaxRate 必须使用 0～1 的比例格式，例如 13% 应保存为 0.13',
        operation: 'uber.menu.publish',
      });
    }
    const taxRate = Number((salesTaxRate * 100).toFixed(4));
    const itemConfig = new Map(
      rawItemConfigs.map(
        (config) => [config.menuItemStableId, config] as const,
      ),
    );
    const optionConfig = new Map(
      rawOptionConfigs.map(
        (config) => [config.optionChoiceStableId, config] as const,
      ),
    );
    const groupConfig = new Map(
      rawGroupConfigs.map(
        (config) => [config.templateGroupStableId, config] as const,
      ),
    );
    const categoryConfig = new Map(
      rawCategoryConfigs.map(
        (config) => [config.menuCategoryStableId, config] as const,
      ),
    );
    const categoryById = new Map(
      categories.map((category) => [category.id, category]),
    );
    const items = menuItems
      .filter((item) => categoryById.has(item.categoryId))
      .map((item) => {
        const config = itemConfig.get(item.stableId);
        const availability = resolveUberMenuAvailability({
          sourceIsAvailable: item.isAvailable,
          tempUnavailableUntil: item.tempUnavailableUntil,
          channelIsAvailable: config?.isAvailable,
        });
        return {
          stableId: item.stableId,
          categoryStableId: categoryById.get(item.categoryId)!.stableId,
          name:
            config?.displayName ||
            composeUberDisplayName(item.nameEn, item.nameZh) ||
            item.stableId,
          description: config?.displayDescription ?? item.ingredientsEn ?? null,
          priceCents: config?.priceCents ?? item.basePriceCents,
          sourcePriceCents: item.basePriceCents,
          overridePriceCents: config?.priceCents ?? null,
          priceValueSource:
            config?.priceCents != null
              ? ('UBER_OVERRIDE' as const)
              : ('SANQ_SOURCE' as const),
          imageUrl: item.imageUrl,
          isAvailable: availability.isAvailable,
          suspendUntilEpochSeconds: availability.suspendUntilEpochSeconds,
          preparationType: readUberPreparationType(config?.preparationType),
          modifierGroupStableIds: item.optionGroups.map(
            (group) => group.templateGroup.stableId,
          ),
        };
      });
    const activeTemplates = templates.filter(
      (template) => groupConfig.get(template.stableId)?.isActive !== false,
    );
    return {
      storeId,
      uberStoreId: mapping.uberStoreId,
      timezone,
      taxRate,
      categories: categories
        .map((category) => {
          const config = categoryConfig.get(category.stableId);
          return {
            stableId: category.stableId,
            name:
              config?.displayName ||
              composeUberDisplayName(category.nameEn, category.nameZh) ||
              category.stableId,
            itemStableIds: items
              .filter((item) => item.categoryStableId === category.stableId)
              .map((item) => item.stableId),
          };
        })
        .filter((category) => category.itemStableIds.length),
      items,
      modifierGroups: activeTemplates.map((template) => {
        const config = groupConfig.get(template.stableId);
        return {
          stableId: template.stableId,
          name:
            config?.displayName ||
            composeUberDisplayName(template.nameEn, template.nameZh) ||
            template.stableId,
          minSelect: config?.minSelect ?? template.defaultMinSelect,
          maxSelect:
            config?.maxSelect ??
            template.defaultMaxSelect ??
            template.options.length,
          optionStableIds: template.options.map((option) => option.stableId),
        };
      }),
      modifierOptions: activeTemplates.flatMap((template) =>
        template.options.map((option) => {
          const config = optionConfig.get(option.stableId);
          const availability = resolveUberMenuAvailability({
            sourceIsAvailable: option.isAvailable,
            tempUnavailableUntil: option.tempUnavailableUntil,
            channelIsAvailable: config?.isAvailable,
          });
          return {
            stableId: option.stableId,
            name:
              config?.displayName ||
              composeUberDisplayName(option.nameEn, option.nameZh) ||
              option.stableId,
            priceDeltaCents: config?.priceDeltaCents ?? option.priceDeltaCents,
            sourcePriceDeltaCents: option.priceDeltaCents,
            overridePriceDeltaCents: config?.priceDeltaCents ?? null,
            priceValueSource:
              config?.priceDeltaCents != null
                ? ('UBER_OVERRIDE' as const)
                : ('SANQ_SOURCE' as const),
            isAvailable: availability.isAvailable,
            suspendUntilEpochSeconds: availability.suspendUntilEpochSeconds,
            preparationType: readUberPreparationType(config?.preparationType),
            childGroupStableIds: [],
          };
        }),
      ),
    };
  }
}
