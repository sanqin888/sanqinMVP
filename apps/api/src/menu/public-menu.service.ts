// apps/api/src/menu/public-menu.service.ts
import { Inject, Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { AppLogger } from '../common/app-logger';
import {
  isAvailableNow,
  PublicMenuCategoryDto,
  PublicMenuResponse,
} from '@shared/menu';
import {
  DAILY_SPECIAL_OFFERS,
  type DailySpecialOffersPort,
} from '../promotions/public-api';

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

@Injectable()
export class PublicMenuService {
  private readonly logger = new AppLogger(PublicMenuService.name);

  constructor(
    private readonly prisma: PrismaService,
    @Inject(DAILY_SPECIAL_OFFERS)
    private readonly dailySpecialOffers: DailySpecialOffersPort,
  ) {}

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
            visibility: 'PUBLIC',
          },
          orderBy: { sortOrder: 'asc' },
          include: {
            fixedComponents: {
              orderBy: { sortOrder: 'asc' },
            },
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
                      include: {
                        childLinks: {
                          include: {
                            childOption: { select: { stableId: true } },
                          },
                        },
                        parentLinks: {
                          include: {
                            parentOption: { select: { stableId: true } },
                          },
                        },
                      },
                    },
                  },
                },
              },
            },
          },
        },
      },
    });

    const catalogItems = (categories ?? []).flatMap((category) =>
      (category.items ?? []).map((item) => ({
        itemStableId: item.stableId,
        basePriceCents: item.basePriceCents,
      })),
    );
    const { specials: activeDailySpecials } =
      await this.dailySpecialOffers.getActiveDailySpecials(catalogItems);
    const specialsByItemStableId = new Map<
      string,
      (typeof activeDailySpecials)[number]
    >();
    activeDailySpecials.forEach((special) => {
      if (!specialsByItemStableId.has(special.itemStableId)) {
        specialsByItemStableId.set(special.itemStableId, special);
      }
    });

    const publicItemByStableId = new Map(
      (categories ?? []).flatMap((cat) =>
        (cat.items ?? []).map((item) => [item.stableId, item] as const),
      ),
    );
    const fulfillableMemo = new Map<string, boolean>();
    const isItemFulfillable = (
      itemStableId: string,
      visiting = new Set<string>(),
    ): boolean => {
      const cached = fulfillableMemo.get(itemStableId);
      if (cached !== undefined) return cached;
      if (visiting.has(itemStableId)) return false;

      const item = publicItemByStableId.get(itemStableId);
      if (!item) return false;
      if (
        !isAvailableNow(
          availabilityFromDb(item.isAvailable, item.tempUnavailableUntil),
        )
      ) {
        fulfillableMemo.set(itemStableId, false);
        return false;
      }

      const nextVisiting = new Set(visiting);
      nextVisiting.add(itemStableId);
      const componentsAvailable = (item.fixedComponents ?? []).every(
        (component) =>
          isItemFulfillable(component.componentItemStableId, nextVisiting),
      );
      fulfillableMemo.set(itemStableId, componentsAvailable);
      return componentsAvailable;
    };

    const availablePublicItemStableIds = new Set(
      Array.from(publicItemByStableId.keys()).filter((stableId) =>
        isItemFulfillable(stableId),
      ),
    );

    const result: PublicMenuCategoryDto[] = (categories ?? []).map((cat) => {
      const categoryStableId = cat.stableId;

      const items = (cat.items ?? [])
        .filter((it) => availablePublicItemStableIds.has(it.stableId))
        .map((it) => {
          const activeSpecial = specialsByItemStableId.get(it.stableId) ?? null;
          const effectivePriceCents = activeSpecial?.effectivePriceCents;

          const optionGroups = (it.optionGroups ?? [])
            .filter((link) => {
              if (!link.isEnabled) return false;

              const tg = link.templateGroup;
              // templateGroup.deletedAt 已在 Prisma where 过滤，但保留一层防御式过滤
              if (!tg || (tg as { deletedAt?: Date | null }).deletedAt)
                return false;
              return true;
            })
            .map((link) => {
              const tg = link.templateGroup;
              const templateGroupStableId = tg.stableId;

              const options = (tg.options ?? [])
                .filter((opt) => {
                  // options.deletedAt 已在 Prisma where 过滤，但保留一层防御式过滤
                  if ((opt as { deletedAt?: Date | null }).deletedAt)
                    return false;
                  if (
                    opt.targetItemStableId &&
                    !availablePublicItemStableIds.has(opt.targetItemStableId)
                  ) {
                    return false;
                  }
                  return isAvailableNow(
                    availabilityFromDb(
                      opt.isAvailable,
                      opt.tempUnavailableUntil,
                    ),
                  );
                })
                .map((opt) => ({
                  optionStableId: opt.stableId,
                  templateGroupStableId,
                  nameEn: opt.nameEn,
                  nameZh: opt.nameZh ?? null,
                  priceDeltaCents: opt.priceDeltaCents,
                  targetItemStableId: opt.targetItemStableId ?? null,
                  isAvailable: opt.isAvailable,
                  tempUnavailableUntil: toIso(opt.tempUnavailableUntil),
                  sortOrder: opt.sortOrder,
                  childOptionStableIds: (opt.childLinks ?? []).map(
                    (link) => link.childOption.stableId,
                  ),
                  parentOptionStableIds: (opt.parentLinks ?? []).map(
                    (link) => link.parentOption.stableId,
                  ),
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
            isVisibleOnMainMenu: it.isVisibleOnMainMenu,
            tempUnavailableUntil: toIso(it.tempUnavailableUntil),
            sortOrder: it.sortOrder,
            imageUrl: it.imageUrl ?? null,
            ingredientsEn: it.ingredientsEn ?? null,
            ingredientsZh: it.ingredientsZh ?? null,
            fixedComponents: (it.fixedComponents ?? []).map((component) => ({
              componentItemStableId: component.componentItemStableId,
              quantity: component.quantity,
              sortOrder: component.sortOrder,
            })),
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

    const publicResultItemStableIds = new Set(
      result.flatMap((category) => category.items.map((item) => item.stableId)),
    );
    const dailySpecials = activeDailySpecials.filter((special) =>
      publicResultItemStableIds.has(special.itemStableId),
    );

    this.logger.log(`Public menu generated: categories=${result.length}`);
    return { categories: result, dailySpecials };
  }
}
