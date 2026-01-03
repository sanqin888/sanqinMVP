// apps/api/src/promotions/promotions.service.ts
import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { AppLogger } from '../common/app-logger';
import {
  MenuEntitlementDto,
  MenuEntitlementItemDto,
  MenuEntitlementsResponse,
} from '@shared/menu';

function toIso(value: Date | null | undefined): string | null {
  return value ? value.toISOString() : null;
}

@Injectable()
export class PromotionsService {
  private readonly logger = new AppLogger(PromotionsService.name);

  constructor(private readonly prisma: PrismaService) {}

  async getMenuEntitlements(
    userStableId: string,
  ): Promise<MenuEntitlementsResponse> {
    const now = new Date();
    const userCoupons = await this.prisma.userCoupon.findMany({
      where: {
        userStableId,
        status: 'AVAILABLE',
        AND: [
          {
            OR: [{ expiresAt: null }, { expiresAt: { gt: now } }],
          },
          {
            coupon: {
              isActive: true,
              AND: [
                { OR: [{ startsAt: null }, { startsAt: { lte: now } }] },
                { OR: [{ endsAt: null }, { endsAt: { gt: now } }] },
              ],
            },
          },
        ],
      },
      include: {
        coupon: true,
      },
    });

    const unlockedItemSet = new Set<string>();
    const entitlements: MenuEntitlementDto[] = [];
    const itemCouponMap = new Map<
      string,
      { userCouponId: string; couponStableId: string }
    >();

    for (const userCoupon of userCoupons) {
      const unlocked = (userCoupon.coupon.unlockedItemStableIds ?? [])
        .map((value) => value.trim())
        .filter(Boolean);
      if (unlocked.length === 0) continue;

      entitlements.push({
        userCouponId: userCoupon.id,
        couponStableId: userCoupon.couponStableId,
        unlockedItemStableIds: unlocked,
        stackingPolicy: userCoupon.coupon.stackingPolicy,
      });

      for (const stableId of unlocked) {
        unlockedItemSet.add(stableId);
        if (!itemCouponMap.has(stableId)) {
          itemCouponMap.set(stableId, {
            userCouponId: userCoupon.id,
            couponStableId: userCoupon.couponStableId,
          });
        }
      }
    }

    const unlockedItemStableIds = Array.from(unlockedItemSet.values());
    if (unlockedItemStableIds.length === 0) {
      return { unlockedItemStableIds: [], unlockedItems: [], entitlements: [] };
    }

    const items = await this.prisma.menuItem.findMany({
      where: {
        stableId: { in: unlockedItemStableIds },
        deletedAt: null,
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
    });

    const unlockedItems: MenuEntitlementItemDto[] = items.flatMap((it) => {
      const couponInfo = itemCouponMap.get(it.stableId);
      if (!couponInfo) return [];

      const optionGroups = (it.optionGroups ?? [])
        .filter((link) => {
          if (!link.isEnabled) return false;

          const tg = link.templateGroup;
          if (!tg || (tg as { deletedAt?: Date | null }).deletedAt) {
            return false;
          }

          return tg.isAvailable;
        })
        .map((link) => {
          const tg = link.templateGroup;
          const templateGroupStableId = tg.stableId;

          const options = (tg.options ?? [])
            .filter((opt) => {
              if ((opt as { deletedAt?: Date | null }).deletedAt) return false;
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

      return [
        {
          stableId: it.stableId,
          nameEn: it.nameEn,
          nameZh: it.nameZh ?? null,
          basePriceCents: it.basePriceCents,
          isAvailable: it.isAvailable,
          tempUnavailableUntil: toIso(it.tempUnavailableUntil),
          imageUrl: it.imageUrl ?? null,
          ingredientsEn: it.ingredientsEn ?? null,
          ingredientsZh: it.ingredientsZh ?? null,
          optionGroups,
          couponStableId: couponInfo.couponStableId,
          userCouponId: couponInfo.userCouponId,
        },
      ];
    });

    this.logger.log(
      `Menu entitlements: userStableId=${userStableId} items=${unlockedItems.length}`,
    );

    return {
      unlockedItemStableIds,
      unlockedItems,
      entitlements,
    };
  }
}
