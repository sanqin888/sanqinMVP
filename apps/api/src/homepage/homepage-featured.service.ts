import { BadRequestException, Injectable } from '@nestjs/common';
import { DateTime } from 'luxon';
import { PrismaService } from '../prisma/prisma.service';
import { ReportsService } from '../reports/reports.service';
import { HomepageContentService } from './homepage-content.service';
import type {
  HomepageFeaturedConfig,
  HomepageFeaturedItem,
  HomepageLocale,
} from './homepage-content.types';

type FeaturedMenuItem = {
  stableId: string;
  imageUrl: string | null;
  visibility: 'PUBLIC' | 'HIDDEN';
  isVisibleOnMainMenu: boolean;
  isAvailable: boolean;
  tempUnavailableUntil: Date | null;
  itemKind: 'FOOD' | 'BEVERAGE';
  category: {
    isActive: boolean;
    deletedAt: Date | null;
  };
};

@Injectable()
export class HomepageFeaturedService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly reportsService: ReportsService,
    private readonly contentService: HomepageContentService,
  ) {}

  async getConfig(): Promise<HomepageFeaturedConfig> {
    return this.contentService.getFeaturedConfig();
  }

  async updateConfig(
    input: HomepageFeaturedConfig,
  ): Promise<HomepageFeaturedConfig> {
    if (!input || !Array.isArray(input.slots) || input.slots.length !== 3) {
      throw new BadRequestException(
        'homepage featured config must contain exactly 3 slots',
      );
    }

    const manualStableIds = Array.from(
      new Set(
        input.slots.flatMap((slot) => {
          const value =
            typeof slot?.itemStableId === 'string'
              ? slot.itemStableId.trim()
              : '';
          return value ? [value] : [];
        }),
      ),
    );

    if (manualStableIds.length > 0) {
      const items = await this.loadMenuItems(manualStableIds);
      const eligibleStableIds = new Set(
        items
          .filter((item) => this.isStructurallyDisplayable(item))
          .map((item) => item.stableId),
      );
      const invalidStableId = manualStableIds.find(
        (stableId) => !eligibleStableIds.has(stableId),
      );
      if (invalidStableId) {
        throw new BadRequestException(
          'Featured item must be active, public, visible on the main menu, ' +
            `and have an image: ${invalidStableId}`,
        );
      }
    }

    return this.contentService.updateFeaturedConfig(input);
  }

  async getFeatured(locale: HomepageLocale): Promise<HomepageFeaturedItem[]> {
    const config = await this.contentService.getFeaturedConfig();
    const zone = process.env.TZ || 'America/Toronto';
    const end = DateTime.now().setZone(zone);
    const start = end.minus({ days: 7 });
    const ranking = await this.reportsService.getTopItemsForRange(
      start.toJSDate(),
      end.toJSDate(),
    );

    const manualStableIds = config.slots
      .map((slot) => slot.itemStableId)
      .filter((value): value is string => Boolean(value));
    const candidateStableIds = Array.from(
      new Set([...manualStableIds, ...ranking.map((item) => item.stableId)]),
    );
    const menuItems = await this.loadMenuItems(candidateStableIds);
    const itemByStableId = new Map(
      menuItems.map((item) => [item.stableId, item]),
    );
    const reservedManualIds = new Set(manualStableIds);
    const nowMs = end.toMillis();

    const weeklyTopStableId = ranking.find((ranked) => {
      const item = itemByStableId.get(ranked.stableId);
      return item ? this.isAutoEligible(item, nowMs) : false;
    })?.stableId;

    const selected = new Set<string>();
    const featured: HomepageFeaturedItem[] = [];

    for (const slot of config.slots) {
      let stableId: string | null = null;

      if (slot.itemStableId) {
        const item = itemByStableId.get(slot.itemStableId);
        if (
          item &&
          this.isStructurallyDisplayable(item) &&
          !selected.has(item.stableId)
        ) {
          stableId = item.stableId;
        }
      } else {
        stableId =
          ranking.find((ranked) => {
            if (
              selected.has(ranked.stableId) ||
              reservedManualIds.has(ranked.stableId)
            ) {
              return false;
            }
            const item = itemByStableId.get(ranked.stableId);
            return item ? this.isAutoEligible(item, nowMs) : false;
          })?.stableId ?? null;
      }

      if (!stableId) continue;
      selected.add(stableId);

      const manualBadge = locale === 'zh' ? slot.badgeZh : slot.badgeEn;
      featured.push({
        itemStableId: stableId,
        badge:
          manualBadge ??
          (stableId === weeklyTopStableId
            ? locale === 'zh'
              ? '周销量第一'
              : 'Weekly #1'
            : null),
      });
    }

    return featured;
  }

  private async loadMenuItems(
    stableIds: string[],
  ): Promise<FeaturedMenuItem[]> {
    if (stableIds.length === 0) return [];
    return this.prisma.menuItem.findMany({
      where: {
        stableId: { in: stableIds },
        deletedAt: null,
      },
      select: {
        stableId: true,
        imageUrl: true,
        visibility: true,
        isVisibleOnMainMenu: true,
        isAvailable: true,
        tempUnavailableUntil: true,
        itemKind: true,
        category: {
          select: {
            isActive: true,
            deletedAt: true,
          },
        },
      },
    });
  }

  private isStructurallyDisplayable(item: FeaturedMenuItem): boolean {
    return (
      item.category.isActive &&
      item.category.deletedAt == null &&
      item.visibility === 'PUBLIC' &&
      item.isVisibleOnMainMenu &&
      Boolean(item.imageUrl)
    );
  }

  private isAutoEligible(item: FeaturedMenuItem, nowMs: number): boolean {
    if (!this.isStructurallyDisplayable(item)) return false;
    if (item.itemKind !== 'FOOD' || !item.isAvailable) return false;
    if (!item.tempUnavailableUntil) return true;
    return item.tempUnavailableUntil.getTime() <= nowMs;
  }
}
