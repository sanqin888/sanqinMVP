// apps/api/src/menu/public-menu.service.ts
import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { AppLogger } from '../common/app-logger';

export type PublicMenuOptionDto = {
  id: string;
  templateGroupId: string;
  nameEn: string;
  nameZh: string | null;
  priceDeltaCents: number;
  isAvailable: boolean;
  tempUnavailableUntil: string | null; // ✅ ISO string
  sortOrder: number;
};

export type PublicMenuOptionGroupDto = {
  id: string; // MenuItemOptionGroup.id

  // ✅ 这里不再输出 itemId（因为 optionGroups 已经嵌套在 item 下了，冗余）
  templateGroupId: string;

  minSelect: number;
  maxSelect: number | null;
  sortOrder: number;
  isEnabled: boolean;

  nameEn: string;
  nameZh: string | null;
  templateIsAvailable: boolean;
  templateTempUnavailableUntil: string | null; // ✅ ISO string

  options: PublicMenuOptionDto[];
};

export type PublicMenuItemDto = {
  /** ✅ public id：直接用 stableId（前端/购物车/订单统一用这个） */
  id: string;

  categoryId: string;

  nameEn: string;
  nameZh: string | null;

  basePriceCents: number;
  isAvailable: boolean;
  isVisible: boolean;
  tempUnavailableUntil: string | null; // ✅ ISO string
  sortOrder: number;

  imageUrl: string | null;
  ingredientsEn: string | null;
  ingredientsZh: string | null;

  optionGroups: PublicMenuOptionGroupDto[];
};

export type PublicMenuCategoryDto = {
  id: string;
  sortOrder: number;
  nameEn: string;
  nameZh: string | null;
  isActive: boolean;
  items: PublicMenuItemDto[];
};

function toIso(value: Date | null | undefined): string | null {
  return value ? value.toISOString() : null;
}

/**
 * tempUntil 如果是未来时间 => 视为“暂不可售”
 * 解析失败 => 当作没设置（不拦截），避免脏数据导致全下架
 */
function isAvailableNow(isAvailable: boolean, tempUntil: string | null): boolean {
  if (!isAvailable) return false;
  if (!tempUntil) return true;

  const t = Date.parse(tempUntil);
  if (!Number.isFinite(t)) return true;

  return Date.now() >= t;
}

@Injectable()
export class PublicMenuService {
  private readonly logger = new AppLogger(PublicMenuService.name);

  constructor(private readonly prisma: PrismaService) {}

  /**
   * 顾客端公开菜单：
   * - 过滤分类/菜品/选项组/选项的“永久下架 + 临时下架”
   * - 全部按 sortOrder 排序（DB 已 orderBy，这里不重复 sort）
   */
  async getPublicMenu(): Promise<PublicMenuCategoryDto[]> {
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

    const result: PublicMenuCategoryDto[] = (categories ?? [])
      .filter((c) => c.isActive)
      .map((cat) => {
        const items: PublicMenuItemDto[] = (cat.items ?? [])
          .filter((it) => {
            const ok =
              it.isVisible &&
              isAvailableNow(it.isAvailable, toIso(it.tempUnavailableUntil));
            return ok;
          })
          .map((it) => {
            const optionGroups: PublicMenuOptionGroupDto[] = (it.optionGroups ?? [])
              .filter((link) => {
                if (!link.isEnabled) return false;
                const tg = link.templateGroup;
                return isAvailableNow(tg.isAvailable, toIso(tg.tempUnavailableUntil));
              })
              .map((link) => {
                const tg = link.templateGroup;

                const options: PublicMenuOptionDto[] = (tg.options ?? [])
                  .filter((opt) =>
                    isAvailableNow(opt.isAvailable, toIso(opt.tempUnavailableUntil)),
                  )
                  .map((opt) => ({
                    id: opt.id,
                    templateGroupId: opt.templateGroupId,
                    nameEn: opt.nameEn,
                    nameZh: opt.nameZh ?? null,
                    priceDeltaCents: opt.priceDeltaCents,
                    isAvailable: opt.isAvailable,
                    tempUnavailableUntil: toIso(opt.tempUnavailableUntil),
                    sortOrder: opt.sortOrder,
                  }));

                return {
                  id: link.id,
                  templateGroupId: link.templateGroupId,
                  minSelect: link.minSelect,
                  maxSelect: link.maxSelect,
                  sortOrder: link.sortOrder,
                  isEnabled: link.isEnabled,

                  nameEn: tg.nameEn,
                  nameZh: tg.nameZh ?? null,
                  templateIsAvailable: tg.isAvailable,
                  templateTempUnavailableUntil: toIso(tg.tempUnavailableUntil),

                  options,
                };
              });

            return {
              id: it.stableId, // ✅ public id = stableId
              categoryId: it.categoryId,

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
          id: cat.id,
          sortOrder: cat.sortOrder,
          nameEn: cat.nameEn,
          nameZh: cat.nameZh ?? null,
          isActive: cat.isActive,
          items,
        };
      });

    this.logger.log(`Public menu generated: categories=${result.length}`);
    return result;
  }
}
