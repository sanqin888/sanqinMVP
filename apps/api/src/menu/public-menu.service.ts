// apps/api/src/menu/public-menu.service.ts
import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { AppLogger } from '../common/app-logger';

export type PublicMenuOptionDto = {
  optionStableId: string;
  templateGroupStableId: string;

  nameEn: string;
  nameZh: string | null;
  priceDeltaCents: number;

  isAvailable: boolean;
  tempUnavailableUntil: string | null;
  sortOrder: number;
};

export type PublicMenuOptionGroupDto = {
  // 绑定记录不对外暴露；group 以模板组 stableId 标识（在 item 下唯一）
  templateGroupStableId: string;

  minSelect: number;
  maxSelect: number | null;
  sortOrder: number;
  isEnabled: boolean;

  nameEn: string;
  nameZh: string | null;
  templateIsAvailable: boolean;
  templateTempUnavailableUntil: string | null;

  options: PublicMenuOptionDto[];
};

export type PublicMenuItemDto = {
  stableId: string;
  categoryStableId: string;

  nameEn: string;
  nameZh: string | null;

  basePriceCents: number;
  isAvailable: boolean;
  isVisible: boolean;
  tempUnavailableUntil: string | null;
  sortOrder: number;

  imageUrl: string | null;
  ingredientsEn: string | null;
  ingredientsZh: string | null;

  optionGroups: PublicMenuOptionGroupDto[];
};

export type PublicMenuCategoryDto = {
  stableId: string;

  sortOrder: number;
  nameEn: string;
  nameZh: string | null;
  isActive: boolean;

  items: PublicMenuItemDto[];
};

function toIso(value: Date | null | undefined): string | null {
  return value ? value.toISOString() : null;
}

function isAvailableNow(
  isAvailable: boolean,
  tempUntilIso: string | null,
): boolean {
  if (!isAvailable) return false;
  if (!tempUntilIso) return true;

  const t = Date.parse(tempUntilIso);
  if (!Number.isFinite(t)) return true;

  return Date.now() >= t;
}

@Injectable()
export class PublicMenuService {
  private readonly logger = new AppLogger(PublicMenuService.name);

  constructor(private readonly prisma: PrismaService) {}

  async getPublicMenu(): Promise<PublicMenuCategoryDto[]> {
    const categories = await this.prisma.menuCategory.findMany({
      where: {
        deletedAt: null,
        isActive: true,
      },
      orderBy: { sortOrder: 'asc' },
      include: {
        items: {
          where: {
            deletedAt: null,
            isVisible: true,
          },
          orderBy: { sortOrder: 'asc' },
          include: {
            optionGroups: {
              where: {
                isEnabled: true,
                templateGroup: {
                  deletedAt: null,
                },
              },
              orderBy: { sortOrder: 'asc' },
              include: {
                templateGroup: {
                  include: {
                    options: {
                      where: { deletedAt: null },
                      orderBy: { sortOrder: 'asc' },
                    },
                  },
                },
              },
            },
          },
        },
      },
    });

    const result: PublicMenuCategoryDto[] = (categories ?? []).map((cat) => {
      const categoryStableId = cat.stableId;

      const items: PublicMenuItemDto[] = (cat.items ?? [])
        .filter((it) => {
          // isVisible 已在 Prisma where 过滤，但保留一层防御式过滤
          if (!it.isVisible) return false;
          return isAvailableNow(it.isAvailable, toIso(it.tempUnavailableUntil));
        })
        .map((it) => {
          const optionGroups: PublicMenuOptionGroupDto[] = (
            it.optionGroups ?? []
          )
            .filter((link) => {
              if (!link.isEnabled) return false;

              const tg = link.templateGroup;
              // templateGroup.deletedAt 已在 Prisma where 过滤，但保留一层防御式过滤
              if (!tg || (tg as { deletedAt?: Date | null }).deletedAt)
                return false;

              return isAvailableNow(
                tg.isAvailable,
                toIso(tg.tempUnavailableUntil),
              );
            })
            .map((link) => {
              const tg = link.templateGroup;
              const templateGroupStableId = tg.stableId;

              const options: PublicMenuOptionDto[] = (tg.options ?? [])
                .filter((opt) => {
                  // options.deletedAt 已在 Prisma where 过滤，但保留一层防御式过滤
                  if ((opt as { deletedAt?: Date | null }).deletedAt)
                    return false;
                  return isAvailableNow(
                    opt.isAvailable,
                    toIso(opt.tempUnavailableUntil),
                  );
                })
                .map((opt) => ({
                  optionStableId: opt.stableId,
                  templateGroupStableId,

                  nameEn: opt.nameEn,
                  nameZh: opt.nameZh ?? null,
                  priceDeltaCents: opt.priceDeltaCents,

                  isAvailable: opt.isAvailable,
                  tempUnavailableUntil: toIso(opt.tempUnavailableUntil),
                  sortOrder: opt.sortOrder,
                }));

              return {
                templateGroupStableId,

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
    });

    this.logger.log(`Public menu generated: categories=${result.length}`);
    return result;
  }
}
