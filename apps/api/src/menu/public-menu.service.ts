// apps/api/src/menu/public-menu.service.ts
import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { AppLogger } from '../common/app-logger';
import {
  DailySpecialDto,
  PublicMenuCategoryDto,
  PublicMenuResponse,
} from '@shared/menu';
import {
  isDailySpecialActiveNow,
  resolveEffectivePriceCents,
  resolveStoreNow,
} from '../common/daily-specials';

function toIso(value: Date | null | undefined): string | null {
  return value ? value.toISOString() : null;
}

@Injectable()
export class PublicMenuService {
  private readonly logger = new AppLogger(PublicMenuService.name);

  constructor(private readonly prisma: PrismaService) {}

  async getPublicMenu(): Promise<PublicMenuResponse> {
    const businessConfig =
      (await this.prisma.businessConfig.findUnique({ where: { id: 1 } })) ??
      (await this.prisma.businessConfig.create({
        data: {
          id: 1,
          storeName: '',
          timezone: 'America/Toronto',
          isTemporarilyClosed: false,
          temporaryCloseReason: null,
          deliveryBaseFeeCents: 600,
          priorityPerKmCents: 100,
          salesTaxRate: 0.13,
        },
      }));
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

    const specialsByItemStableId = new Map<
      string,
      (typeof rawDailySpecials)[number]
    >();
    rawDailySpecials.forEach((special) => {
      if (!isDailySpecialActiveNow(special, now)) return;
      if (!specialsByItemStableId.has(special.itemStableId)) {
        specialsByItemStableId.set(special.itemStableId, special);
      }
    });

    const result: PublicMenuCategoryDto[] = (categories ?? []).map((cat) => {
      const categoryStableId = cat.stableId;

      const items = (cat.items ?? [])
        .filter((it) => {
          return it.isAvailable;
        })
        .map((it) => {
          const activeSpecial = specialsByItemStableId.get(it.stableId) ?? null;
          const effectivePriceCents = activeSpecial
            ? resolveEffectivePriceCents(it.basePriceCents, activeSpecial)
            : undefined;

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
                  return opt.isAvailable;
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

    const itemBasePriceMap = new Map(
      result.flatMap((cat) =>
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

    dailySpecials.sort((a, b) => a.sortOrder - b.sortOrder);

    this.logger.log(`Public menu generated: categories=${result.length}`);
    return { categories: result, dailySpecials };
  }
}
