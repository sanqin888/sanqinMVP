// apps/api/src/admin/menu/admin-menu.service.ts
import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { AppLogger } from '../../common/app-logger';
import {
  AdminMenuCategoryDto,
  AdminMenuFullResponse,
  MenuOptionGroupBindingDto,
  TemplateGroupFullDto,
  TemplateGroupLiteDto,
} from '@shared/menu';

type AvailabilityMode = 'ON' | 'PERMANENT_OFF' | 'TEMP_TODAY_OFF';

function toIso(value: Date | null | undefined): string | null {
  return value ? value.toISOString() : null;
}

function parseIsoOrNull(v: unknown): Date | null {
  if (v === null || v === undefined || v === '') return null;
  if (typeof v !== 'string')
    throw new BadRequestException(
      'tempUnavailableUntil must be ISO string or null',
    );
  const t = Date.parse(v);
  if (!Number.isFinite(t))
    throw new BadRequestException(
      'tempUnavailableUntil must be valid ISO string',
    );
  return new Date(t);
}

function nextMidnightLocal(): Date {
  const d = new Date();
  d.setHours(24, 0, 0, 0); // next local midnight
  return d;
}

@Injectable()
export class AdminMenuService {
  private readonly logger = new AppLogger(AdminMenuService.name);

  constructor(private readonly prisma: PrismaService) {}

  // ========= Full menu for admin =========
  async getFullMenu(): Promise<AdminMenuFullResponse> {
    const [categories, templateGroups] = await Promise.all([
      this.prisma.menuCategory.findMany({
        where: { deletedAt: null },
        orderBy: { sortOrder: 'asc' },
        include: {
          items: {
            where: { deletedAt: null },
            orderBy: { sortOrder: 'asc' },
            include: {
              category: { select: { stableId: true } },
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
    ]);

    const templatesLite: TemplateGroupLiteDto[] = (templateGroups ?? []).map(
      (g) => ({
        templateGroupStableId: g.stableId,
        nameEn: g.nameEn,
        nameZh: g.nameZh ?? null,
        defaultMinSelect: g.defaultMinSelect,
        defaultMaxSelect: g.defaultMaxSelect ?? null,
        isAvailable: g.isAvailable,
        tempUnavailableUntil: toIso(g.tempUnavailableUntil),
        sortOrder: g.sortOrder,
      }),
    );

    const categoryDtos: AdminMenuCategoryDto[] = (categories ?? []).map(
      (cat) => {
        const categoryStableId = cat.stableId;

        const items = (cat.items ?? []).map((it) => {
          const optionGroups: MenuOptionGroupBindingDto[] = (
            it.optionGroups ?? []
          )
            .filter(
              (link) =>
                link.templateGroup && link.templateGroup.deletedAt == null,
            )
            .map((link) => {
              const tg = link.templateGroup;

              const template: TemplateGroupLiteDto = {
                templateGroupStableId: tg.stableId,
                nameEn: tg.nameEn,
                nameZh: tg.nameZh ?? null,
                defaultMinSelect: tg.defaultMinSelect,
                defaultMaxSelect: tg.defaultMaxSelect ?? null,
                isAvailable: tg.isAvailable,
                tempUnavailableUntil: toIso(tg.tempUnavailableUntil),
                sortOrder: tg.sortOrder,
              };

              return {
                templateGroupStableId: tg.stableId,
                bindingStableId: null,
                minSelect: link.minSelect,
                maxSelect: link.maxSelect,
                sortOrder: link.sortOrder,
                isEnabled: link.isEnabled,
                template,
              };
            });

          return {
            stableId: it.stableId,
            categoryStableId,
            nameEn: it.nameEn,
            nameZh: it.nameZh ?? null,
            basePriceCents: it.basePriceCents,
            isAvailable: it.isAvailable,
            isVisible: it.isVisible,
            tempUnavailableUntil: toIso(it.tempUnavailableUntil),
            sortOrder: it.sortOrder,
            imageUrl: it.imageUrl ?? null,
            ingredientsEn: it.ingredientsEn ?? null,
            ingredientsZh: it.ingredientsZh ?? null,
            optionGroups,
          };
        });

        return {
          stableId: categoryStableId,
          sortOrder: cat.sortOrder,
          nameEn: cat.nameEn,
          nameZh: cat.nameZh ?? null,
          isActive: cat.isActive,
          items,
        };
      },
    );

    this.logger.log(
      `Admin full menu generated: categories=${categoryDtos.length} templatesLite=${templatesLite.length}`,
    );
    return { categories: categoryDtos, templatesLite };
  }

  // ========= Category =========
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

  // ========= Item =========
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
    isVisible?: boolean;
    tempUnavailableUntil?: string | null;
  }) {
    const categoryStableId = (body.categoryStableId ?? '').trim();
    if (!categoryStableId)
      throw new BadRequestException('categoryStableId is required');

    const category = await this.prisma.menuCategory.findFirst({
      where: { stableId: categoryStableId, deletedAt: null },
      select: { id: true },
    });
    if (!category)
      throw new NotFoundException(`Category not found: ${categoryStableId}`);

    // ✅ stableId：允许不传；不传则走 schema 的 @default(cuid())
    const stableIdRaw =
      typeof body.stableId === 'string' ? body.stableId.trim() : '';
    const stableId = stableIdRaw.length > 0 ? stableIdRaw : undefined;

    const nameEn = (body.nameEn ?? '').trim();
    if (!nameEn) throw new BadRequestException('nameEn is required');
    if (!Number.isFinite(body.basePriceCents))
      throw new BadRequestException('basePriceCents is required');

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
        isVisible: typeof body.isVisible === 'boolean' ? body.isVisible : true,
        tempUnavailableUntil: parseIsoOrNull(body.tempUnavailableUntil),

        deletedAt: null,
      },
      select: { stableId: true },
    });

    return { stableId: created.stableId };
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
      isVisible?: boolean;
      tempUnavailableUntil?: string | null;
    },
  ) {
    const stableId = (itemStableId ?? '').trim();
    if (!stableId) throw new BadRequestException('itemStableId is required');

    // ✅ 软删除后视为不存在
    const existing = await this.prisma.menuItem.findFirst({
      where: { stableId, deletedAt: null },
      select: { id: true },
    });
    if (!existing) throw new NotFoundException(`Item not found: ${stableId}`);

    let categoryId: string | undefined = undefined;
    if (body.categoryStableId) {
      const cat = await this.prisma.menuCategory.findFirst({
        where: { stableId: body.categoryStableId.trim(), deletedAt: null },
        select: { id: true },
      });
      if (!cat)
        throw new NotFoundException(
          `Category not found: ${body.categoryStableId}`,
        );
      categoryId = cat.id;
    }

    // ✅ 标准 2：只允许创建时写入 stableId（这里不更新 stableId）
    await this.prisma.menuItem.update({
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
        isVisible: body.isVisible === undefined ? undefined : body.isVisible,
        tempUnavailableUntil:
          body.tempUnavailableUntil === undefined
            ? undefined
            : parseIsoOrNull(body.tempUnavailableUntil),
      },
    });

    return { ok: true };
  }

  // ========= Templates =========
  async listOptionGroupTemplates(): Promise<TemplateGroupFullDto[]> {
    const groups = await this.prisma.menuOptionGroupTemplate.findMany({
      where: { deletedAt: null },
      orderBy: { sortOrder: 'asc' },
      include: {
        options: {
          where: { deletedAt: null },
          orderBy: { sortOrder: 'asc' },
        },
      },
    });

    return (groups ?? []).map((g) => {
      const templateGroupStableId = g.stableId;
      return {
        templateGroupStableId,

        nameEn: g.nameEn,
        nameZh: g.nameZh ?? null,

        defaultMinSelect: g.defaultMinSelect,
        defaultMaxSelect: g.defaultMaxSelect ?? null,

        isAvailable: g.isAvailable,
        tempUnavailableUntil: toIso(g.tempUnavailableUntil),

        sortOrder: g.sortOrder,

        options: (g.options ?? []).map((o) => ({
          optionStableId: o.stableId,
          templateGroupStableId,

          nameEn: o.nameEn,
          nameZh: o.nameZh ?? null,
          priceDeltaCents: o.priceDeltaCents,

          isAvailable: o.isAvailable,
          tempUnavailableUntil: toIso(o.tempUnavailableUntil),
          sortOrder: o.sortOrder,
        })),
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

  async setTemplateGroupAvailability(
    templateGroupStableId: string,
    mode: AvailabilityMode,
  ) {
    const stableId = templateGroupStableId.trim();

    const exists = await this.prisma.menuOptionGroupTemplate.findFirst({
      where: { stableId, deletedAt: null },
      select: { id: true },
    });
    if (!exists)
      throw new NotFoundException(`Template group not found: ${stableId}`);

    const data =
      mode === 'ON'
        ? { isAvailable: true, tempUnavailableUntil: null }
        : mode === 'PERMANENT_OFF'
          ? { isAvailable: false, tempUnavailableUntil: null }
          : { isAvailable: true, tempUnavailableUntil: nextMidnightLocal() };

    await this.prisma.menuOptionGroupTemplate.update({
      where: { stableId },
      data,
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
    },
  ) {
    const groupStableId = templateGroupStableId.trim();

    const group = await this.prisma.menuOptionGroupTemplate.findFirst({
      where: { stableId: groupStableId, deletedAt: null },
      select: { id: true, stableId: true },
    });
    if (!group)
      throw new NotFoundException(`Template group not found: ${groupStableId}`);

    const nameEn = (body.nameEn ?? '').trim();
    if (!nameEn) throw new BadRequestException('nameEn is required');

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
    },
  ) {
    const stableId = optionStableId.trim();

    const exists = await this.prisma.menuOptionTemplateChoice.findFirst({
      where: { stableId, deletedAt: null },
      select: { id: true },
    });
    if (!exists) throw new NotFoundException(`Option not found: ${stableId}`);

    // ✅ 标准 2：只允许创建时写入 stableId（这里不更新 stableId）
    await this.prisma.menuOptionTemplateChoice.update({
      where: { stableId },
      data: {
        nameEn: body.nameEn === undefined ? undefined : body.nameEn.trim(),
        nameZh:
          body.nameZh === undefined ? undefined : body.nameZh?.trim() || null,
        priceDeltaCents:
          body.priceDeltaCents === undefined
            ? undefined
            : Math.round(body.priceDeltaCents),
        sortOrder:
          body.sortOrder === undefined ? undefined : Math.floor(body.sortOrder),
      },
    });

    return { ok: true };
  }

  async setTemplateOptionAvailability(
    optionStableId: string,
    mode: AvailabilityMode,
  ) {
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

    await this.prisma.menuOptionTemplateChoice.update({
      where: { stableId },
      data,
    });

    return { ok: true };
  }

  // ✅ 标准 3：软删除（deletedAt 写入），不物理删除，保证 stableId 永不复用
  async deleteTemplateOption(optionStableId: string) {
    const stableId = optionStableId.trim();

    const res = await this.prisma.menuOptionTemplateChoice.updateMany({
      where: { stableId, deletedAt: null },
      data: {
        deletedAt: new Date(),
      },
    });

    if (res.count === 0) {
      throw new NotFoundException(`Option not found: ${stableId}`);
    }

    return { ok: true };
  }

  // ========= Bindings =========
  async bindTemplateGroupToItem(
    itemStableId: string,
    body: {
      templateGroupStableId: string;
      minSelect: number;
      maxSelect: number | null;
      sortOrder: number;
      isEnabled: boolean;
    },
  ) {
    const item = await this.prisma.menuItem.findFirst({
      where: { stableId: itemStableId.trim(), deletedAt: null },
      select: { id: true },
    });
    if (!item) throw new NotFoundException(`Item not found: ${itemStableId}`);

    const tg = await this.prisma.menuOptionGroupTemplate.findFirst({
      where: { stableId: body.templateGroupStableId.trim(), deletedAt: null },
      select: { id: true },
    });
    if (!tg)
      throw new NotFoundException(
        `Template group not found: ${body.templateGroupStableId}`,
      );

    await this.prisma.menuItemOptionGroup.upsert({
      where: {
        itemId_templateGroupId: {
          itemId: item.id,
          templateGroupId: tg.id,
        },
      },
      create: {
        itemId: item.id,
        templateGroupId: tg.id,
        minSelect: Math.max(0, Math.floor(body.minSelect ?? 0)),
        maxSelect:
          body.maxSelect == null
            ? null
            : Math.max(0, Math.floor(body.maxSelect)),
        sortOrder: Number.isFinite(body.sortOrder)
          ? Math.floor(body.sortOrder)
          : 0,
        isEnabled: !!body.isEnabled,
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

    const tg = await this.prisma.menuOptionGroupTemplate.findFirst({
      where: { stableId: templateGroupStableId.trim(), deletedAt: null },
      select: { id: true },
    });
    if (!tg)
      throw new NotFoundException(
        `Template group not found: ${templateGroupStableId}`,
      );

    await this.prisma.menuItemOptionGroup.delete({
      where: {
        itemId_templateGroupId: {
          itemId: item.id,
          templateGroupId: tg.id,
        },
      },
    });

    return { ok: true };
  }
}
