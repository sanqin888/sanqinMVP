import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import type { Prisma } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { AppLogger } from '../../common/app-logger';

/** ===== DTO（对外 JSON；Date -> ISO string）===== */
export type SuccessResponseDto = { success: true };

export type MenuOptionTemplateChoiceDto = {
  id: string;
  templateGroupId: string;
  nameEn: string;
  nameZh: string | null;
  priceDeltaCents: number;
  isAvailable: boolean;
  tempUnavailableUntil: string | null; // ISO
  sortOrder: number;
};

export type OptionGroupTemplateDto = {
  id: string;
  nameEn: string;
  nameZh: string | null;
  sortOrder: number;
  defaultMinSelect: number;
  defaultMaxSelect: number | null;
  isAvailable: boolean;
  tempUnavailableUntil: string | null; // ISO
  options: MenuOptionTemplateChoiceDto[];
};

export type MenuCategoryDto = {
  id: string;
  nameEn: string;
  nameZh: string | null;
  sortOrder: number;
  isActive: boolean;
};

export type MenuItemDto = {
  id: string;
  categoryId: string;
  stableId: string;
  nameEn: string;
  nameZh: string | null;
  basePriceCents: number;
  sortOrder: number;
  imageUrl: string | null;
  ingredientsEn: string | null;
  ingredientsZh: string | null;
  isAvailable: boolean;
  isVisible: boolean;
  tempUnavailableUntil: string | null; // ISO
};

export type MenuItemOptionGroupDto = {
  id: string;
  itemId: string;
  templateGroupId: string;
  minSelect: number;
  maxSelect: number | null;
  sortOrder: number;
  isEnabled: boolean;
};

export type FullMenuItemOptionGroupDto = MenuItemOptionGroupDto & {
  template: {
    id: string;
    nameEn: string;
    nameZh: string | null;
    isAvailable: boolean;
    tempUnavailableUntil: string | null; // ISO
    options: MenuOptionTemplateChoiceDto[];
  };
};

export type FullMenuItemDto = MenuItemDto & {
  optionGroups: FullMenuItemOptionGroupDto[];
};

export type FullMenuCategoryDto = MenuCategoryDto & {
  items: FullMenuItemDto[];
};

export type FullMenuResponseDto = FullMenuCategoryDto[];

/** ===== 请求参数类型（service 内部用）===== */
type AvailabilityMode = 'ON' | 'PERMANENT_OFF' | 'TEMP_TODAY_OFF';

type CreateOptionGroupTemplateInput = {
  nameEn: string;
  nameZh?: string;
  sortOrder?: number;
  defaultMinSelect?: number;
  defaultMaxSelect?: number | null;
};

type UpdateOptionGroupTemplateInput = Partial<{
  nameEn: string;
  nameZh?: string;
  sortOrder: number;
  defaultMinSelect: number;
  defaultMaxSelect: number | null;
}>;

type CreateTemplateOptionInput = {
  templateGroupId: string;
  nameEn: string;
  nameZh?: string;
  priceDeltaCents?: number;
  sortOrder?: number;
};

type CreateCategoryInput = {
  nameEn?: string;
  nameZh?: string;
  sortOrder?: number;
};

type UpdateCategoryInput = Partial<{
  nameEn: string;
  nameZh?: string;
  sortOrder: number;
  isActive: boolean;
}>;

type CreateItemInput = {
  categoryId: string;
  stableId: string;
  nameEn: string;
  nameZh?: string;
  basePriceCents: number;
  sortOrder?: number;
  imageUrl?: string;
  ingredientsEn?: string;
  ingredientsZh?: string;
};

type UpdateItemInput = Partial<{
  categoryId: string;
  nameEn: string;
  nameZh?: string;
  basePriceCents: number;
  isAvailable: boolean;
  isVisible: boolean;
  sortOrder: number;
  imageUrl?: string;
  ingredientsEn?: string;
  ingredientsZh?: string;
}>;

type AttachOptionGroupInput = {
  itemId: string;
  templateGroupId: string;
  minSelect?: number | null;
  maxSelect?: number | null;
  sortOrder?: number;
  isEnabled?: boolean;
};

type UpdateAttachedOptionGroupInput = Partial<{
  templateGroupId: string;
  minSelect: number | null;
  maxSelect: number | null;
  sortOrder: number;
  isEnabled: boolean;
}>;

type UpdateTemplateOptionInput = Partial<{
  nameEn: string;
  nameZh?: string;
  priceDeltaCents: number;
  sortOrder: number;
  isAvailable: boolean;
}>;

/** ===== helpers ===== */
function endOfTodayLocal(now = new Date()): Date {
  const d = new Date(now);
  d.setHours(23, 59, 59, 999);
  return d;
}

function toIsoOrNull(d: Date | null | undefined): string | null {
  return d ? d.toISOString() : null;
}

function asFiniteInt(v: unknown, fallback: number): number {
  return typeof v === 'number' && Number.isFinite(v) ? Math.trunc(v) : fallback;
}

function normalizeNameEn(v: unknown, fieldName = 'nameEn'): string {
  if (typeof v !== 'string') throw new BadRequestException(`${fieldName} is required`);
  const trimmed = v.trim();
  if (!trimmed) throw new BadRequestException(`${fieldName} is required`);
  return trimmed;
}

function normalizeOptionalString(v: unknown): string | null {
  if (typeof v !== 'string') return null;
  const t = v.trim();
  return t ? t : null;
}

@Injectable()
export class AdminMenuService {
  private readonly logger = new AppLogger(AdminMenuService.name);

  constructor(private readonly prisma: PrismaService) {}

  /** ===== 全量菜单（后台用）===== */
  async getFullMenu(): Promise<FullMenuResponseDto> {
    const categories = await this.prisma.menuCategory.findMany({
      orderBy: { sortOrder: 'asc' },
      include: {
        items: {
          orderBy: { sortOrder: 'asc' },
          include: {
            optionGroups: {
              orderBy: { sortOrder: 'asc' },
              include: {
                templateGroup: {
                  include: {
                    options: { orderBy: { sortOrder: 'asc' } },
                  },
                },
              },
            },
          },
        },
      },
    });

    return categories.map((cat) => ({
      id: cat.id,
      nameEn: cat.nameEn,
      nameZh: cat.nameZh ?? null,
      sortOrder: cat.sortOrder,
      isActive: cat.isActive,
      items: cat.items.map((it) => ({
        id: it.id,
        categoryId: it.categoryId,
        stableId: it.stableId,
        nameEn: it.nameEn,
        nameZh: it.nameZh ?? null,
        basePriceCents: it.basePriceCents,
        sortOrder: it.sortOrder,
        imageUrl: it.imageUrl ?? null,
        ingredientsEn: it.ingredientsEn ?? null,
        ingredientsZh: it.ingredientsZh ?? null,
        isAvailable: it.isAvailable,
        isVisible: it.isVisible,
        tempUnavailableUntil: toIsoOrNull(it.tempUnavailableUntil),
        optionGroups: (it.optionGroups ?? []).map((link) => ({
          id: link.id,
          itemId: link.itemId,
          templateGroupId: link.templateGroupId,
          minSelect: link.minSelect,
          maxSelect: link.maxSelect,
          sortOrder: link.sortOrder,
          isEnabled: link.isEnabled,
          template: {
            id: link.templateGroup.id,
            nameEn: link.templateGroup.nameEn,
            nameZh: link.templateGroup.nameZh ?? null,
            isAvailable: link.templateGroup.isAvailable,
            tempUnavailableUntil: toIsoOrNull(link.templateGroup.tempUnavailableUntil),
            options: (link.templateGroup.options ?? []).map((op) => ({
              id: op.id,
              templateGroupId: op.templateGroupId,
              nameEn: op.nameEn,
              nameZh: op.nameZh ?? null,
              priceDeltaCents: op.priceDeltaCents,
              isAvailable: op.isAvailable,
              tempUnavailableUntil: toIsoOrNull(op.tempUnavailableUntil),
              sortOrder: op.sortOrder,
            })),
          },
        })),
      })),
    }));
  }

  /** ===== 选项组库（Template）===== */
  async listOptionGroupTemplates(): Promise<OptionGroupTemplateDto[]> {
    const groups = await this.prisma.menuOptionGroupTemplate.findMany({
      orderBy: { sortOrder: 'asc' },
      include: { options: { orderBy: { sortOrder: 'asc' } } },
    });

    return groups.map((g) => ({
      id: g.id,
      nameEn: g.nameEn,
      nameZh: g.nameZh ?? null,
      sortOrder: g.sortOrder,
      defaultMinSelect: g.defaultMinSelect,
      defaultMaxSelect: g.defaultMaxSelect,
      isAvailable: g.isAvailable,
      tempUnavailableUntil: toIsoOrNull(g.tempUnavailableUntil),
      options: (g.options ?? []).map((op) => ({
        id: op.id,
        templateGroupId: op.templateGroupId,
        nameEn: op.nameEn,
        nameZh: op.nameZh ?? null,
        priceDeltaCents: op.priceDeltaCents,
        isAvailable: op.isAvailable,
        tempUnavailableUntil: toIsoOrNull(op.tempUnavailableUntil),
        sortOrder: op.sortOrder,
      })),
    }));
  }

  async createOptionGroupTemplate(dto: CreateOptionGroupTemplateInput): Promise<OptionGroupTemplateDto> {
    const nameEn = normalizeNameEn(dto.nameEn, 'nameEn');
    const sortOrder = asFiniteInt(dto.sortOrder, 0);

    const defaultMinSelect = Math.max(0, asFiniteInt(dto.defaultMinSelect, 0));

    const defaultMaxSelect =
      dto.defaultMaxSelect === null
        ? null
        : Math.max(0, asFiniteInt(dto.defaultMaxSelect, 1));

    const created = await this.prisma.menuOptionGroupTemplate.create({
      data: {
        nameEn,
        nameZh: normalizeOptionalString(dto.nameZh),
        sortOrder,
        defaultMinSelect,
        defaultMaxSelect,
        isAvailable: true,
        tempUnavailableUntil: null,
      },
      include: { options: { orderBy: { sortOrder: 'asc' } } },
    });

    return {
      id: created.id,
      nameEn: created.nameEn,
      nameZh: created.nameZh ?? null,
      sortOrder: created.sortOrder,
      defaultMinSelect: created.defaultMinSelect,
      defaultMaxSelect: created.defaultMaxSelect,
      isAvailable: created.isAvailable,
      tempUnavailableUntil: toIsoOrNull(created.tempUnavailableUntil),
      options: (created.options ?? []).map((op) => ({
        id: op.id,
        templateGroupId: op.templateGroupId,
        nameEn: op.nameEn,
        nameZh: op.nameZh ?? null,
        priceDeltaCents: op.priceDeltaCents,
        isAvailable: op.isAvailable,
        tempUnavailableUntil: toIsoOrNull(op.tempUnavailableUntil),
        sortOrder: op.sortOrder,
      })),
    };
  }

  async updateOptionGroupTemplate(
    id: string,
    dto: UpdateOptionGroupTemplateInput,
  ): Promise<OptionGroupTemplateDto> {
    const data: Prisma.MenuOptionGroupTemplateUpdateInput = {};

    if (dto.nameEn !== undefined) data.nameEn = normalizeNameEn(dto.nameEn, 'nameEn');
    if (dto.nameZh !== undefined) data.nameZh = normalizeOptionalString(dto.nameZh);
    if (dto.sortOrder !== undefined) data.sortOrder = asFiniteInt(dto.sortOrder, 0);

    if (dto.defaultMinSelect !== undefined) {
      data.defaultMinSelect = Math.max(0, asFiniteInt(dto.defaultMinSelect, 0));
    }

    if (dto.defaultMaxSelect === null) data.defaultMaxSelect = null;
    else if (dto.defaultMaxSelect !== undefined) {
      data.defaultMaxSelect = Math.max(0, asFiniteInt(dto.defaultMaxSelect, 1));
    }

    try {
      const updated = await this.prisma.menuOptionGroupTemplate.update({
        where: { id },
        data,
        include: { options: { orderBy: { sortOrder: 'asc' } } },
      });

      return {
        id: updated.id,
        nameEn: updated.nameEn,
        nameZh: updated.nameZh ?? null,
        sortOrder: updated.sortOrder,
        defaultMinSelect: updated.defaultMinSelect,
        defaultMaxSelect: updated.defaultMaxSelect,
        isAvailable: updated.isAvailable,
        tempUnavailableUntil: toIsoOrNull(updated.tempUnavailableUntil),
        options: (updated.options ?? []).map((op) => ({
          id: op.id,
          templateGroupId: op.templateGroupId,
          nameEn: op.nameEn,
          nameZh: op.nameZh ?? null,
          priceDeltaCents: op.priceDeltaCents,
          isAvailable: op.isAvailable,
          tempUnavailableUntil: toIsoOrNull(op.tempUnavailableUntil),
          sortOrder: op.sortOrder,
        })),
      };
    } catch {
      throw new NotFoundException('option group template not found');
    }
  }

  async setOptionGroupTemplateAvailability(
    id: string,
    mode: AvailabilityMode,
  ): Promise<OptionGroupTemplateDto> {
    const now = new Date();

    const data: Prisma.MenuOptionGroupTemplateUpdateInput =
      mode === 'ON'
        ? { isAvailable: true, tempUnavailableUntil: null }
        : mode === 'PERMANENT_OFF'
          ? { isAvailable: false, tempUnavailableUntil: null }
          : { isAvailable: true, tempUnavailableUntil: endOfTodayLocal(now) };

    try {
      const updated = await this.prisma.menuOptionGroupTemplate.update({
        where: { id },
        data,
        include: { options: { orderBy: { sortOrder: 'asc' } } },
      });

      this.logger.log(`MenuOptionGroupTemplate availability changed: id=${id} mode=${mode}`);

      return {
        id: updated.id,
        nameEn: updated.nameEn,
        nameZh: updated.nameZh ?? null,
        sortOrder: updated.sortOrder,
        defaultMinSelect: updated.defaultMinSelect,
        defaultMaxSelect: updated.defaultMaxSelect,
        isAvailable: updated.isAvailable,
        tempUnavailableUntil: toIsoOrNull(updated.tempUnavailableUntil),
        options: (updated.options ?? []).map((op) => ({
          id: op.id,
          templateGroupId: op.templateGroupId,
          nameEn: op.nameEn,
          nameZh: op.nameZh ?? null,
          priceDeltaCents: op.priceDeltaCents,
          isAvailable: op.isAvailable,
          tempUnavailableUntil: toIsoOrNull(op.tempUnavailableUntil),
          sortOrder: op.sortOrder,
        })),
      };
    } catch {
      throw new NotFoundException('option group template not found');
    }
  }

  async createTemplateOption(dto: CreateTemplateOptionInput): Promise<MenuOptionTemplateChoiceDto> {
    if (!dto.templateGroupId) throw new BadRequestException('templateGroupId is required');

    const group = await this.prisma.menuOptionGroupTemplate.findUnique({
      where: { id: dto.templateGroupId },
      select: { id: true },
    });
    if (!group) throw new NotFoundException('option group template not found');

    const nameEn = normalizeNameEn(dto.nameEn, 'nameEn');

    const priceDeltaCents =
      typeof dto.priceDeltaCents === 'number' && Number.isFinite(dto.priceDeltaCents)
        ? Math.round(dto.priceDeltaCents)
        : 0;

    const sortOrder = asFiniteInt(dto.sortOrder, 0);

    const created = await this.prisma.menuOptionTemplateChoice.create({
      data: {
        templateGroupId: dto.templateGroupId,
        nameEn,
        nameZh: normalizeOptionalString(dto.nameZh),
        priceDeltaCents,
        sortOrder,
        isAvailable: true,
        tempUnavailableUntil: null,
      },
    });

    return {
      id: created.id,
      templateGroupId: created.templateGroupId,
      nameEn: created.nameEn,
      nameZh: created.nameZh ?? null,
      priceDeltaCents: created.priceDeltaCents,
      isAvailable: created.isAvailable,
      tempUnavailableUntil: toIsoOrNull(created.tempUnavailableUntil),
      sortOrder: created.sortOrder,
    };
  }

  /** ===== 分类 ===== */
  async createCategory(dto?: CreateCategoryInput): Promise<MenuCategoryDto> {
    const nameEn = normalizeNameEn(dto?.nameEn, 'nameEn');
    const nameZh = normalizeOptionalString(dto?.nameZh);
    const sortOrder = asFiniteInt(dto?.sortOrder, 0);

    const created = await this.prisma.menuCategory.create({
      data: { nameEn, nameZh, sortOrder, isActive: true },
    });

    return {
      id: created.id,
      nameEn: created.nameEn,
      nameZh: created.nameZh ?? null,
      sortOrder: created.sortOrder,
      isActive: created.isActive,
    };
  }

  async updateCategory(id: string, dto: UpdateCategoryInput): Promise<MenuCategoryDto> {
    const data: Prisma.MenuCategoryUpdateInput = {};

    if (dto.nameEn !== undefined) data.nameEn = normalizeNameEn(dto.nameEn, 'nameEn');
    if (dto.nameZh !== undefined) data.nameZh = normalizeOptionalString(dto.nameZh);
    if (dto.sortOrder !== undefined) data.sortOrder = asFiniteInt(dto.sortOrder, 0);
    if (dto.isActive !== undefined) data.isActive = dto.isActive;

    if (Object.keys(data).length === 0) {
      const existing = await this.prisma.menuCategory.findUnique({ where: { id } });
      if (!existing) throw new NotFoundException('category not found');
      return {
        id: existing.id,
        nameEn: existing.nameEn,
        nameZh: existing.nameZh ?? null,
        sortOrder: existing.sortOrder,
        isActive: existing.isActive,
      };
    }

    try {
      const updated = await this.prisma.menuCategory.update({ where: { id }, data });
      return {
        id: updated.id,
        nameEn: updated.nameEn,
        nameZh: updated.nameZh ?? null,
        sortOrder: updated.sortOrder,
        isActive: updated.isActive,
      };
    } catch {
      throw new NotFoundException('category not found');
    }
  }

  /** ===== 菜品 ===== */
  async createItem(dto: CreateItemInput): Promise<MenuItemDto> {
    if (!dto.categoryId) throw new BadRequestException('categoryId is required');

    const stableId = normalizeNameEn(dto.stableId, 'stableId');
    const nameEn = normalizeNameEn(dto.nameEn, 'nameEn');

    if (typeof dto.basePriceCents !== 'number' || !Number.isFinite(dto.basePriceCents)) {
      throw new BadRequestException('basePriceCents must be a finite number');
    }

    const created = await this.prisma.menuItem.create({
      data: {
        categoryId: dto.categoryId,
        stableId,
        nameEn,
        nameZh: normalizeOptionalString(dto.nameZh),
        imageUrl: normalizeOptionalString(dto.imageUrl),
        ingredientsEn: normalizeOptionalString(dto.ingredientsEn),
        ingredientsZh: normalizeOptionalString(dto.ingredientsZh),
        basePriceCents: Math.round(dto.basePriceCents),
        sortOrder: asFiniteInt(dto.sortOrder, 0),
        isAvailable: true,
        isVisible: true,
        tempUnavailableUntil: null,
      },
    });

    return {
      id: created.id,
      categoryId: created.categoryId,
      stableId: created.stableId,
      nameEn: created.nameEn,
      nameZh: created.nameZh ?? null,
      basePriceCents: created.basePriceCents,
      sortOrder: created.sortOrder,
      imageUrl: created.imageUrl ?? null,
      ingredientsEn: created.ingredientsEn ?? null,
      ingredientsZh: created.ingredientsZh ?? null,
      isAvailable: created.isAvailable,
      isVisible: created.isVisible,
      tempUnavailableUntil: toIsoOrNull(created.tempUnavailableUntil),
    };
  }

  async updateItem(id: string, dto: UpdateItemInput): Promise<MenuItemDto> {
    const data: Prisma.MenuItemUpdateInput = {};

    if (dto.categoryId !== undefined) data.categoryId = dto.categoryId;
    if (dto.nameEn !== undefined) data.nameEn = normalizeNameEn(dto.nameEn, 'nameEn');
    if (dto.nameZh !== undefined) data.nameZh = normalizeOptionalString(dto.nameZh);
    if (dto.imageUrl !== undefined) data.imageUrl = normalizeOptionalString(dto.imageUrl);
    if (dto.ingredientsEn !== undefined) data.ingredientsEn = normalizeOptionalString(dto.ingredientsEn);
    if (dto.ingredientsZh !== undefined) data.ingredientsZh = normalizeOptionalString(dto.ingredientsZh);

    if (dto.basePriceCents !== undefined) {
      if (typeof dto.basePriceCents !== 'number' || !Number.isFinite(dto.basePriceCents)) {
        throw new BadRequestException('basePriceCents must be a finite number');
      }
      data.basePriceCents = Math.round(dto.basePriceCents);
    }

    if (dto.isAvailable !== undefined) data.isAvailable = dto.isAvailable;
    if (dto.isVisible !== undefined) data.isVisible = dto.isVisible;
    if (dto.sortOrder !== undefined) data.sortOrder = asFiniteInt(dto.sortOrder, 0);

    if (Object.keys(data).length === 0) {
      const existing = await this.prisma.menuItem.findUnique({ where: { id } });
      if (!existing) throw new NotFoundException('item not found');
      return {
        id: existing.id,
        categoryId: existing.categoryId,
        stableId: existing.stableId,
        nameEn: existing.nameEn,
        nameZh: existing.nameZh ?? null,
        basePriceCents: existing.basePriceCents,
        sortOrder: existing.sortOrder,
        imageUrl: existing.imageUrl ?? null,
        ingredientsEn: existing.ingredientsEn ?? null,
        ingredientsZh: existing.ingredientsZh ?? null,
        isAvailable: existing.isAvailable,
        isVisible: existing.isVisible,
        tempUnavailableUntil: toIsoOrNull(existing.tempUnavailableUntil),
      };
    }

    try {
      const updated = await this.prisma.menuItem.update({ where: { id }, data });
      return {
        id: updated.id,
        categoryId: updated.categoryId,
        stableId: updated.stableId,
        nameEn: updated.nameEn,
        nameZh: updated.nameZh ?? null,
        basePriceCents: updated.basePriceCents,
        sortOrder: updated.sortOrder,
        imageUrl: updated.imageUrl ?? null,
        ingredientsEn: updated.ingredientsEn ?? null,
        ingredientsZh: updated.ingredientsZh ?? null,
        isAvailable: updated.isAvailable,
        isVisible: updated.isVisible,
        tempUnavailableUntil: toIsoOrNull(updated.tempUnavailableUntil),
      };
    } catch {
      throw new NotFoundException('item not found');
    }
  }

  async setItemAvailability(id: string, mode: AvailabilityMode): Promise<MenuItemDto> {
    const now = new Date();

    const data: Prisma.MenuItemUpdateInput =
      mode === 'ON'
        ? { isAvailable: true, tempUnavailableUntil: null }
        : mode === 'PERMANENT_OFF'
          ? { isAvailable: false, tempUnavailableUntil: null }
          : { isAvailable: true, tempUnavailableUntil: endOfTodayLocal(now) };

    try {
      const updated = await this.prisma.menuItem.update({ where: { id }, data });
      this.logger.log(`MenuItem availability changed: id=${id} mode=${mode}`);

      return {
        id: updated.id,
        categoryId: updated.categoryId,
        stableId: updated.stableId,
        nameEn: updated.nameEn,
        nameZh: updated.nameZh ?? null,
        basePriceCents: updated.basePriceCents,
        sortOrder: updated.sortOrder,
        imageUrl: updated.imageUrl ?? null,
        ingredientsEn: updated.ingredientsEn ?? null,
        ingredientsZh: updated.ingredientsZh ?? null,
        isAvailable: updated.isAvailable,
        isVisible: updated.isVisible,
        tempUnavailableUntil: toIsoOrNull(updated.tempUnavailableUntil),
      };
    } catch {
      throw new NotFoundException('item not found');
    }
  }

  /** ===== 菜品绑定（Attach / Update / Detach）===== */
  async attachOptionGroup(dto: AttachOptionGroupInput): Promise<MenuItemOptionGroupDto> {
    if (!dto.itemId) throw new BadRequestException('itemId is required');
    if (!dto.templateGroupId) throw new BadRequestException('templateGroupId is required');

    const item = await this.prisma.menuItem.findUnique({
      where: { id: dto.itemId },
      select: { id: true },
    });
    if (!item) throw new NotFoundException('item not found');

    const tmpl = await this.prisma.menuOptionGroupTemplate.findUnique({
      where: { id: dto.templateGroupId },
      select: { id: true, defaultMinSelect: true, defaultMaxSelect: true },
    });
    if (!tmpl) throw new NotFoundException('option group template not found');

    const minSelect =
      typeof dto.minSelect === 'number' && Number.isFinite(dto.minSelect)
        ? Math.max(0, Math.floor(dto.minSelect))
        : tmpl.defaultMinSelect;

    const maxSelect =
      dto.maxSelect === null
        ? null
        : typeof dto.maxSelect === 'number' && Number.isFinite(dto.maxSelect)
          ? Math.max(0, Math.floor(dto.maxSelect))
          : tmpl.defaultMaxSelect;

    const sortOrder = asFiniteInt(dto.sortOrder, 0);
    const isEnabled = dto.isEnabled !== undefined ? dto.isEnabled : true;

    try {
      const created = await this.prisma.menuItemOptionGroup.create({
        data: {
          itemId: dto.itemId,
          templateGroupId: dto.templateGroupId,
          minSelect,
          maxSelect,
          sortOrder,
          isEnabled,
        },
      });

      return {
        id: created.id,
        itemId: created.itemId,
        templateGroupId: created.templateGroupId,
        minSelect: created.minSelect,
        maxSelect: created.maxSelect,
        sortOrder: created.sortOrder,
        isEnabled: created.isEnabled,
      };
    } catch {
      throw new BadRequestException('this template group is already attached to the item');
    }
  }

  async updateAttachedOptionGroup(
    id: string,
    dto: UpdateAttachedOptionGroupInput,
  ): Promise<MenuItemOptionGroupDto> {
    const data: Prisma.MenuItemOptionGroupUpdateInput = {};

    if (dto.templateGroupId !== undefined) data.templateGroupId = dto.templateGroupId;
    if (dto.sortOrder !== undefined) data.sortOrder = asFiniteInt(dto.sortOrder, 0);
    if (dto.isEnabled !== undefined) data.isEnabled = dto.isEnabled;

    if (dto.minSelect === null) data.minSelect = 0;
    else if (dto.minSelect !== undefined) {
      if (typeof dto.minSelect !== 'number' || !Number.isFinite(dto.minSelect)) {
        throw new BadRequestException('minSelect must be a finite number or null');
      }
      data.minSelect = Math.max(0, Math.floor(dto.minSelect));
    }

    if (dto.maxSelect === null) data.maxSelect = null;
    else if (dto.maxSelect !== undefined) {
      if (typeof dto.maxSelect !== 'number' || !Number.isFinite(dto.maxSelect)) {
        throw new BadRequestException('maxSelect must be a finite number or null');
      }
      data.maxSelect = Math.max(0, Math.floor(dto.maxSelect));
    }

    try {
      const updated = await this.prisma.menuItemOptionGroup.update({
        where: { id },
        data,
      });

      return {
        id: updated.id,
        itemId: updated.itemId,
        templateGroupId: updated.templateGroupId,
        minSelect: updated.minSelect,
        maxSelect: updated.maxSelect,
        sortOrder: updated.sortOrder,
        isEnabled: updated.isEnabled,
      };
    } catch {
      throw new NotFoundException('attached option group not found');
    }
  }

  async detachOptionGroup(id: string): Promise<void> {
    try {
      await this.prisma.menuItemOptionGroup.delete({ where: { id } });
      this.logger.log(`MenuItemOptionGroup detached: id=${id}`);
    } catch {
      throw new NotFoundException('attached option group not found');
    }
  }

  /** ===== 模板选项（全局）===== */
  async updateTemplateOption(
    id: string,
    dto: UpdateTemplateOptionInput,
  ): Promise<MenuOptionTemplateChoiceDto> {
    const data: Prisma.MenuOptionTemplateChoiceUpdateInput = {};

    if (dto.nameEn !== undefined) data.nameEn = normalizeNameEn(dto.nameEn, 'nameEn');
    if (dto.nameZh !== undefined) data.nameZh = normalizeOptionalString(dto.nameZh);

    if (dto.priceDeltaCents !== undefined) {
      if (typeof dto.priceDeltaCents !== 'number' || !Number.isFinite(dto.priceDeltaCents)) {
        throw new BadRequestException('priceDeltaCents must be a finite number');
      }
      data.priceDeltaCents = Math.round(dto.priceDeltaCents);
    }

    if (dto.sortOrder !== undefined) data.sortOrder = asFiniteInt(dto.sortOrder, 0);
    if (dto.isAvailable !== undefined) data.isAvailable = dto.isAvailable;

    if (Object.keys(data).length === 0) {
      const existing = await this.prisma.menuOptionTemplateChoice.findUnique({ where: { id } });
      if (!existing) throw new NotFoundException('option not found');
      return {
        id: existing.id,
        templateGroupId: existing.templateGroupId,
        nameEn: existing.nameEn,
        nameZh: existing.nameZh ?? null,
        priceDeltaCents: existing.priceDeltaCents,
        isAvailable: existing.isAvailable,
        tempUnavailableUntil: toIsoOrNull(existing.tempUnavailableUntil),
        sortOrder: existing.sortOrder,
      };
    }

    try {
      const updated = await this.prisma.menuOptionTemplateChoice.update({ where: { id }, data });
      return {
        id: updated.id,
        templateGroupId: updated.templateGroupId,
        nameEn: updated.nameEn,
        nameZh: updated.nameZh ?? null,
        priceDeltaCents: updated.priceDeltaCents,
        isAvailable: updated.isAvailable,
        tempUnavailableUntil: toIsoOrNull(updated.tempUnavailableUntil),
        sortOrder: updated.sortOrder,
      };
    } catch {
      throw new NotFoundException('option not found');
    }
  }

  async deleteTemplateOption(id: string): Promise<void> {
    try {
      await this.prisma.menuOptionTemplateChoice.delete({ where: { id } });
      this.logger.log(`MenuOptionTemplateChoice deleted: id=${id}`);
    } catch {
      throw new NotFoundException('option not found');
    }
  }

  async setTemplateOptionAvailability(
    id: string,
    mode: AvailabilityMode,
  ): Promise<MenuOptionTemplateChoiceDto> {
    const now = new Date();

    const data: Prisma.MenuOptionTemplateChoiceUpdateInput =
      mode === 'ON'
        ? { isAvailable: true, tempUnavailableUntil: null }
        : mode === 'PERMANENT_OFF'
          ? { isAvailable: false, tempUnavailableUntil: null }
          : { isAvailable: true, tempUnavailableUntil: endOfTodayLocal(now) };

    try {
      const updated = await this.prisma.menuOptionTemplateChoice.update({ where: { id }, data });
      this.logger.log(`MenuOptionTemplateChoice availability changed: id=${id} mode=${mode}`);

      return {
        id: updated.id,
        templateGroupId: updated.templateGroupId,
        nameEn: updated.nameEn,
        nameZh: updated.nameZh ?? null,
        priceDeltaCents: updated.priceDeltaCents,
        isAvailable: updated.isAvailable,
        tempUnavailableUntil: toIsoOrNull(updated.tempUnavailableUntil),
        sortOrder: updated.sortOrder,
      };
    } catch {
      throw new NotFoundException('option not found');
    }
  }
}
