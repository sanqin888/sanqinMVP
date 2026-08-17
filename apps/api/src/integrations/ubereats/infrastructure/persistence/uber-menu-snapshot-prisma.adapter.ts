import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../../../prisma/prisma.service';
import type {
  UberMenuPublishSnapshot,
  UberMenuSnapshotRepositoryPort,
} from '../../application/menu/uber-menu-publication.ports';
import { UberValidationError } from '../../application/shared/uber-application.error';
import { composeUberDisplayName } from '../../domain/menu/uber-menu-payload.builder';

const preferCanonicalStoreRows = <T extends { storeId: string }>(
  rows: T[],
  canonicalStoreId: string,
  keyOf: (row: T) => string,
): T[] => {
  const byKey = new Map<string, T>();
  for (const row of rows) {
    if (row.storeId !== canonicalStoreId) byKey.set(keyOf(row), row);
  }
  for (const row of rows) {
    if (row.storeId === canonicalStoreId) byKey.set(keyOf(row), row);
  }
  return Array.from(byKey.values());
};

/** Prisma rows are translated here; the application boundary only sees stable menu DTOs. */
@Injectable()
export class UberMenuSnapshotPrismaAdapter implements UberMenuSnapshotRepositoryPort {
  constructor(private readonly prisma: PrismaService) {}

  async loadPublishSnapshot(
    posStoreId: string,
    uberStoreId: string,
  ): Promise<UberMenuPublishSnapshot | null> {
    const storeId = posStoreId;
    const configStoreIds = Array.from(new Set([posStoreId, uberStoreId]));
    const [
      mapping,
      businessConfig,
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
          posExternalStoreId: posStoreId,
          isProvisioned: true,
        },
        select: { uberStoreId: true },
      }),
      this.prisma.businessConfig.findUnique({
        where: { id: 1 },
        select: { timezone: true, salesTaxRate: true },
      }),
      this.prisma.menuCategory.findMany({
        where: { deletedAt: null, isActive: true },
        select: { id: true, stableId: true, nameEn: true, nameZh: true },
      }),
      this.prisma.menuItem.findMany({
        where: {
          deletedAt: null,
          visibility: 'PUBLIC',
          publishToUberEats: true,
        },
        select: {
          stableId: true,
          categoryId: true,
          nameEn: true,
          nameZh: true,
          basePriceCents: true,
          isAvailable: true,
          imageUrl: true,
          ingredientsEn: true,
          optionGroups: {
            where: { isEnabled: true },
            select: { templateGroup: { select: { stableId: true } } },
          },
        },
      }),
      this.prisma.menuOptionGroupTemplate.findMany({
        where: { deletedAt: null, isAvailable: true },
        select: {
          stableId: true,
          nameEn: true,
          nameZh: true,
          defaultMinSelect: true,
          defaultMaxSelect: true,
          options: {
            where: { deletedAt: null },
            select: {
              stableId: true,
              nameEn: true,
              nameZh: true,
              priceDeltaCents: true,
              isAvailable: true,
            },
          },
        },
      }),
      this.prisma.uberItemChannelConfig.findMany({
        where: { storeId: { in: configStoreIds } },
        select: {
          storeId: true,
          menuItemStableId: true,
          priceCents: true,
          isAvailable: true,
          displayName: true,
          displayDescription: true,
        },
      }),
      this.prisma.uberOptionItemConfig.findMany({
        where: { storeId: { in: configStoreIds } },
        select: {
          storeId: true,
          optionChoiceStableId: true,
          priceDeltaCents: true,
          isAvailable: true,
          displayName: true,
        },
      }),
      this.prisma.uberModifierGroupConfig.findMany({
        where: { storeId: { in: configStoreIds } },
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
        where: { storeId: { in: configStoreIds } },
        select: {
          storeId: true,
          menuCategoryStableId: true,
          displayName: true,
        },
      }),
    ]);
    if (!mapping) return null;

    const timezone = businessConfig?.timezone?.trim();
    if (!timezone) {
      throw new UberValidationError({
        code: 'UBER_MENU_SCHEDULE_INVALID',
        message: '发布 Uber 菜单前必须配置门店时区。',
        operation: 'uber.menu.publish',
      });
    }
    const salesTaxRate = businessConfig?.salesTaxRate;
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

    const itemConfigs = preferCanonicalStoreRows(
      rawItemConfigs,
      posStoreId,
      (config) => config.menuItemStableId,
    );
    const optionConfigs = preferCanonicalStoreRows(
      rawOptionConfigs,
      posStoreId,
      (config) => config.optionChoiceStableId,
    );
    const groupConfigs = preferCanonicalStoreRows(
      rawGroupConfigs,
      posStoreId,
      (config) => config.templateGroupStableId,
    );
    const categoryConfigs = preferCanonicalStoreRows(
      rawCategoryConfigs,
      posStoreId,
      (config) => config.menuCategoryStableId,
    );
    const categoryById = new Map(
      categories.map((category) => [category.id, category]),
    );
    const itemConfig = new Map(
      itemConfigs.map((config) => [config.menuItemStableId, config]),
    );
    const optionConfig = new Map(
      optionConfigs.map((config) => [config.optionChoiceStableId, config]),
    );
    const groupConfig = new Map(
      groupConfigs.map((config) => [config.templateGroupStableId, config]),
    );
    const categoryConfig = new Map(
      categoryConfigs.map((config) => [config.menuCategoryStableId, config]),
    );
    const items = menuItems
      .filter((item) => categoryById.has(item.categoryId))
      .map((item) => {
        const config = itemConfig.get(item.stableId);
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
          isAvailable: config?.isAvailable ?? item.isAvailable,
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
          return {
            stableId: option.stableId,
            name:
              config?.displayName ||
              composeUberDisplayName(option.nameEn, option.nameZh) ||
              option.stableId,
            priceDeltaCents: config?.priceDeltaCents ?? option.priceDeltaCents,
            sourcePriceDeltaCents: option.priceDeltaCents,
            overridePriceDeltaCents: config?.priceDeltaCents ?? null,
            priceValueSource: config
              ? ('UBER_OVERRIDE' as const)
              : ('SANQ_SOURCE' as const),
            isAvailable: config?.isAvailable ?? option.isAvailable,
            childGroupStableIds: [],
          };
        }),
      ),
    };
  }
}
