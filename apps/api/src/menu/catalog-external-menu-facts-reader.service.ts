import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import type {
  CatalogExternalMenuFactsReaderPort,
  CatalogExternalMenuSourceFacts,
} from './catalog-external-menu-facts-reader.contract';

const toIso = (value: Date | null): string | null =>
  value ? value.toISOString() : null;

@Injectable()
export class CatalogExternalMenuFactsReaderService
  implements CatalogExternalMenuFactsReaderPort
{
  constructor(private readonly prisma: PrismaService) {}

  async readMenuSource(): Promise<CatalogExternalMenuSourceFacts> {
    const [categories, items, modifierGroups] = await Promise.all([
      this.prisma.menuCategory.findMany({
        where: { deletedAt: null },
        orderBy: [{ sortOrder: 'asc' }, { id: 'asc' }],
        select: {
          stableId: true,
          nameEn: true,
          nameZh: true,
          sortOrder: true,
          isActive: true,
        },
      }),
      this.prisma.menuItem.findMany({
        where: { deletedAt: null },
        orderBy: [{ sortOrder: 'asc' }, { id: 'asc' }],
        select: {
          stableId: true,
          category: { select: { stableId: true } },
          nameEn: true,
          nameZh: true,
          basePriceCents: true,
          isAvailable: true,
          tempUnavailableUntil: true,
          visibility: true,
          publishToUberEats: true,
          sortOrder: true,
          imageUrl: true,
          ingredientsEn: true,
          optionGroups: {
            orderBy: [{ sortOrder: 'asc' }, { id: 'asc' }],
            select: {
              sortOrder: true,
              isEnabled: true,
              templateGroup: { select: { stableId: true } },
            },
          },
        },
      }),
      this.prisma.menuOptionGroupTemplate.findMany({
        where: { deletedAt: null },
        orderBy: [{ sortOrder: 'asc' }, { id: 'asc' }],
        select: {
          stableId: true,
          nameEn: true,
          nameZh: true,
          defaultMinSelect: true,
          defaultMaxSelect: true,
          isAvailable: true,
          sortOrder: true,
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
              sortOrder: true,
              targetItemStableId: true,
              childLinks: {
                select: {
                  childOption: {
                    select: {
                      templateGroup: { select: { stableId: true } },
                    },
                  },
                },
              },
            },
          },
        },
      }),
    ]);

    return {
      categories: categories.map((category) => ({
        stableId: category.stableId,
        nameEn: category.nameEn,
        nameZh: category.nameZh ?? null,
        sortOrder: category.sortOrder,
        isActive: category.isActive,
      })),
      items: items.map((item) => ({
        stableId: item.stableId,
        categoryStableId: item.category.stableId,
        nameEn: item.nameEn,
        nameZh: item.nameZh ?? null,
        basePriceCents: item.basePriceCents,
        isAvailable: item.isAvailable,
        tempUnavailableUntil: toIso(item.tempUnavailableUntil),
        visibility: item.visibility,
        publishToUberEats: item.publishToUberEats,
        sortOrder: item.sortOrder,
        imageUrl: item.imageUrl ?? null,
        ingredientsEn: item.ingredientsEn ?? null,
        optionGroups: item.optionGroups.map((binding) => ({
          templateGroupStableId: binding.templateGroup.stableId,
          sortOrder: binding.sortOrder,
          isEnabled: binding.isEnabled,
        })),
      })),
      modifierGroups: modifierGroups.map((group) => ({
        stableId: group.stableId,
        nameEn: group.nameEn,
        nameZh: group.nameZh ?? null,
        defaultMinSelect: group.defaultMinSelect,
        defaultMaxSelect: group.defaultMaxSelect ?? null,
        isAvailable: group.isAvailable,
        sortOrder: group.sortOrder,
        options: group.options.map((option) => ({
          stableId: option.stableId,
          nameEn: option.nameEn,
          nameZh: option.nameZh ?? null,
          priceDeltaCents: option.priceDeltaCents,
          isAvailable: option.isAvailable,
          tempUnavailableUntil: toIso(option.tempUnavailableUntil),
          sortOrder: option.sortOrder,
          targetItemStableId: option.targetItemStableId?.trim() || null,
          childTemplateGroupStableIds: option.childLinks.map(
            (link) => link.childOption.templateGroup.stableId,
          ),
        })),
      })),
    };
  }

  async getMenuItemSource(stableId: string) {
    const normalized = stableId.trim();
    if (!normalized) return null;
    return this.prisma.menuItem.findUnique({
      where: { stableId: normalized },
      select: { stableId: true, basePriceCents: true, isAvailable: true },
    });
  }

  async getOptionSource(stableId: string) {
    const normalized = stableId.trim();
    if (!normalized) return null;
    return this.prisma.menuOptionTemplateChoice.findUnique({
      where: { stableId: normalized },
      select: { stableId: true, priceDeltaCents: true, isAvailable: true },
    });
  }

  async getModifierGroupSource(stableId: string) {
    const normalized = stableId.trim();
    if (!normalized) return null;
    return this.prisma.menuOptionGroupTemplate.findUnique({
      where: { stableId: normalized },
      select: {
        stableId: true,
        nameEn: true,
        defaultMinSelect: true,
        defaultMaxSelect: true,
      },
    });
  }

  async listOrderModifierSnapshotSources() {
    const rows = await this.prisma.menuOptionTemplateChoice.findMany({
      where: {
        deletedAt: null,
        templateGroup: { deletedAt: null },
      },
      select: {
        stableId: true,
        targetItemStableId: true,
        nameEn: true,
        nameZh: true,
        templateGroup: {
          select: {
            stableId: true,
            nameEn: true,
            nameZh: true,
          },
        },
      },
    });

    return rows.map((row) => ({
      stableId: row.stableId,
      templateGroupStableId: row.templateGroup.stableId,
      targetItemStableId: row.targetItemStableId?.trim() || null,
      nameEn: row.nameEn,
      nameZh: row.nameZh ?? null,
      templateNameEn: row.templateGroup.nameEn,
      templateNameZh: row.templateGroup.nameZh ?? null,
    }));
  }
}
