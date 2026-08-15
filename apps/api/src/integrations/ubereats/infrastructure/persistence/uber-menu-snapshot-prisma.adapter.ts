import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../../../prisma/prisma.service';
import type {
  UberMenuPublishSnapshot,
  UberMenuSnapshotRepositoryPort,
} from '../../application/menu/uber-menu-publication.ports';

/** Prisma rows are translated here; the application boundary only sees stable menu DTOs. */
@Injectable()
export class UberMenuSnapshotPrismaAdapter implements UberMenuSnapshotRepositoryPort {
  constructor(private readonly prisma: PrismaService) {}

  async loadPublishSnapshot(
    posStoreId: string,
    uberStoreId: string,
  ): Promise<UberMenuPublishSnapshot | null> {
    const storeId = posStoreId;
    const [
      mapping,
      categories,
      menuItems,
      templates,
      itemConfigs,
      optionConfigs,
      groupConfigs,
    ] = await Promise.all([
      this.prisma.uberStoreMapping.findFirst({
        where: {
          uberStoreId,
          posExternalStoreId: posStoreId,
          isProvisioned: true,
        },
        select: { uberStoreId: true },
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
        where: { storeId },
        select: {
          menuItemStableId: true,
          priceCents: true,
          isAvailable: true,
          displayName: true,
          displayDescription: true,
        },
      }),
      this.prisma.uberOptionItemConfig.findMany({
        where: { storeId },
        select: {
          optionChoiceStableId: true,
          priceDeltaCents: true,
          isAvailable: true,
          displayName: true,
        },
      }),
      this.prisma.uberModifierGroupConfig.findMany({
        where: { storeId },
        select: {
          templateGroupStableId: true,
          displayName: true,
          minSelect: true,
          maxSelect: true,
          isActive: true,
        },
      }),
    ]);
    if (!mapping) return null;
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
    const items = menuItems
      .filter((item) => categoryById.has(item.categoryId))
      .map((item) => {
        const config = itemConfig.get(item.stableId);
        return {
          stableId: item.stableId,
          categoryStableId: categoryById.get(item.categoryId)!.stableId,
          name:
            config?.displayName || item.nameEn || item.nameZh || item.stableId,
          description: config?.displayDescription ?? item.ingredientsEn ?? null,
          priceCents: config?.priceCents ?? item.basePriceCents,
          sourcePriceCents: item.basePriceCents,
          overridePriceCents: config?.priceCents ?? null,
          priceValueSource: config
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
      timezone: process.env.UBER_MENU_TIMEZONE || 'America/Los_Angeles',
      taxRate: Number(process.env.UBER_MENU_TAX_RATE_PERCENTAGE || 0),
      categories: categories
        .map((category) => ({
          stableId: category.stableId,
          name: category.nameEn || category.nameZh || category.stableId,
          itemStableIds: items
            .filter((item) => item.categoryStableId === category.stableId)
            .map((item) => item.stableId),
        }))
        .filter((category) => category.itemStableIds.length),
      items,
      modifierGroups: activeTemplates.map((template) => {
        const config = groupConfig.get(template.stableId);
        return {
          stableId: template.stableId,
          name:
            config?.displayName ||
            template.nameEn ||
            template.nameZh ||
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
              option.nameEn ||
              option.nameZh ||
              option.stableId,
            priceDeltaCents: config?.priceDeltaCents ?? option.priceDeltaCents,
            isAvailable: config?.isAvailable ?? option.isAvailable,
            childGroupStableIds: [],
          };
        }),
      ),
    };
  }
}
