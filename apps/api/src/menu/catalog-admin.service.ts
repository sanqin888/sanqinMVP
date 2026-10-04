import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import type { Prisma } from '@prisma/client';
import {
  isAvailableNow,
  MenuCategoryBaseDto,
  MenuItemWithBindingsDto,
  MenuPackagingTypeDto,
  TemplateGroupFullDto,
} from '@shared/menu';

import { PrismaService } from '../prisma/prisma.service';
import type {
  CatalogAvailabilityReaderPort,
  CatalogMenuItemAvailabilitySnapshot,
  CatalogOptionAvailabilitySnapshot,
} from './catalog-availability-reader.contract';
import type {
  CatalogExternalMenuFactsReaderPort,
  CatalogExternalMenuSourceFacts,
} from './catalog-external-menu-facts-reader.contract';
import type {
  CatalogOrderFactsReaderPort,
  CatalogOrderItemMaterializationFact,
  CatalogOrderLabelConfigFact,
} from './catalog-order-facts-reader.contract';
import type {
  CatalogMarketingItemSubjectV1,
  CatalogMarketingSubjectReaderPort,
} from './catalog-marketing-subject-reader.contract';
import type {
  CatalogReportingItemClassificationReaderPort,
  CatalogReportingItemClassificationV1,
} from './catalog-reporting-item-classification-reader.contract';
import {
  captureCatalogAvailabilityTransition,
  initializeCatalogAvailabilityHistory,
  isCatalogItemUnavailableAt,
} from './catalog-availability-history.persistence';

export type CatalogAvailabilityMode = 'ON' | 'PERMANENT_OFF' | 'TEMP_TODAY_OFF';

export type CatalogAvailabilityMutationTiming = {
  effectiveAt: Date;
  tempUnavailableUntil: Date | null;
};

const orderItemMaterializationSelect = {
  stableId: true,
  nameEn: true,
  nameZh: true,
  basePriceCents: true,
  isAvailable: true,
  tempUnavailableUntil: true,
  fixedComponents: {
    orderBy: { sortOrder: 'asc' as const },
    select: {
      componentItemStableId: true,
      quantity: true,
      sortOrder: true,
    },
  },
  optionGroups: {
    where: { isEnabled: true },
    select: {
      minSelect: true,
      maxSelect: true,
      sortOrder: true,
      templateGroup: {
        select: {
          stableId: true,
          nameEn: true,
          nameZh: true,
          defaultMinSelect: true,
          defaultMaxSelect: true,
          sortOrder: true,
          deletedAt: true,
          options: {
            where: { deletedAt: null },
            select: {
              stableId: true,
              nameEn: true,
              nameZh: true,
              priceDeltaCents: true,
              targetItemStableId: true,
              isAvailable: true,
              tempUnavailableUntil: true,
              sortOrder: true,
            },
          },
        },
      },
    },
  },
} satisfies Prisma.MenuItemSelect;

type OrderItemMaterializationRow = Prisma.MenuItemGetPayload<{
  select: typeof orderItemMaterializationSelect;
}>;

export type CatalogAdminMenuItemDto = MenuItemWithBindingsDto;

function toIso(value: Date | null | undefined): string | null {
  return value ? value.toISOString() : null;
}

function availabilityFromDb(
  isAvailable: boolean,
  tempUnavailableUntil: Date | null,
) {
  return {
    isAvailable,
    tempUnavailableUntil: tempUnavailableUntil
      ? tempUnavailableUntil.toISOString()
      : null,
  };
}

function requireStoreStableId(storeStableId: string): string {
  const normalized = storeStableId?.trim();
  if (!normalized) throw new BadRequestException('storeStableId is required');
  return normalized;
}

@Injectable()
export class CatalogAdminService
  implements
    CatalogAvailabilityReaderPort,
    CatalogExternalMenuFactsReaderPort,
    CatalogOrderFactsReaderPort,
    CatalogMarketingSubjectReaderPort,
    CatalogReportingItemClassificationReaderPort
{
  constructor(private readonly prisma: PrismaService) {}

  async getMenuItemAvailabilitySnapshot(
    storeStableId: string,
    menuItemStableId: string,
  ): Promise<CatalogMenuItemAvailabilitySnapshot | null> {
    const storeId = requireStoreStableId(storeStableId);
    const stableId = menuItemStableId.trim();
    if (!stableId) return null;

    const item = await this.prisma.menuItem.findFirst({
      where: {
        stableId,
        deletedAt: null,
        category: { storeStableId: storeId, deletedAt: null },
      },
      select: {
        stableId: true,
        visibility: true,
        publishToUberEats: true,
        tempUnavailableUntil: true,
        fixedComponents: { select: { id: true } },
      },
    });
    if (!item) return null;

    return {
      stableId: item.stableId,
      visibility: item.visibility,
      publishToUberEats: item.publishToUberEats,
      tempUnavailableUntil: toIso(item.tempUnavailableUntil),
      hasFixedComponents: item.fixedComponents.length > 0,
    };
  }

  async getOptionAvailabilitySnapshot(
    storeStableId: string,
    optionChoiceStableId: string,
  ): Promise<CatalogOptionAvailabilitySnapshot | null> {
    const storeId = requireStoreStableId(storeStableId);
    const stableId = optionChoiceStableId.trim();
    if (!stableId) return null;

    const option = await this.prisma.menuOptionTemplateChoice.findFirst({
      where: {
        stableId,
        deletedAt: null,
        templateGroup: { storeStableId: storeId, deletedAt: null },
      },
      select: { stableId: true, tempUnavailableUntil: true },
    });
    if (!option) return null;

    return {
      stableId: option.stableId,
      tempUnavailableUntil: toIso(option.tempUnavailableUntil),
    };
  }

  async readMenuSource(
    storeStableId: string,
  ): Promise<CatalogExternalMenuSourceFacts> {
    const storeId = requireStoreStableId(storeStableId);
    const [categories, items, modifierGroups] = await Promise.all([
      this.prisma.menuCategory.findMany({
        where: { storeStableId: storeId, deletedAt: null },
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
        where: {
          deletedAt: null,
          category: { storeStableId: storeId, deletedAt: null },
        },
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
        where: { storeStableId: storeId, deletedAt: null },
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

  async getMenuItemSource(storeStableId: string, stableId: string) {
    const storeId = requireStoreStableId(storeStableId);
    const normalized = stableId.trim();
    if (!normalized) return null;
    return this.prisma.menuItem.findFirst({
      where: {
        stableId: normalized,
        category: { storeStableId: storeId, deletedAt: null },
      },
      select: { stableId: true, basePriceCents: true, isAvailable: true },
    });
  }

  async getOptionSource(storeStableId: string, stableId: string) {
    const storeId = requireStoreStableId(storeStableId);
    const normalized = stableId.trim();
    if (!normalized) return null;
    return this.prisma.menuOptionTemplateChoice.findFirst({
      where: {
        stableId: normalized,
        templateGroup: { storeStableId: storeId, deletedAt: null },
      },
      select: { stableId: true, priceDeltaCents: true, isAvailable: true },
    });
  }

  async getModifierGroupSource(storeStableId: string, stableId: string) {
    const storeId = requireStoreStableId(storeStableId);
    const normalized = stableId.trim();
    if (!normalized) return null;
    return this.prisma.menuOptionGroupTemplate.findFirst({
      where: { stableId: normalized, storeStableId: storeId },
      select: {
        stableId: true,
        nameEn: true,
        defaultMinSelect: true,
        defaultMaxSelect: true,
      },
    });
  }

  async listOrderModifierSnapshotSources(storeStableId: string) {
    const storeId = requireStoreStableId(storeStableId);
    const rows = await this.prisma.menuOptionTemplateChoice.findMany({
      where: {
        deletedAt: null,
        templateGroup: { storeStableId: storeId, deletedAt: null },
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

  async findHiddenMenuItemStableIds(
    storeStableId: string,
    menuItemStableIds: string[],
  ): Promise<string[]> {
    const storeId = requireStoreStableId(storeStableId);
    const stableIds = menuItemStableIds
      .map((value) => value.trim())
      .filter(Boolean);
    if (stableIds.length === 0) return [];

    const items = await this.prisma.menuItem.findMany({
      where: {
        stableId: { in: stableIds },
        deletedAt: null,
        visibility: 'HIDDEN',
        category: { storeStableId: storeId, deletedAt: null },
      },
      select: { stableId: true },
    });
    return items.map((item) => item.stableId);
  }

  async getOrderItemMaterializationFacts(
    storeStableId: string,
    menuItemStableIds: string[],
  ): Promise<CatalogOrderItemMaterializationFact[]> {
    const storeId = requireStoreStableId(storeStableId);
    const stableIds = menuItemStableIds
      .map((value) => value.trim())
      .filter(Boolean);
    if (stableIds.length === 0) return [];

    const items = await this.prisma.menuItem.findMany({
      where: {
        stableId: { in: stableIds },
        category: { storeStableId: storeId, deletedAt: null },
      },
      select: orderItemMaterializationSelect,
    });
    return items.map((item) => this.toOrderItemMaterializationFact(item));
  }

  async getActiveOrderItemMaterializationFact(
    storeStableId: string,
    menuItemStableId: string,
  ): Promise<CatalogOrderItemMaterializationFact | null> {
    const storeId = requireStoreStableId(storeStableId);
    const stableId = menuItemStableId.trim();
    if (!stableId) return null;

    const item = await this.prisma.menuItem.findFirst({
      where: {
        stableId,
        deletedAt: null,
        category: { storeStableId: storeId, deletedAt: null },
      },
      select: orderItemMaterializationSelect,
    });
    return item ? this.toOrderItemMaterializationFact(item) : null;
  }

  async getOrderLabelConfigs(
    storeStableId: string,
    menuItemStableIds: string[],
  ): Promise<CatalogOrderLabelConfigFact[]> {
    const storeId = requireStoreStableId(storeStableId);
    const stableIds = menuItemStableIds
      .map((value) => value.trim())
      .filter(Boolean);
    if (stableIds.length === 0) return [];

    const configs = await this.prisma.menuItem.findMany({
      where: {
        stableId: { in: stableIds },
        deletedAt: null,
        category: { storeStableId: storeId, deletedAt: null },
      },
      select: {
        stableId: true,
        nameEn: true,
        nameZh: true,
        labelStrategy: true,
        packagings: {
          orderBy: { sortOrder: 'asc' },
          select: {
            sortOrder: true,
            packagingType: {
              select: { stableId: true, name: true },
            },
          },
        },
        optionGroups: {
          where: { isEnabled: true },
          select: {
            affectedPackagingTypeStableIds: true,
            templateGroup: { select: { stableId: true } },
          },
        },
      },
    });

    return configs.map((config) => ({
      stableId: config.stableId,
      nameEn: config.nameEn,
      nameZh: config.nameZh,
      labelStrategy: config.labelStrategy,
      packagings: config.packagings.map((packaging) => ({
        sortOrder: packaging.sortOrder,
        packagingType: {
          stableId: packaging.packagingType.stableId,
          name: packaging.packagingType.name,
        },
      })),
      optionGroups: config.optionGroups.map((binding) => ({
        affectedPackagingTypeStableIds: binding.affectedPackagingTypeStableIds,
        templateGroupStableId: binding.templateGroup.stableId,
      })),
    }));
  }

  private toOrderItemMaterializationFact(
    item: OrderItemMaterializationRow,
  ): CatalogOrderItemMaterializationFact {
    return {
      stableId: item.stableId,
      nameEn: item.nameEn,
      nameZh: item.nameZh,
      basePriceCents: item.basePriceCents,
      isAvailable: item.isAvailable,
      tempUnavailableUntil: toIso(item.tempUnavailableUntil),
      fixedComponents: item.fixedComponents.map((component) => ({
        componentItemStableId: component.componentItemStableId,
        quantity: component.quantity,
        sortOrder: component.sortOrder,
      })),
      optionGroups: item.optionGroups.flatMap((binding) => {
        const templateGroup = binding.templateGroup;
        if (templateGroup.deletedAt) return [];
        return [
          {
            minSelect: binding.minSelect,
            maxSelect: binding.maxSelect,
            sortOrder: binding.sortOrder,
            templateGroup: {
              stableId: templateGroup.stableId,
              nameEn: templateGroup.nameEn,
              nameZh: templateGroup.nameZh,
              defaultMinSelect: templateGroup.defaultMinSelect,
              defaultMaxSelect: templateGroup.defaultMaxSelect,
              sortOrder: templateGroup.sortOrder,
              options: templateGroup.options.map((choice) => ({
                stableId: choice.stableId,
                nameEn: choice.nameEn,
                nameZh: choice.nameZh,
                priceDeltaCents: choice.priceDeltaCents,
                targetItemStableId: choice.targetItemStableId,
                isAvailable: choice.isAvailable,
                tempUnavailableUntil: toIso(choice.tempUnavailableUntil),
                sortOrder: choice.sortOrder,
              })),
            },
          },
        ];
      }),
    };
  }

  async updateCategory(
    storeStableId: string,
    categoryStableId: string,
    body: {
      nameEn?: string;
      nameZh?: string | null;
      sortOrder?: number;
      isActive?: boolean;
    },
  ): Promise<{
    stableId: string;
    nameEn: string;
    nameZh: string | null;
    sortOrder: number;
    isActive: boolean;
  }> {
    const storeId = requireStoreStableId(storeStableId);
    const existingCategory = await this.prisma.menuCategory.findFirst({
      where: {
        stableId: categoryStableId.trim(),
        storeStableId: storeId,
        deletedAt: null,
      },
      select: { id: true },
    });
    if (!existingCategory) {
      throw new NotFoundException('Menu category not found');
    }

    const data: Prisma.MenuCategoryUpdateInput = {};

    if (typeof body.nameEn === 'string') {
      const nameEn = body.nameEn.trim();
      if (!nameEn) throw new BadRequestException('nameEn is required');
      data.nameEn = nameEn;
    }

    if (body.nameZh !== undefined) {
      const nameZh = body.nameZh?.trim() ?? '';
      data.nameZh = nameZh ? nameZh : null;
    }

    if (body.sortOrder !== undefined) {
      if (!Number.isFinite(body.sortOrder)) {
        throw new BadRequestException('sortOrder must be a number');
      }
      data.sortOrder = Math.max(0, Math.trunc(body.sortOrder));
    }

    if (typeof body.isActive === 'boolean') {
      data.isActive = body.isActive;
    }

    if (Object.keys(data).length === 0) {
      throw new BadRequestException('No fields to update');
    }

    try {
      const updated = await this.prisma.menuCategory.update({
        where: { id: existingCategory.id },
        data,
        select: {
          stableId: true,
          nameEn: true,
          nameZh: true,
          sortOrder: true,
          isActive: true,
        },
      });

      return {
        stableId: updated.stableId,
        nameEn: updated.nameEn,
        nameZh: updated.nameZh,
        sortOrder: updated.sortOrder,
        isActive: updated.isActive,
      };
    } catch {
      throw new NotFoundException('Menu category not found');
    }
  }

  async listCategories(storeStableId: string): Promise<MenuCategoryBaseDto[]> {
    const storeId = requireStoreStableId(storeStableId);
    const categories = await this.prisma.menuCategory.findMany({
      where: { storeStableId: storeId, deletedAt: null },
      orderBy: { sortOrder: 'asc' },
      select: {
        stableId: true,
        nameEn: true,
        nameZh: true,
        sortOrder: true,
        isActive: true,
      },
    });

    return categories.map((category) => ({
      stableId: category.stableId,
      nameEn: category.nameEn,
      nameZh: category.nameZh ?? null,
      sortOrder: category.sortOrder,
      isActive: category.isActive,
    }));
  }

  async listItems(storeStableId: string): Promise<CatalogAdminMenuItemDto[]> {
    const storeId = requireStoreStableId(storeStableId);
    const items = await this.prisma.menuItem.findMany({
      where: {
        deletedAt: null,
        category: { storeStableId: storeId, deletedAt: null },
      },
      orderBy: { sortOrder: 'asc' },
      include: {
        category: { select: { stableId: true } },
        packagings: {
          orderBy: { sortOrder: 'asc' },
          include: { packagingType: true },
        },
        fixedComponents: {
          orderBy: { sortOrder: 'asc' },
        },
        optionGroups: {
          where: { templateGroup: { deletedAt: null } },
          orderBy: { sortOrder: 'asc' },
          include: {
            templateGroup: {
              select: {
                stableId: true,
                nameEn: true,
                nameZh: true,
                deletedAt: true,
                defaultMinSelect: true,
                defaultMaxSelect: true,
                isAvailable: true,
                tempUnavailableUntil: true,
                sortOrder: true,
              },
            },
          },
        },
      },
    });

    return items.map((item) => ({
      stableId: item.stableId,
      categoryStableId: item.category.stableId,
      nameEn: item.nameEn,
      nameZh: item.nameZh ?? null,
      basePriceCents: item.basePriceCents,
      isAvailable: item.isAvailable,
      visibility: item.visibility,
      isVisibleOnMainMenu: item.isVisibleOnMainMenu,
      publishToUberEats: item.publishToUberEats,
      labelStrategy: item.labelStrategy,
      itemKind: item.itemKind,
      packagings: item.packagings.map((packaging) => ({
        sortOrder: packaging.sortOrder,
        packagingType: {
          stableId: packaging.packagingType.stableId,
          name: packaging.packagingType.name,
          isActive: packaging.packagingType.isActive,
          sortOrder: packaging.packagingType.sortOrder,
        },
      })),
      fixedComponents: item.fixedComponents.map((component) => ({
        componentItemStableId: component.componentItemStableId,
        quantity: component.quantity,
        sortOrder: component.sortOrder,
      })),
      tempUnavailableUntil: toIso(item.tempUnavailableUntil),
      sortOrder: item.sortOrder,
      imageUrl: item.imageUrl ?? null,
      ingredientsEn: item.ingredientsEn ?? null,
      ingredientsZh: item.ingredientsZh ?? null,
      optionGroups: (item.optionGroups ?? [])
        .filter(
          (link) => link.templateGroup && link.templateGroup.deletedAt == null,
        )
        .map((link) => ({
          templateGroupStableId: link.templateGroup.stableId,
          bindingStableId: null,
          minSelect: link.minSelect,
          maxSelect: link.maxSelect,
          sortOrder: link.sortOrder,
          isEnabled: link.isEnabled,
          affectedPackagingTypeStableIds: link.affectedPackagingTypeStableIds,
          template: {
            templateGroupStableId: link.templateGroup.stableId,
            nameEn: link.templateGroup.nameEn,
            nameZh: link.templateGroup.nameZh ?? null,
            defaultMinSelect: link.templateGroup.defaultMinSelect,
            defaultMaxSelect: link.templateGroup.defaultMaxSelect ?? null,
            isAvailable: link.templateGroup.isAvailable,
            tempUnavailableUntil: toIso(
              link.templateGroup.tempUnavailableUntil,
            ),
            sortOrder: link.templateGroup.sortOrder,
          },
        })),
    }));
  }

  async listPackagingTypes(): Promise<MenuPackagingTypeDto[]> {
    const packagingTypes = await this.prisma.menuPackagingType.findMany({
      where: { deletedAt: null },
      orderBy: { sortOrder: 'asc' },
    });

    return packagingTypes.map((type) => ({
      stableId: type.stableId,
      name: type.name,
      isActive: type.isActive,
      sortOrder: type.sortOrder,
    }));
  }

  async getMenuItemPricingSnapshots(
    storeStableId: string,
    options?: { includeDeleted?: boolean },
  ): Promise<Array<{ itemStableId: string; basePriceCents: number }>> {
    const storeId = requireStoreStableId(storeStableId);
    const items = await this.prisma.menuItem.findMany({
      where: {
        ...(options?.includeDeleted ? {} : { deletedAt: null }),
        category: { storeStableId: storeId },
      },
      select: { stableId: true, basePriceCents: true },
    });

    return items.map((item) => ({
      itemStableId: item.stableId,
      basePriceCents: item.basePriceCents,
    }));
  }

  async readItemSubjects(query?: {
    storeStableId?: string;
  }): Promise<CatalogMarketingItemSubjectV1[]> {
    const storeStableId = query?.storeStableId?.trim() || undefined;
    const items = await this.prisma.menuItem.findMany({
      where: {
        deletedAt: null,
        category: {
          deletedAt: null,
          ...(storeStableId ? { storeStableId } : {}),
        },
      },
      select: {
        stableId: true,
        nameEn: true,
        nameZh: true,
        category: {
          select: {
            storeStableId: true,
          },
        },
      },
      orderBy: [{ category: { sortOrder: 'asc' } }, { sortOrder: 'asc' }],
    });

    return items.map((item) => ({
      itemStableId: item.stableId,
      storeStableId: item.category.storeStableId,
      nameEn: item.nameEn,
      nameZh: item.nameZh,
    }));
  }

  async readItemClassifications(query: {
    storeStableId: string;
    itemStableIds: string[];
  }): Promise<CatalogReportingItemClassificationV1[]> {
    const storeStableId = requireStoreStableId(query.storeStableId);
    const itemStableIds = Array.from(
      new Set(
        query.itemStableIds
          .map((stableId) => stableId.trim())
          .filter((stableId) => stableId.length > 0),
      ),
    );
    if (itemStableIds.length === 0) return [];

    const items = await this.prisma.menuItem.findMany({
      where: {
        stableId: { in: itemStableIds },
        deletedAt: null,
        category: {
          deletedAt: null,
          storeStableId,
        },
      },
      select: {
        stableId: true,
        itemKind: true,
        category: {
          select: {
            storeStableId: true,
          },
        },
      },
      orderBy: { stableId: 'asc' },
    });

    return items.map((item) => ({
      itemStableId: item.stableId,
      storeStableId: item.category.storeStableId,
      itemKind: item.itemKind,
    }));
  }

  async createCategory(
    storeStableId: string,
    body: {
      nameEn: string;
      nameZh?: string;
      sortOrder?: number;
      isActive?: boolean;
    },
  ) {
    const storeId = requireStoreStableId(storeStableId);
    const nameEn = (body.nameEn ?? '').trim();
    if (!nameEn) throw new BadRequestException('nameEn is required');

    const created = await this.prisma.menuCategory.create({
      data: {
        storeStableId: storeId,
        nameEn,
        nameZh: body.nameZh?.trim() || null,
        sortOrder: Number.isFinite(body.sortOrder)
          ? (body.sortOrder as number)
          : 0,
        isActive: typeof body.isActive === 'boolean' ? body.isActive : true,
        deletedAt: null,
      },
      select: { stableId: true },
    });

    return { stableId: created.stableId };
  }

  async createPackagingType(body: {
    name: string;
    sortOrder?: number;
    isActive?: boolean;
  }) {
    const name = body.name?.trim();
    if (!name) throw new BadRequestException('Packaging type name is required');
    const existing = await this.prisma.menuPackagingType.findFirst({
      where: { name },
      select: { stableId: true },
    });
    if (existing) {
      throw new BadRequestException(`Packaging already exists: ${name}`);
    }
    const created = await this.prisma.menuPackagingType.create({
      data: {
        name,
        sortOrder: Number.isFinite(body.sortOrder)
          ? Math.trunc(body.sortOrder!)
          : 0,
        isActive: body.isActive ?? true,
        deletedAt: null,
      },
      select: { stableId: true },
    });
    return { stableId: created.stableId };
  }

  async updatePackagingType(
    packagingTypeStableId: string,
    body: { name?: string; sortOrder?: number; isActive?: boolean },
  ) {
    const stableId = packagingTypeStableId.trim();
    const existing = await this.prisma.menuPackagingType.findFirst({
      where: { stableId, deletedAt: null },
      select: { id: true },
    });
    if (!existing) throw new NotFoundException('Packaging type not found');
    if (body.name !== undefined && !body.name.trim()) {
      throw new BadRequestException('Packaging type name is required');
    }
    await this.prisma.menuPackagingType.update({
      where: { stableId },
      data: {
        name: body.name === undefined ? undefined : body.name.trim(),
        sortOrder:
          body.sortOrder === undefined ? undefined : Math.trunc(body.sortOrder),
        isActive: body.isActive,
      },
    });
    return { ok: true };
  }

  async createItem(
    storeStableId: string,
    body: {
      categoryStableId: string;
      stableId?: string;
      nameEn: string;
      nameZh?: string;
      basePriceCents: number;
      sortOrder?: number;
      imageUrl?: string;
      ingredientsEn?: string;
      ingredientsZh?: string;
      visibility?: 'PUBLIC' | 'HIDDEN';
      isVisibleOnMainMenu?: boolean;
      publishToUberEats?: boolean;
      labelStrategy?: 'AUTO' | 'ALWAYS' | 'NEVER';
      itemKind?: 'FOOD' | 'BEVERAGE';
      packagingTypeStableIds?: string[];
    },
  ) {
    const rawBody = body as Record<string, unknown>;
    if (
      Object.prototype.hasOwnProperty.call(rawBody, 'isAvailable') ||
      Object.prototype.hasOwnProperty.call(rawBody, 'tempUnavailableUntil')
    ) {
      throw new BadRequestException(
        'Create items as available, then use the dedicated availability endpoint',
      );
    }
    const storeId = requireStoreStableId(storeStableId);
    const categoryStableId = (body.categoryStableId ?? '').trim();
    if (!categoryStableId) {
      throw new BadRequestException('categoryStableId is required');
    }

    const category = await this.prisma.menuCategory.findFirst({
      where: {
        stableId: categoryStableId,
        storeStableId: storeId,
        deletedAt: null,
      },
      select: { id: true },
    });
    if (!category) {
      throw new NotFoundException(`Category not found: ${categoryStableId}`);
    }

    const packagingTypes = await this.resolvePackagingTypes(
      body.packagingTypeStableIds ?? [],
    );
    const stableIdRaw =
      typeof body.stableId === 'string' ? body.stableId.trim() : '';
    const stableId = stableIdRaw.length > 0 ? stableIdRaw : undefined;
    const nameEn = (body.nameEn ?? '').trim();
    if (!nameEn) throw new BadRequestException('nameEn is required');
    if (!Number.isFinite(body.basePriceCents)) {
      throw new BadRequestException('basePriceCents is required');
    }

    const effectiveAt = new Date();
    return this.prisma.$transaction(async (tx) => {
      const history = await tx.catalogAvailabilityHistoryState.findUnique({
        where: { storeStableId: storeId },
        select: { storeStableId: true },
      });
      const created = await tx.menuItem.create({
        data: {
          categoryId: category.id,
          ...(stableId ? { stableId } : {}),
          nameEn,
          nameZh: body.nameZh?.trim() || null,
          basePriceCents: Math.max(0, Math.round(body.basePriceCents)),
          sortOrder: Number.isFinite(body.sortOrder)
            ? (body.sortOrder as number)
            : 0,
          imageUrl: body.imageUrl?.trim() || null,
          ingredientsEn: body.ingredientsEn?.trim() || null,
          ingredientsZh: body.ingredientsZh?.trim() || null,
          isAvailable: true,
          visibility: body.visibility ?? 'PUBLIC',
          isVisibleOnMainMenu:
            typeof body.isVisibleOnMainMenu === 'boolean'
              ? body.isVisibleOnMainMenu
              : true,
          publishToUberEats:
            typeof body.publishToUberEats === 'boolean'
              ? body.publishToUberEats
              : false,
          labelStrategy: body.labelStrategy ?? 'AUTO',
          itemKind: body.itemKind ?? 'FOOD',
          packagings: {
            create: packagingTypes.map((packagingType, index) => ({
              packagingTypeId: packagingType.id,
              sortOrder: index,
            })),
          },
          tempUnavailableUntil: null,
          deletedAt: null,
        },
        select: {
          stableId: true,
          nameEn: true,
          nameZh: true,
          isAvailable: true,
          tempUnavailableUntil: true,
        },
      });

      if (!history) {
        await initializeCatalogAvailabilityHistory(tx, storeId, effectiveAt);
      } else {
        const isUnavailable = isCatalogItemUnavailableAt(created, effectiveAt);
        if (isUnavailable) {
          await captureCatalogAvailabilityTransition(tx, {
            storeStableId: storeId,
            item: created,
            wasUnavailable: false,
            isUnavailable: true,
            effectiveAt,
            unavailableUntil: created.isAvailable
              ? created.tempUnavailableUntil
              : null,
          });
        }
      }
      return { stableId: created.stableId };
    });
  }

  async validateFixedComponentComposition(
    storeStableId: string,
    itemStableId: string,
    fixedComponents: Array<{
      componentItemStableId: string;
      quantity: number;
      sortOrder?: number;
    }>,
  ): Promise<void> {
    const stableId = (itemStableId ?? '').trim();
    if (!stableId) throw new BadRequestException('itemStableId is required');
    await this.resolveFixedComponents(storeStableId, stableId, fixedComponents);
  }

  async updateItem(
    storeStableId: string,
    itemStableId: string,
    body: {
      categoryStableId?: string;
      nameEn?: string;
      nameZh?: string | null;
      basePriceCents?: number;
      sortOrder?: number;
      imageUrl?: string | null;
      ingredientsEn?: string | null;
      ingredientsZh?: string | null;
      visibility?: 'PUBLIC' | 'HIDDEN';
      isVisibleOnMainMenu?: boolean;
      publishToUberEats?: boolean;
      labelStrategy?: 'AUTO' | 'ALWAYS' | 'NEVER';
      itemKind?: 'FOOD' | 'BEVERAGE';
      packagingTypeStableIds?: string[];
      fixedComponents?: Array<{
        componentItemStableId: string;
        quantity: number;
        sortOrder?: number;
      }>;
    },
  ): Promise<{
    ok: true;
    availability: {
      stableId: string;
      isAvailable: boolean;
      tempUnavailableUntil: string | null;
      effectiveAvailability: boolean;
    };
  }> {
    const rawBody = body as Record<string, unknown>;
    if (
      Object.prototype.hasOwnProperty.call(rawBody, 'isAvailable') ||
      Object.prototype.hasOwnProperty.call(rawBody, 'tempUnavailableUntil')
    ) {
      throw new BadRequestException(
        'Use the dedicated item availability endpoint for availability changes',
      );
    }
    const storeId = requireStoreStableId(storeStableId);
    const stableId = (itemStableId ?? '').trim();
    if (!stableId) throw new BadRequestException('itemStableId is required');

    const existing = await this.prisma.menuItem.findFirst({
      where: {
        stableId,
        deletedAt: null,
        category: { storeStableId: storeId, deletedAt: null },
      },
      select: {
        id: true,
        optionGroups: {
          select: { affectedPackagingTypeStableIds: true },
        },
      },
    });
    if (!existing) throw new NotFoundException(`Item not found: ${stableId}`);

    let categoryId: string | undefined;
    if (body.categoryStableId) {
      const category = await this.prisma.menuCategory.findFirst({
        where: {
          stableId: body.categoryStableId.trim(),
          storeStableId: storeId,
          deletedAt: null,
        },
        select: { id: true },
      });
      if (!category) {
        throw new NotFoundException(
          `Category not found: ${body.categoryStableId}`,
        );
      }
      categoryId = category.id;
    }

    let packagingTypesForUpdate:
      | Array<{ id: string; stableId: string }>
      | undefined;
    if (body.packagingTypeStableIds !== undefined) {
      packagingTypesForUpdate = await this.resolvePackagingTypes(
        body.packagingTypeStableIds,
      );
      if (packagingTypesForUpdate.length > 1) {
        const nextPackagingTypeStableIds = new Set(
          packagingTypesForUpdate.map(
            (packagingType) => packagingType.stableId,
          ),
        );
        const referencedPackagingTypeStableIds = new Set(
          existing.optionGroups.flatMap(
            (group) => group.affectedPackagingTypeStableIds,
          ),
        );
        const removedReferencedPackagingTypes = [
          ...referencedPackagingTypeStableIds,
        ].filter((value) => !nextPackagingTypeStableIds.has(value));
        if (removedReferencedPackagingTypes.length > 0) {
          throw new BadRequestException(
            `Packaging types still used by menu options: ${removedReferencedPackagingTypes.join(', ')}`,
          );
        }
      }
    }

    const fixedComponentsForUpdate =
      body.fixedComponents === undefined
        ? undefined
        : await this.resolveFixedComponents(
            storeId,
            stableId,
            body.fixedComponents,
          );

    const updated = await this.prisma.menuItem.update({
      where: { stableId },
      data: {
        categoryId,
        nameEn: body.nameEn === undefined ? undefined : body.nameEn.trim(),
        nameZh:
          body.nameZh === undefined ? undefined : body.nameZh?.trim() || null,
        basePriceCents:
          body.basePriceCents === undefined
            ? undefined
            : Math.max(0, Math.round(body.basePriceCents)),
        sortOrder:
          body.sortOrder === undefined ? undefined : Math.floor(body.sortOrder),
        imageUrl:
          body.imageUrl === undefined
            ? undefined
            : body.imageUrl?.trim() || null,
        ingredientsEn:
          body.ingredientsEn === undefined
            ? undefined
            : body.ingredientsEn?.trim() || null,
        ingredientsZh:
          body.ingredientsZh === undefined
            ? undefined
            : body.ingredientsZh?.trim() || null,
        visibility: body.visibility === undefined ? undefined : body.visibility,
        isVisibleOnMainMenu:
          body.isVisibleOnMainMenu === undefined
            ? undefined
            : body.isVisibleOnMainMenu,
        publishToUberEats:
          body.publishToUberEats === undefined
            ? undefined
            : body.publishToUberEats,
        labelStrategy:
          body.labelStrategy === undefined ? undefined : body.labelStrategy,
        itemKind: body.itemKind === undefined ? undefined : body.itemKind,
        ...(packagingTypesForUpdate
          ? {
              packagings: {
                deleteMany: {},
                create: packagingTypesForUpdate.map((packagingType, index) => ({
                  packagingTypeId: packagingType.id,
                  sortOrder: index,
                })),
              },
            }
          : {}),
        ...(fixedComponentsForUpdate
          ? {
              fixedComponents: {
                deleteMany: {},
                create: fixedComponentsForUpdate.map((component) => ({
                  componentItemStableId: component.componentItemStableId,
                  quantity: component.quantity,
                  sortOrder: component.sortOrder,
                })),
              },
            }
          : {}),
      },
      select: {
        stableId: true,
        isAvailable: true,
        tempUnavailableUntil: true,
      },
    });

    return {
      ok: true,
      availability: {
        stableId: updated.stableId,
        isAvailable: updated.isAvailable,
        tempUnavailableUntil: toIso(updated.tempUnavailableUntil),
        effectiveAvailability: isAvailableNow(
          availabilityFromDb(updated.isAvailable, updated.tempUnavailableUntil),
        ),
      },
    };
  }

  async initializeAvailabilityHistoryForStore(
    storeStableId: string,
    trackingStartedAt: Date = new Date(),
  ): Promise<boolean> {
    const storeId = requireStoreStableId(storeStableId);
    return this.prisma.$transaction((tx) =>
      initializeCatalogAvailabilityHistory(tx, storeId, trackingStartedAt),
    );
  }

  async setItemAvailability(
    storeStableId: string,
    itemStableId: string,
    mode: CatalogAvailabilityMode,
    timing: CatalogAvailabilityMutationTiming,
  ) {
    const storeId = requireStoreStableId(storeStableId);
    const stableId = itemStableId.trim();
    if (!stableId) throw new BadRequestException('itemStableId is required');
    if (
      mode === 'TEMP_TODAY_OFF' &&
      (!timing.tempUnavailableUntil ||
        timing.tempUnavailableUntil <= timing.effectiveAt)
    ) {
      throw new BadRequestException(
        'TEMP_TODAY_OFF requires a future Store-local midnight',
      );
    }

    return this.prisma.$transaction(async (tx) => {
      const item = await tx.menuItem.findFirst({
        where: {
          stableId,
          deletedAt: null,
          category: { storeStableId: storeId, deletedAt: null },
        },
        select: {
          id: true,
          stableId: true,
          nameEn: true,
          nameZh: true,
          isAvailable: true,
          tempUnavailableUntil: true,
        },
      });
      if (!item) throw new NotFoundException(`Item not found: ${stableId}`);

      const history = await tx.catalogAvailabilityHistoryState.findUnique({
        where: { storeStableId: storeId },
        select: { storeStableId: true },
      });
      const wasUnavailable = isCatalogItemUnavailableAt(
        item,
        timing.effectiveAt,
      );
      const data =
        mode === 'ON'
          ? { isAvailable: true, tempUnavailableUntil: null }
          : mode === 'PERMANENT_OFF'
            ? { isAvailable: false, tempUnavailableUntil: null }
            : {
                isAvailable: true,
                tempUnavailableUntil: timing.tempUnavailableUntil,
              };

      const updated = await tx.menuItem.update({
        where: { stableId },
        data,
        select: {
          stableId: true,
          isAvailable: true,
          visibility: true,
          isVisibleOnMainMenu: true,
          tempUnavailableUntil: true,
        },
      });

      if (!history) {
        await initializeCatalogAvailabilityHistory(
          tx,
          storeId,
          timing.effectiveAt,
        );
      } else {
        const isUnavailable = isCatalogItemUnavailableAt(
          updated,
          timing.effectiveAt,
        );
        await captureCatalogAvailabilityTransition(tx, {
          storeStableId: storeId,
          item,
          wasUnavailable,
          isUnavailable,
          effectiveAt: timing.effectiveAt,
          unavailableUntil:
            isUnavailable && updated.isAvailable
              ? updated.tempUnavailableUntil
              : null,
        });
      }

      return {
        stableId: updated.stableId,
        isAvailable: updated.isAvailable,
        visibility: updated.visibility,
        isVisibleOnMainMenu: updated.isVisibleOnMainMenu,
        tempUnavailableUntil: toIso(updated.tempUnavailableUntil),
        effectiveAvailability: isAvailableNow(
          availabilityFromDb(updated.isAvailable, updated.tempUnavailableUntil),
        ),
      };
    });
  }

  async listOptionGroupTemplates(
    storeStableId: string,
  ): Promise<TemplateGroupFullDto[]> {
    const storeId = requireStoreStableId(storeStableId);
    const groups = await this.prisma.menuOptionGroupTemplate.findMany({
      where: { storeStableId: storeId, deletedAt: null },
      orderBy: { sortOrder: 'asc' },
      include: {
        options: {
          where: { deletedAt: null },
          orderBy: { sortOrder: 'asc' },
          include: {
            childLinks: {
              where: { childOption: { deletedAt: null } },
              include: { childOption: { select: { stableId: true } } },
            },
            parentLinks: {
              where: { parentOption: { deletedAt: null } },
              include: { parentOption: { select: { stableId: true } } },
            },
          },
        },
      },
    });

    const targetItemStableIds = Array.from(
      new Set(
        (groups ?? []).flatMap((group) =>
          (group.options ?? [])
            .map((option) => option.targetItemStableId?.trim() ?? '')
            .filter((stableId) => stableId.length > 0),
        ),
      ),
    );

    const targetItems =
      targetItemStableIds.length === 0
        ? []
        : await this.prisma.menuItem.findMany({
            where: {
              stableId: { in: targetItemStableIds },
              deletedAt: null,
              category: { storeStableId: storeId, deletedAt: null },
            },
            select: {
              stableId: true,
              isAvailable: true,
              tempUnavailableUntil: true,
            },
          });

    const availableTargetItemStableIds = new Set(
      targetItems
        .filter((item) =>
          isAvailableNow(
            availabilityFromDb(item.isAvailable, item.tempUnavailableUntil),
          ),
        )
        .map((item) => item.stableId),
    );

    return (groups ?? []).map((group) => {
      const templateGroupStableId = group.stableId;
      return {
        templateGroupStableId,
        nameEn: group.nameEn,
        nameZh: group.nameZh ?? null,
        defaultMinSelect: group.defaultMinSelect,
        defaultMaxSelect: group.defaultMaxSelect ?? null,
        isAvailable: group.isAvailable,
        tempUnavailableUntil: toIso(group.tempUnavailableUntil),
        sortOrder: group.sortOrder,
        options: (group.options ?? []).map((option) => {
          const selfAvailable = isAvailableNow(
            availabilityFromDb(option.isAvailable, option.tempUnavailableUntil),
          );
          const targetAvailable =
            !option.targetItemStableId ||
            availableTargetItemStableIds.has(option.targetItemStableId);

          return {
            optionStableId: option.stableId,
            templateGroupStableId,
            nameEn: option.nameEn,
            nameZh: option.nameZh ?? null,
            priceDeltaCents: option.priceDeltaCents,
            targetItemStableId: option.targetItemStableId ?? null,
            isAvailable: selfAvailable && targetAvailable,
            tempUnavailableUntil: toIso(option.tempUnavailableUntil),
            sortOrder: option.sortOrder,
            childOptionStableIds: (option.childLinks ?? []).map(
              (link) => link.childOption.stableId,
            ),
            parentOptionStableIds: (option.parentLinks ?? []).map(
              (link) => link.parentOption.stableId,
            ),
          };
        }),
      };
    });
  }

  async createOptionGroupTemplate(
    storeStableId: string,
    body: {
      nameEn: string;
      nameZh?: string;
      sortOrder?: number;
      defaultMinSelect?: number;
      defaultMaxSelect?: number | null;
    },
  ) {
    const storeId = requireStoreStableId(storeStableId);
    const nameEn = (body.nameEn ?? '').trim();
    if (!nameEn) throw new BadRequestException('nameEn is required');

    const created = await this.prisma.menuOptionGroupTemplate.create({
      data: {
        storeStableId: storeId,
        nameEn,
        nameZh: body.nameZh?.trim() || null,
        sortOrder: Number.isFinite(body.sortOrder)
          ? (body.sortOrder as number)
          : 0,
        defaultMinSelect: Number.isFinite(body.defaultMinSelect)
          ? Math.max(0, Math.floor(body.defaultMinSelect as number))
          : 0,
        defaultMaxSelect:
          body.defaultMaxSelect === null
            ? null
            : Number.isFinite(body.defaultMaxSelect)
              ? Math.max(0, Math.floor(body.defaultMaxSelect as number))
              : 1,
        deletedAt: null,
      },
      select: { stableId: true },
    });

    return { templateGroupStableId: created.stableId };
  }

  async updateOptionGroupTemplate(
    storeStableId: string,
    templateGroupStableId: string,
    body: {
      nameEn?: string;
      nameZh?: string | null;
      sortOrder?: number;
      defaultMinSelect?: number;
      defaultMaxSelect?: number | null;
    },
  ) {
    const storeId = requireStoreStableId(storeStableId);
    const stableId = templateGroupStableId.trim();
    const exists = await this.prisma.menuOptionGroupTemplate.findFirst({
      where: { stableId, storeStableId: storeId, deletedAt: null },
      select: { id: true },
    });
    if (!exists) {
      throw new NotFoundException(`Template group not found: ${stableId}`);
    }

    const nameEn =
      body.nameEn === undefined ? undefined : (body.nameEn ?? '').trim();
    if (nameEn !== undefined && !nameEn) {
      throw new BadRequestException('nameEn is required');
    }

    await this.prisma.menuOptionGroupTemplate.update({
      where: { stableId },
      data: {
        nameEn,
        nameZh:
          body.nameZh === undefined ? undefined : body.nameZh?.trim() || null,
        sortOrder:
          body.sortOrder === undefined
            ? undefined
            : Number.isFinite(body.sortOrder)
              ? Math.floor(body.sortOrder)
              : 0,
        defaultMinSelect:
          body.defaultMinSelect === undefined
            ? undefined
            : Number.isFinite(body.defaultMinSelect)
              ? Math.max(0, Math.floor(body.defaultMinSelect))
              : 0,
        defaultMaxSelect:
          body.defaultMaxSelect === undefined
            ? undefined
            : body.defaultMaxSelect === null
              ? null
              : Number.isFinite(body.defaultMaxSelect)
                ? Math.max(0, Math.floor(body.defaultMaxSelect))
                : null,
      },
    });

    return { ok: true };
  }

  async createTemplateOption(
    storeStableId: string,
    templateGroupStableId: string,
    body: {
      nameEn: string;
      nameZh?: string;
      priceDeltaCents?: number;
      sortOrder?: number;
      targetItemStableId?: string | null;
    },
  ) {
    const storeId = requireStoreStableId(storeStableId);
    const groupStableId = templateGroupStableId.trim();
    const group = await this.prisma.menuOptionGroupTemplate.findFirst({
      where: {
        stableId: groupStableId,
        storeStableId: storeId,
        deletedAt: null,
      },
      select: { id: true, stableId: true },
    });
    if (!group) {
      throw new NotFoundException(`Template group not found: ${groupStableId}`);
    }

    const nameEn = (body.nameEn ?? '').trim();
    if (!nameEn) throw new BadRequestException('nameEn is required');

    const targetItemStableId = (body.targetItemStableId ?? '').trim();
    if (targetItemStableId) {
      const exists = await this.prisma.menuItem.findFirst({
        where: {
          stableId: targetItemStableId,
          deletedAt: null,
          category: { storeStableId: storeId, deletedAt: null },
        },
        select: { id: true },
      });
      if (!exists) {
        throw new BadRequestException(
          `Invalid targetItemStableId: ${targetItemStableId}`,
        );
      }
    }

    const created = await this.prisma.menuOptionTemplateChoice.create({
      data: {
        templateGroupId: group.id,
        nameEn,
        nameZh: body.nameZh?.trim() || null,
        priceDeltaCents: Number.isFinite(body.priceDeltaCents)
          ? Math.round(body.priceDeltaCents as number)
          : 0,
        sortOrder: Number.isFinite(body.sortOrder)
          ? Math.floor(body.sortOrder as number)
          : 0,
        targetItemStableId: targetItemStableId || null,
        deletedAt: null,
      },
      select: { stableId: true },
    });

    return { optionStableId: created.stableId };
  }

  async updateTemplateOption(
    storeStableId: string,
    optionStableId: string,
    body: {
      nameEn?: string;
      nameZh?: string | null;
      priceDeltaCents?: number;
      sortOrder?: number;
      childOptionStableIds?: string[];
      targetItemStableId?: string | null;
    },
  ) {
    const storeId = requireStoreStableId(storeStableId);
    const stableId = optionStableId.trim();
    const exists = await this.prisma.menuOptionTemplateChoice.findFirst({
      where: {
        stableId,
        deletedAt: null,
        templateGroup: { storeStableId: storeId, deletedAt: null },
      },
      select: { id: true, templateGroupId: true },
    });
    if (!exists) throw new NotFoundException(`Option not found: ${stableId}`);

    let targetItemStableId: string | null | undefined;
    if (body.targetItemStableId !== undefined) {
      const trimmed = body.targetItemStableId?.trim() ?? '';
      targetItemStableId = trimmed || null;
      if (targetItemStableId) {
        const targetItem = await this.prisma.menuItem.findFirst({
          where: {
            stableId: targetItemStableId,
            deletedAt: null,
            category: { storeStableId: storeId, deletedAt: null },
          },
          select: { id: true },
        });
        if (!targetItem) {
          throw new BadRequestException(
            `Invalid targetItemStableId: ${targetItemStableId}`,
          );
        }
      }
    }

    const updateData = {
      nameEn: body.nameEn === undefined ? undefined : body.nameEn.trim(),
      nameZh:
        body.nameZh === undefined ? undefined : body.nameZh?.trim() || null,
      priceDeltaCents:
        body.priceDeltaCents === undefined
          ? undefined
          : Math.round(body.priceDeltaCents),
      sortOrder:
        body.sortOrder === undefined ? undefined : Math.floor(body.sortOrder),
      targetItemStableId,
    };

    if (body.childOptionStableIds === undefined) {
      await this.prisma.menuOptionTemplateChoice.update({
        where: { stableId },
        data: updateData,
      });
      return { ok: true };
    }

    const childStableIds = Array.from(
      new Set(
        (body.childOptionStableIds ?? [])
          .map((id) => id.trim())
          .filter((id) => id && id !== stableId),
      ),
    );
    const childOptions =
      childStableIds.length > 0
        ? await this.prisma.menuOptionTemplateChoice.findMany({
            where: {
              stableId: { in: childStableIds },
              deletedAt: null,
              templateGroupId: exists.templateGroupId,
            },
            select: { id: true, stableId: true },
          })
        : [];
    const foundChildStableIds = new Set(
      childOptions.map((option) => option.stableId),
    );
    const missingChildStableIds = childStableIds.filter(
      (id) => !foundChildStableIds.has(id),
    );
    if (missingChildStableIds.length > 0) {
      throw new BadRequestException(
        `Invalid child options: ${missingChildStableIds.join(', ')}`,
      );
    }

    const operations: Prisma.PrismaPromise<unknown>[] = [];
    if (Object.values(updateData).some((value) => value !== undefined)) {
      operations.push(
        this.prisma.menuOptionTemplateChoice.update({
          where: { stableId },
          data: updateData,
        }),
      );
    }
    operations.push(
      this.prisma.menuOptionChoiceLink.deleteMany({
        where: { parentOptionId: exists.id },
      }),
    );
    if (childOptions.length > 0) {
      operations.push(
        this.prisma.menuOptionChoiceLink.createMany({
          data: childOptions.map((option) => ({
            parentOptionId: exists.id,
            childOptionId: option.id,
          })),
        }),
      );
    }
    await this.prisma.$transaction(operations);

    return { ok: true };
  }

  async setTemplateOptionAvailability(
    storeStableId: string,
    optionStableId: string,
    mode: CatalogAvailabilityMode,
    timing: CatalogAvailabilityMutationTiming,
  ): Promise<{
    ok: true;
    availability: {
      stableId: string;
      isAvailable: boolean;
      tempUnavailableUntil: string | null;
      effectiveAvailability: boolean;
    };
  }> {
    const storeId = requireStoreStableId(storeStableId);
    const stableId = optionStableId.trim();
    const exists = await this.prisma.menuOptionTemplateChoice.findFirst({
      where: {
        stableId,
        deletedAt: null,
        templateGroup: { storeStableId: storeId, deletedAt: null },
      },
      select: { id: true },
    });
    if (!exists) throw new NotFoundException(`Option not found: ${stableId}`);
    if (
      mode === 'TEMP_TODAY_OFF' &&
      (!timing.tempUnavailableUntil ||
        timing.tempUnavailableUntil <= timing.effectiveAt)
    ) {
      throw new BadRequestException(
        'TEMP_TODAY_OFF requires a future Store-local midnight',
      );
    }

    const data =
      mode === 'ON'
        ? { isAvailable: true, tempUnavailableUntil: null }
        : mode === 'PERMANENT_OFF'
          ? { isAvailable: false, tempUnavailableUntil: null }
          : {
              isAvailable: true,
              tempUnavailableUntil: timing.tempUnavailableUntil,
            };

    const updated = await this.prisma.menuOptionTemplateChoice.update({
      where: { stableId },
      data,
      select: {
        stableId: true,
        isAvailable: true,
        tempUnavailableUntil: true,
      },
    });

    return {
      ok: true,
      availability: {
        stableId: updated.stableId,
        isAvailable: updated.isAvailable,
        tempUnavailableUntil: toIso(updated.tempUnavailableUntil),
        effectiveAvailability: isAvailableNow(
          availabilityFromDb(updated.isAvailable, updated.tempUnavailableUntil),
        ),
      },
    };
  }

  async deleteTemplateOption(storeStableId: string, optionStableId: string) {
    const storeId = requireStoreStableId(storeStableId);
    const stableId = optionStableId.trim();
    const existing = await this.prisma.menuOptionTemplateChoice.findFirst({
      where: {
        stableId,
        deletedAt: null,
        templateGroup: { storeStableId: storeId, deletedAt: null },
      },
      select: { id: true },
    });
    if (!existing) throw new NotFoundException(`Option not found: ${stableId}`);

    await this.prisma.$transaction([
      this.prisma.menuOptionChoiceLink.deleteMany({
        where: {
          OR: [{ parentOptionId: existing.id }, { childOptionId: existing.id }],
        },
      }),
      this.prisma.menuOptionTemplateChoice.update({
        where: { id: existing.id },
        data: { deletedAt: new Date() },
      }),
    ]);

    return { ok: true };
  }

  async bindTemplateGroupToItem(
    storeStableId: string,
    itemStableId: string,
    body: {
      templateGroupStableId: string;
      minSelect: number;
      maxSelect: number | null;
      sortOrder: number;
      isEnabled: boolean;
      affectedPackagingTypeStableIds?: string[];
    },
  ) {
    const storeId = requireStoreStableId(storeStableId);
    const item = await this.prisma.menuItem.findFirst({
      where: {
        stableId: itemStableId.trim(),
        deletedAt: null,
        category: { storeStableId: storeId, deletedAt: null },
      },
      select: {
        id: true,
        packagings: {
          orderBy: { sortOrder: 'asc' },
          select: { packagingType: { select: { stableId: true } } },
        },
      },
    });
    if (!item) throw new NotFoundException(`Item not found: ${itemStableId}`);

    const requestedPackagingTypeStableIds = [
      ...new Set(
        (body.affectedPackagingTypeStableIds ?? [])
          .map((stableId) => stableId.trim())
          .filter(Boolean),
      ),
    ];
    const affectedPackagingTypeStableIds =
      item.packagings.length <= 1 ? [] : requestedPackagingTypeStableIds;
    if (affectedPackagingTypeStableIds.length > 0) {
      const availablePackagingTypeStableIds = new Set(
        item.packagings.map((packaging) => packaging.packagingType.stableId),
      );
      const invalidStableIds = affectedPackagingTypeStableIds.filter(
        (stableId) => !availablePackagingTypeStableIds.has(stableId),
      );
      if (invalidStableIds.length > 0) {
        throw new BadRequestException(
          `Packaging type not available for item: ${invalidStableIds.join(', ')}`,
        );
      }
    }

    const templateGroup = await this.prisma.menuOptionGroupTemplate.findFirst({
      where: {
        stableId: body.templateGroupStableId.trim(),
        storeStableId: storeId,
        deletedAt: null,
      },
      select: { id: true },
    });
    if (!templateGroup) {
      throw new NotFoundException(
        `Template group not found: ${body.templateGroupStableId}`,
      );
    }

    await this.prisma.menuItemOptionGroup.upsert({
      where: {
        itemId_templateGroupId: {
          itemId: item.id,
          templateGroupId: templateGroup.id,
        },
      },
      create: {
        itemId: item.id,
        templateGroupId: templateGroup.id,
        minSelect: Math.max(0, Math.floor(body.minSelect ?? 0)),
        maxSelect:
          body.maxSelect == null
            ? null
            : Math.max(0, Math.floor(body.maxSelect)),
        sortOrder: Number.isFinite(body.sortOrder)
          ? Math.floor(body.sortOrder)
          : 0,
        isEnabled: !!body.isEnabled,
        affectedPackagingTypeStableIds,
      },
      update: {
        minSelect: Math.max(0, Math.floor(body.minSelect ?? 0)),
        maxSelect:
          body.maxSelect == null
            ? null
            : Math.max(0, Math.floor(body.maxSelect)),
        sortOrder: Number.isFinite(body.sortOrder)
          ? Math.floor(body.sortOrder)
          : 0,
        isEnabled: !!body.isEnabled,
        affectedPackagingTypeStableIds,
      },
    });

    return { ok: true };
  }

  async unbindTemplateGroupFromItem(
    storeStableId: string,
    itemStableId: string,
    templateGroupStableId: string,
  ) {
    const storeId = requireStoreStableId(storeStableId);
    const item = await this.prisma.menuItem.findFirst({
      where: {
        stableId: itemStableId.trim(),
        deletedAt: null,
        category: { storeStableId: storeId, deletedAt: null },
      },
      select: { id: true },
    });
    if (!item) throw new NotFoundException(`Item not found: ${itemStableId}`);

    const templateGroup = await this.prisma.menuOptionGroupTemplate.findFirst({
      where: {
        stableId: templateGroupStableId.trim(),
        storeStableId: storeId,
        deletedAt: null,
      },
      select: { id: true },
    });
    if (!templateGroup) {
      throw new NotFoundException(
        `Template group not found: ${templateGroupStableId}`,
      );
    }

    await this.prisma.menuItemOptionGroup.delete({
      where: {
        itemId_templateGroupId: {
          itemId: item.id,
          templateGroupId: templateGroup.id,
        },
      },
    });

    return { ok: true };
  }

  private async resolveFixedComponents(
    storeStableId: string,
    parentItemStableId: string,
    input: Array<{
      componentItemStableId: string;
      quantity: number;
      sortOrder?: number;
    }>,
  ): Promise<
    Array<{
      componentItemStableId: string;
      quantity: number;
      sortOrder: number;
    }>
  > {
    const storeId = requireStoreStableId(storeStableId);
    if (!Array.isArray(input)) {
      throw new BadRequestException('fixedComponents must be an array');
    }

    const normalized = input.map((component, index) => {
      const componentItemStableId = component.componentItemStableId?.trim();
      if (!componentItemStableId) {
        throw new BadRequestException(
          `fixedComponents[${index}].componentItemStableId is required`,
        );
      }
      if (componentItemStableId === parentItemStableId) {
        throw new BadRequestException('A menu item cannot contain itself');
      }
      if (!Number.isFinite(component.quantity) || component.quantity < 1) {
        throw new BadRequestException(
          `fixedComponents[${index}].quantity must be at least 1`,
        );
      }
      return {
        componentItemStableId,
        quantity: Math.max(1, Math.trunc(component.quantity)),
        sortOrder: Number.isFinite(component.sortOrder)
          ? Math.max(0, Math.trunc(component.sortOrder as number))
          : index,
      };
    });

    const stableIds = normalized.map(
      (component) => component.componentItemStableId,
    );
    if (new Set(stableIds).size !== stableIds.length) {
      throw new BadRequestException(
        'Each fixed component item may only appear once; use quantity for repeats',
      );
    }
    if (stableIds.length === 0) return [];

    const targets = await this.prisma.menuItem.findMany({
      where: {
        stableId: { in: stableIds },
        deletedAt: null,
        category: { storeStableId: storeId, deletedAt: null },
      },
      select: { stableId: true },
    });
    const found = new Set(targets.map((target) => target.stableId));
    const missing = stableIds.filter((stableId) => !found.has(stableId));
    if (missing.length > 0) {
      throw new NotFoundException(
        `Fixed component item not found: ${missing.join(', ')}`,
      );
    }

    const existingEdges = await this.prisma.menuItemComponent.findMany({
      where: {
        parentItem: {
          category: { storeStableId: storeId, deletedAt: null },
        },
      },
      select: {
        componentItemStableId: true,
        parentItem: { select: { stableId: true } },
      },
    });
    const adjacency = new Map<string, string[]>();
    for (const edge of existingEdges) {
      if (edge.parentItem.stableId === parentItemStableId) continue;
      const values = adjacency.get(edge.parentItem.stableId) ?? [];
      values.push(edge.componentItemStableId);
      adjacency.set(edge.parentItem.stableId, values);
    }
    adjacency.set(parentItemStableId, stableIds);

    const visiting = new Set<string>();
    const visited = new Set<string>();
    const hasCycle = (stableId: string): boolean => {
      if (visiting.has(stableId)) return true;
      if (visited.has(stableId)) return false;
      visiting.add(stableId);
      for (const childStableId of adjacency.get(stableId) ?? []) {
        if (hasCycle(childStableId)) return true;
      }
      visiting.delete(stableId);
      visited.add(stableId);
      return false;
    };
    if (hasCycle(parentItemStableId)) {
      throw new BadRequestException(
        'Fixed combo components cannot form a cycle',
      );
    }

    return normalized;
  }

  private async resolvePackagingTypes(
    input: string[],
  ): Promise<Array<{ id: string; stableId: string }>> {
    const stableIds = [
      ...new Set(
        (Array.isArray(input) ? input : [])
          .map((stableId) => stableId.trim())
          .filter(Boolean),
      ),
    ];
    if (stableIds.length === 0) return [];

    const packagingTypes = await this.prisma.menuPackagingType.findMany({
      where: {
        stableId: { in: stableIds },
        deletedAt: null,
        isActive: true,
      },
      select: { id: true, stableId: true },
    });
    const packagingTypeByStableId = new Map(
      packagingTypes.map((packagingType) => [
        packagingType.stableId,
        packagingType,
      ]),
    );
    const missing = stableIds.filter(
      (stableId) => !packagingTypeByStableId.has(stableId),
    );
    if (missing.length > 0) {
      throw new NotFoundException(
        `Packaging type not found: ${missing.join(', ')}`,
      );
    }

    return stableIds.map((stableId) => packagingTypeByStableId.get(stableId)!);
  }
}
