// apps/api/src/menu/public-menu.service.ts
import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { AppLogger } from '../common/app-logger';
import { PublicMenuCategoryDto, PublicMenuResponse } from '@shared/menu';

function toIso(value: Date | null | undefined): string | null {
  return value ? value.toISOString() : null;
}

@Injectable()
export class PublicMenuService {
  private readonly logger = new AppLogger(PublicMenuService.name);

  constructor(private readonly prisma: PrismaService) {}

  async getPublicMenu(): Promise<PublicMenuResponse> {
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

      const items = (cat.items ?? [])
        .filter((it) => {
          if (!it.isVisible) return false;
          return it.isAvailable;
        })
        .map((it) => {
          const optionGroups = (it.optionGroups ?? [])
            .filter((link) => {
              if (!link.isEnabled) return false;

              const tg = link.templateGroup;
              // templateGroup.deletedAt 已在 Prisma where 过滤，但保留一层防御式过滤
              if (!tg || (tg as { deletedAt?: Date | null }).deletedAt)
                return false;

              return tg.isAvailable;
            })
            .map((link) => {
              const tg = link.templateGroup;
              const templateGroupStableId = tg.stableId;

              const options = (tg.options ?? [])
                .filter((opt) => {
                  // options.deletedAt 已在 Prisma where 过滤，但保留一层防御式过滤
                  if ((opt as { deletedAt?: Date | null }).deletedAt)
                    return false;
                  return opt.isAvailable;
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
                template: {
                  templateGroupStableId,
                  nameEn: tg.nameEn,
                  nameZh: tg.nameZh ?? null,
                  defaultMinSelect: tg.defaultMinSelect,
                  defaultMaxSelect: tg.defaultMaxSelect ?? null,
                  isAvailable: tg.isAvailable,
                  tempUnavailableUntil: toIso(tg.tempUnavailableUntil),
                  sortOrder: tg.sortOrder,
                },
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
    return { categories: result };
  }
}
