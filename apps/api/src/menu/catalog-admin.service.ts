import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import type { Prisma } from '@prisma/client';
import {
  AdminMenuCategoryDto,
  AdminMenuOptionGroupBindingDto,
  isAvailableNow,
  MenuPackagingTypeDto,
  TemplateGroupFullDto,
  TemplateGroupLiteDto,
} from '@shared/menu';

import { PrismaService } from '../prisma/prisma.service';
import type {
  CatalogAvailabilityReaderPort,
  CatalogMenuItemAvailabilitySnapshot,
  CatalogOptionAvailabilitySnapshot,
} from './catalog-availability-reader.contract';

export type CatalogAvailabilityMode = 'ON' | 'PERMANENT_OFF' | 'TEMP_TODAY_OFF';

export type CatalogAdminMenuItemDto = Omit<
  AdminMenuCategoryDto['items'][number],
  'effectivePriceCents' | 'activeSpecial'
>;

export type CatalogAdminMenuCategoryDto = Omit<AdminMenuCategoryDto, 'items'> & {
  items: CatalogAdminMenuItemDto[];
};

export type CatalogAdminMenuSnapshot = {
  categories: CatalogAdminMenuCategoryDto[];
  templatesLite: TemplateGroupLiteDto[];
  packagingTypes: MenuPackagingTypeDto[];
};

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

function nextMidnightLocal(): Date {
  const value = new Date();
  value.setHours(24, 0, 0, 0);
  return value;
}

@Injectable()
export class CatalogAdminService implements CatalogAvailabilityReaderPort {
  constructor(private readonly prisma: PrismaService) {}

  async getMenuItemAvailabilitySnapshot(
    menuItemStableId: string,
  ): Promise<CatalogMenuItemAvailabilitySnapshot | null> {
    const stableId = menuItemStableId.trim();
    if (!stableId) return null;

    const item = await this.prisma.menuItem.findFirst({
      where: { stableId, deletedAt: null },
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
    optionChoiceStableId: string,
  ): Promise<CatalogOptionAvailabilitySnapshot | null> {
    const stableId = optionChoiceStableId.trim();
    if (!stableId) return null;

    const option = await this.prisma.menuOptionTemplateChoice.findFirst({
      where: { stableId, deletedAt: null },
      select: { stableId: true, tempUnavailableUntil: true },
    });
    if (!option) return null;

    return {
      stableId: option.stableId,
      tempUnavailableUntil: toIso(option.tempUnavailableUntil),
    };
  }

  async updateCategory(
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
        where: { stableId: categoryStableId },
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

  async getFullMenu(): Promise<CatalogAdminMenuSnapshot> {
    const [categories, templateGroups, packagingTypes] = await Promise.all([
      this.prisma.menuCategory.findMany({
        where: { deletedAt: null },
        orderBy: { sortOrder: 'asc' },
        include: {
          items: {
            where: { deletedAt: null },
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
                where: {
                  templateGroup: { deletedAt: null },
                },
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
          },
        },
      }),
      this.prisma.menuOptionGroupTemplate.findMany({
        where: { deletedAt: null },
        orderBy: { sortOrder: 'asc' },
      }),
      this.prisma.menuPackagingType.findMany({
        where: { deletedAt: null },
        orderBy: { sortOrder: 'asc' },
      }),
    ]);

    const templatesLite: TemplateGroupLiteDto[] = (templateGroups ?? []).map(
      (group) => ({
        templateGroupStableId: group.stableId,
        nameEn: group.nameEn,
        nameZh: group.nameZh ?? null,
        defaultMinSelect: group.defaultMinSelect,
        defaultMaxSelect: group.defaultMaxSelect ?? null,
        isAvailable: group.isAvailable,
        tempUnavailableUntil: toIso(group.tempUnavailableUntil),
        sortOrder: group.sortOrder,
      }),
    );

    const packagingTypeDtos = packagingTypes.map((type) => ({
      stableId: type.stableId,
      name: type.name,
      isActive: type.isActive,
      sortOrder: type.sortOrder,
    }));
    const categoryDtos: CatalogAdminMenuCategoryDto[] = (categories ?? []).map(
      (category) => {
        const categoryStableId = category.stableId;
        const items = (category.items ?? []).map((item) => {
          const optionGroups: AdminMenuOptionGroupBindingDto[] = (
            item.optionGroups ?? []
          )
            .filter(
              (link) =>
                link.templateGroup && link.templateGroup.deletedAt == null,
            )
            .map((link) => {
              const templateGroup = link.templateGroup;
              const template: TemplateGroupLiteDto = {
                templateGroupStableId: templateGroup.stableId,
                nameEn: templateGroup.nameEn,
                nameZh: templateGroup.nameZh ?? null,
                defaultMinSelect: templateGroup.defaultMinSelect,
                defaultMaxSelect: templateGroup.defaultMaxSelect ?? null,
                isAvailable: templateGroup.isAvailable,
                tempUnavailableUntil: toIso(templateGroup.tempUnavailableUntil),
                sortOrder: templateGroup.sortOrder,
              };

              return {
                templateGroupStableId: templateGroup.stableId,
                bindingStableId: null,
                minSelect: link.minSelect,
                maxSelect: link.maxSelect,
                sortOrder: link.sortOrder,
                isEnabled: link.isEnabled,
                affectedPackagingTypeStableIds:
                  link.affectedPackagingTypeStableIds,
                template,
              };
            });

          return {
            stableId: item.stableId,
            categoryStableId,
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
            optionGroups,
          };
        });

        return {
          stableId: categoryStableId,
          sortOrder: category.sortOrder,
          nameEn: category.nameEn,
          nameZh: category.nameZh ?? null,
          isActive: category.isActive,
          items,
        };
      },
    );

    return {
      categories: categoryDtos,
      templatesLite,
      packagingTypes: packagingTypeDtos,
    };
  }

  async getMenuItemPricingSnapshots(options?: {
    includeDeleted?: boolean;
  }): Promise<Array<{ itemStableId: string; basePriceCents: number }>> {
    const items = await this.prisma.menuItem.findMany({
      where: options?.includeDeleted ? {} : { deletedAt: null },
      select: { stableId: true, basePriceCents: true },
    });

    return items.map((item) => ({
      itemStableId: item.stableId,
      basePriceCents: item.basePriceCents,
    }));
  }

  async createCategory(body: {
    nameEn: string;
    nameZh?: string;
    sortOrder?: number;
    isActive?: boolean;
  }) {
    const nameEn = (body.nameEn ?? '').trim();
    if (!nameEn) throw new BadRequestException('nameEn is required');

    const created = await this.prisma.menuCategory.create({
      data: {
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

  async createItem(body: {
    categoryStableId: string;
    stableId?: string;
    nameEn: string;
    nameZh?: string;
    basePriceCents: number;
    sortOrder?: number;
    imageUrl?: string;
    ingredientsEn?: string;
    ingredientsZh?: string;
    isAvailable?: boolean;
    visibility?: 'PUBLIC' | 'HIDDEN';
    isVisibleOnMainMenu?: boolean;
    publishToUberEats?: boolean;
    labelStrategy?: 'AUTO' | 'ALWAYS' | 'NEVER';
    itemKind?: 'FOOD' | 'BEVERAGE';
    packagingTypeStableIds?: string[];
    tempUnavailableUntil?: string | null;
  }) {
    const categoryStableId = (body.categoryStableId ?? '').trim();
    if (!categoryStableId) {
      throw new BadRequestException('categoryStableId is required');
    }

    const category = await this.prisma.menuCategory.findFirst({
      where: { stableId: categoryStableId, deletedAt: null },
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

    const created = await this.prisma.menuItem.create({
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
        isAvailable:
          typeof body.isAvailable === 'boolean' ? body.isAvailable : true,
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
        tempUnavailableUntil: parseIsoOrNull(body.tempUnavailableUntil),
        deletedAt: null,
      },
      select: { stableId: true },
    });

    return { stableId: created.stableId };
  }

  async validateFixedComponentComposition(
    itemStableId: string,
    fixedComponents: Array<{
      componentItemStableId: string;
      quantity: number;
      sortOrder?: number;
    }>,
  ): Promise<void> {
    const stableId = (itemStableId ?? '').trim();
    if (!stableId) throw new BadRequestException('itemStableId is required');
    await this.resolveFixedComponents(stableId, fixedComponents);
  }

  async updateItem(
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
      isAvailable?: boolean;
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
      tempUnavailableUntil?: string | null;
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
    const stableId = (itemStableId ?? '').trim();
    if (!stableId) throw new BadRequestException('itemStableId is required');

    const existing = await this.prisma.menuItem.findFirst({
      where: { stableId, deletedAt: null },
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
        where: { stableId: body.categoryStableId.trim(), deletedAt: null },
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
        : await this.resolveFixedComponents(stableId, body.fixedComponents);

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
        isAvailable:
          body.isAvailable === undefined ? undefined : body.isAvailable,
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
        tempUnavailableUntil:
          body.tempUnavailableUntil === undefined
            ? undefined
            : parseIsoOrNull(body.tempUnavailableUntil),
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

  async setItemAvailability(
    itemStableId: string,
    mode: CatalogAvailabilityMode,
  ) {
    const stableId = itemStableId.trim();
    if (!stableId) throw new BadRequestException('itemStableId is required');

    const exists = await this.prisma.menuItem.findFirst({
      where: { stableId, deletedAt: null },
      select: { id: true },
    });
    if (!exists) throw new NotFoundException(`Item not found: ${stableId}`);

    const data =
      mode === 'ON'
        ? { isAvailable: true, tempUnavailableUntil: null }
        : mode === 'PERMANENT_OFF'
          ? { isAvailable: false, tempUnavailableUntil: null }
          : { isAvailable: true, tempUnavailableUntil: nextMidnightLocal() };

    const updated = await this.prisma.menuItem.update({
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
  }

  async listOptionGroupTemplates(): Promise<TemplateGroupFullDto[]> {
    const groups = await this.prisma.menuOptionGroupTemplate.findMany({
      where: { deletedAt: null },
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

  async createOptionGroupTemplate(body: {
    nameEn: string;
    nameZh?: string;
    sortOrder?: number;
    defaultMinSelect?: number;
    defaultMaxSelect?: number | null;
  }) {
    const nameEn = (body.nameEn ?? '').trim();
    if (!nameEn) throw new BadRequestException('nameEn is required');

    const created = await this.prisma.menuOptionGroupTemplate.create({
      data: {
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
    templateGroupStableId: string,
    body: {
      nameEn?: string;
      nameZh?: string | null;
      sortOrder?: number;
      defaultMinSelect?: number;
      defaultMaxSelect?: number | null;
    },
  ) {
    const stableId = templateGroupStableId.trim();
    const exists = await this.prisma.menuOptionGroupTemplate.findFirst({
      where: { stableId, deletedAt: null },
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
    templateGroupStableId: string,
    body: {
      nameEn: string;
      nameZh?: string;
      priceDeltaCents?: number;
      sortOrder?: number;
      targetItemStableId?: string | null;
    },
  ) {
    const groupStableId = templateGroupStableId.trim();
    const group = await this.prisma.menuOptionGroupTemplate.findFirst({
      where: { stableId: groupStableId, deletedAt: null },
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
        where: { stableId: targetItemStableId, deletedAt: null },
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
    const stableId = optionStableId.trim();
    const exists = await this.prisma.menuOptionTemplateChoice.findFirst({
      where: { stableId, deletedAt: null },
      select: { id: true, templateGroupId: true },
    });
    if (!exists) throw new NotFoundException(`Option not found: ${stableId}`);

    let targetItemStableId: string | null | undefined;
    if (body.targetItemStableId !== undefined) {
      const trimmed = body.targetItemStableId?.trim() ?? '';
      targetItemStableId = trimmed || null;
      if (targetItemStableId) {
        const targetItem = await this.prisma.menuItem.findFirst({
          where: { stableId: targetItemStableId, deletedAt: null },
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
    optionStableId: string,
    mode: CatalogAvailabilityMode,
  ): Promise<{
    ok: true;
    availability: {
      stableId: string;
      isAvailable: boolean;
      tempUnavailableUntil: string | null;
      effectiveAvailability: boolean;
    };
  }> {
    const stableId = optionStableId.trim();
    const exists = await this.prisma.menuOptionTemplateChoice.findFirst({
      where: { stableId, deletedAt: null },
      select: { id: true },
    });
    if (!exists) throw new NotFoundException(`Option not found: ${stableId}`);

    const data =
      mode === 'ON'
        ? { isAvailable: true, tempUnavailableUntil: null }
        : mode === 'PERMANENT_OFF'
          ? { isAvailable: false, tempUnavailableUntil: null }
          : { isAvailable: true, tempUnavailableUntil: nextMidnightLocal() };

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

  async deleteTemplateOption(optionStableId: string) {
    const stableId = optionStableId.trim();
    const existing = await this.prisma.menuOptionTemplateChoice.findFirst({
      where: { stableId, deletedAt: null },
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
    const item = await this.prisma.menuItem.findFirst({
      where: { stableId: itemStableId.trim(), deletedAt: null },
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
      where: { stableId: body.templateGroupStableId.trim(), deletedAt: null },
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
    itemStableId: string,
    templateGroupStableId: string,
  ) {
    const item = await this.prisma.menuItem.findFirst({
      where: { stableId: itemStableId.trim(), deletedAt: null },
      select: { id: true },
    });
    if (!item) throw new NotFoundException(`Item not found: ${itemStableId}`);

    const templateGroup = await this.prisma.menuOptionGroupTemplate.findFirst({
      where: { stableId: templateGroupStableId.trim(), deletedAt: null },
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
      where: { stableId: { in: stableIds }, deletedAt: null },
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
