// apps/api/src/admin/menu/admin-menu.service.ts
import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { AppLogger } from '../../common/app-logger';
import {
  DailySpecialDto,
  AdminMenuCategoryDto,
  AdminMenuFullResponse,
  MenuOptionGroupBindingDto,
  TemplateGroupFullDto,
  TemplateGroupLiteDto,
} from '@shared/menu';
import {
  isDailySpecialActiveNow,
  resolveEffectivePriceCents,
  resolveStoreNow,
} from '../../common/daily-specials';
import type { Prisma } from '@prisma/client';
import { SpecialPricingMode } from '@prisma/client';

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

  async setCategoryActive(
    categoryStableId: string,
    isActive: boolean,
  ): Promise<{ stableId: string; isActive: boolean }> {
    if (typeof isActive !== 'boolean') {
      throw new BadRequestException('isActive must be boolean');
    }

    try {
      const updated = await this.prisma.menuCategory.update({
        where: { stableId: categoryStableId },
        data: { isActive },
        select: { stableId: true, isActive: true },
      });

      return { stableId: updated.stableId, isActive: updated.isActive };
    } catch {
      // Prisma update 找不到会抛错；这里统一转 404
      throw new NotFoundException('Menu category not found');
    }
  }

  // ========= Full menu for admin =========
  async getFullMenu(): Promise<AdminMenuFullResponse> {
    const businessConfig = await this.ensureBusinessConfig();
    const now = resolveStoreNow(businessConfig.timezone);
    const weekday = now.weekday;
    const rawDailySpecials = await this.prisma.menuDailySpecial.findMany({
      where: {
        weekday,
        isEnabled: true,
        deletedAt: null,
      },
      orderBy: [{ sortOrder: 'asc' }, { createdAt: 'asc' }],
    });

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
          const activeSpecial =
            rawDailySpecials.find(
              (special) =>
                special.itemStableId === it.stableId &&
                isDailySpecialActiveNow(special, now),
            ) ?? null;
          const effectivePriceCents = activeSpecial
            ? resolveEffectivePriceCents(it.basePriceCents, activeSpecial)
            : undefined;

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
            effectivePriceCents,
            activeSpecial: activeSpecial
              ? {
                  stableId: activeSpecial.stableId,
                  effectivePriceCents: effectivePriceCents ?? it.basePriceCents,
                  pricingMode: activeSpecial.pricingMode,
                  disallowCoupons: activeSpecial.disallowCoupons,
                }
              : null,
            isAvailable: it.isAvailable,
            visibility: it.visibility,
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
    const itemBasePriceMap = new Map(
      categoryDtos.flatMap((cat) =>
        (cat.items ?? []).map((item) => [item.stableId, item.basePriceCents]),
      ),
    );
    const dailySpecials: DailySpecialDto[] = [];

    for (const special of rawDailySpecials) {
      if (!isDailySpecialActiveNow(special, now)) continue;
      const basePriceCents = itemBasePriceMap.get(special.itemStableId);
      if (basePriceCents === undefined) continue;
      const effectivePriceCents = resolveEffectivePriceCents(
        basePriceCents,
        special,
      );

      dailySpecials.push({
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
        effectivePriceCents,
      });
    }

    dailySpecials.sort(
      (a, b) =>
        (a as { sortOrder: number }).sortOrder -
        (b as { sortOrder: number }).sortOrder,
    );

    return { categories: categoryDtos, templatesLite, dailySpecials };
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
    visibility?: 'PUBLIC' | 'HIDDEN';
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
        visibility: body.visibility ?? 'PUBLIC',
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
      visibility?: 'PUBLIC' | 'HIDDEN';
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
        visibility: body.visibility === undefined ? undefined : body.visibility,
        tempUnavailableUntil:
          body.tempUnavailableUntil === undefined
            ? undefined
            : parseIsoOrNull(body.tempUnavailableUntil),
      },
    });

    return { ok: true };
  }

  async setItemAvailability(itemStableId: string, mode: AvailabilityMode) {
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
        tempUnavailableUntil: true,
      },
    });

    return {
      stableId: updated.stableId,
      isAvailable: updated.isAvailable,
      visibility: updated.visibility,
      tempUnavailableUntil: toIso(updated.tempUnavailableUntil),
    };
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
          include: {
            childLinks: {
              include: {
                childOption: { select: { stableId: true } },
              },
            },
          },
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
          childOptionStableIds: (o.childLinks ?? []).map(
            (link) => link.childOption.stableId,
          ),
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
    if (!exists)
      throw new NotFoundException(`Template group not found: ${stableId}`);

    const nameEn =
      body.nameEn === undefined ? undefined : (body.nameEn ?? '').trim();
    if (nameEn !== undefined && !nameEn) {
      throw new BadRequestException('nameEn is required');
    }

    const updateData = {
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
    };

    await this.prisma.menuOptionGroupTemplate.update({
      where: { stableId },
      data: updateData,
    });

    return { ok: true };
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
      childOptionStableIds?: string[];
    },
  ) {
    const stableId = optionStableId.trim();

    const exists = await this.prisma.menuOptionTemplateChoice.findFirst({
      where: { stableId, deletedAt: null },
      select: { id: true, templateGroupId: true },
    });
    if (!exists) throw new NotFoundException(`Option not found: ${stableId}`);

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
    };

    if (body.childOptionStableIds === undefined) {
      // ✅ 标准 2：只允许创建时写入 stableId（这里不更新 stableId）
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

    const ops: Prisma.PrismaPromise<unknown>[] = [];
    if (Object.values(updateData).some((value) => value !== undefined)) {
      ops.push(
        this.prisma.menuOptionTemplateChoice.update({
          where: { stableId },
          data: updateData,
        }),
      );
    }

    ops.push(
      this.prisma.menuOptionChoiceLink.deleteMany({
        where: { parentOptionId: exists.id },
      }),
    );

    if (childOptions.length > 0) {
      ops.push(
        this.prisma.menuOptionChoiceLink.createMany({
          data: childOptions.map((opt) => ({
            parentOptionId: exists.id,
            childOptionId: opt.id,
          })),
        }),
      );
    }

    await this.prisma.$transaction(ops);

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

  async getDailySpecials(
    weekday?: number,
  ): Promise<{ specials: DailySpecialDto[] }> {
    if (weekday !== undefined && (weekday < 1 || weekday > 5)) {
      throw new BadRequestException('weekday must be between 1 and 5');
    }

    const specials = await this.prisma.menuDailySpecial.findMany({
      where: {
        deletedAt: null,
        ...(weekday ? { weekday } : { weekday: { in: [1, 2, 3, 4, 5] } }),
      },
      include: {
        item: {
          select: {
            basePriceCents: true,
          },
        },
      },
      orderBy: [{ weekday: 'asc' }, { sortOrder: 'asc' }, { createdAt: 'asc' }],
    });

    const results: DailySpecialDto[] = specials.map((special) => {
      const basePriceCents = special.item?.basePriceCents ?? 0;
      const effectivePriceCents = resolveEffectivePriceCents(
        basePriceCents,
        special,
      );

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
        effectivePriceCents,
      };
    });

    return { specials: results };
  }

  async upsertDailySpecials(payload: {
    specials: Array<{
      stableId?: string | null;
      weekday: number;
      itemStableId: string;
      pricingMode: SpecialPricingMode;
      overridePriceCents?: number | null;
      discountDeltaCents?: number | null;
      discountPercent?: number | null;
      startDate?: string | null;
      endDate?: string | null;
      startMinutes?: number | null;
      endMinutes?: number | null;
      disallowCoupons?: boolean;
      isEnabled?: boolean;
      sortOrder?: number;
    }>;
  }): Promise<{ specials: DailySpecialDto[] }> {
    if (!payload || !Array.isArray(payload.specials)) {
      throw new BadRequestException('specials must be an array');
    }

    const normalized = payload.specials.map((raw) => {
      const weekday = Number(raw.weekday);
      if (!Number.isInteger(weekday) || weekday < 1 || weekday > 5) {
        throw new BadRequestException('weekday must be between 1 and 5');
      }
      const itemStableId = raw.itemStableId?.trim();
      if (!itemStableId) {
        throw new BadRequestException('itemStableId is required');
      }
      if (!Object.values(SpecialPricingMode).includes(raw.pricingMode)) {
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

      const startDate = raw.startDate ? parseIsoOrNull(raw.startDate) : null;
      const endDate = raw.endDate ? parseIsoOrNull(raw.endDate) : null;

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
        startDate,
        endDate,
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
      if (uniqueKeySet.has(key)) {
        duplicates.add(key);
      }
      uniqueKeySet.add(key);
    }
    if (duplicates.size > 0) {
      throw new BadRequestException(
        'duplicate daily specials found for the same weekday and item',
      );
    }

    const itemStableIds = normalized.map((special) => special.itemStableId);
    const items = await this.prisma.menuItem.findMany({
      where: { stableId: { in: itemStableIds }, deletedAt: null },
      select: { stableId: true, basePriceCents: true },
    });
    const itemPriceMap = new Map(
      items.map((item) => [item.stableId, item.basePriceCents]),
    );

    for (const special of normalized) {
      const basePriceCents = itemPriceMap.get(special.itemStableId);
      if (basePriceCents === undefined) {
        throw new BadRequestException(
          `Menu item not found: ${special.itemStableId}`,
        );
      }

      if (special.pricingMode === SpecialPricingMode.OVERRIDE_PRICE) {
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
      if (special.pricingMode === SpecialPricingMode.DISCOUNT_DELTA) {
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
      if (special.pricingMode === SpecialPricingMode.DISCOUNT_PERCENT) {
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
        where: {
          weekday: { in: weekdays },
          deletedAt: null,
        },
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
          where: { stableId: { in: toSoftDelete.map((s) => s.stableId) } },
          data: { deletedAt: new Date() },
        });
      }

      for (const special of normalized) {
        if (special.stableId && existingByStableId.has(special.stableId)) {
          await tx.menuDailySpecial.update({
            where: { stableId: special.stableId },
            data: {
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
            },
          });
        } else {
          await tx.menuDailySpecial.create({
            data: {
              ...(special.stableId ? { stableId: special.stableId } : {}),
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
            },
          });
        }
      }
    });

    return this.getDailySpecials();
  }

  private async ensureBusinessConfig() {
    const existing = await this.prisma.businessConfig.findUnique({
      where: { id: 1 },
    });

    if (existing) return existing;

    return this.prisma.businessConfig.create({
      data: {
        id: 1,
        storeName: null,
        timezone: 'America/Toronto',
        isTemporarilyClosed: false,
        temporaryCloseReason: null,
        deliveryBaseFeeCents: 600,
        priorityPerKmCents: 100,
        salesTaxRate: 0.13,
      },
    });
  }
}
