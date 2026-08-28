import { PrismaService } from '../prisma/prisma.service';
import { ReportsService } from '../reports/reports.service';
import { HomepageContentService } from './homepage-content.service';
import { HomepageFeaturedService } from './homepage-featured.service';

function menuItem(
  stableId: string,
  overrides: Partial<{
    imageUrl: string | null;
    visibility: 'PUBLIC' | 'HIDDEN';
    isVisibleOnMainMenu: boolean;
    isAvailable: boolean;
    tempUnavailableUntil: Date | null;
    itemKind: 'FOOD' | 'BEVERAGE';
    categoryActive: boolean;
  }> = {},
) {
  return {
    stableId,
    imageUrl:
      overrides.imageUrl === undefined
        ? `/images/${stableId}.webp`
        : overrides.imageUrl,
    visibility: overrides.visibility ?? 'PUBLIC',
    isVisibleOnMainMenu: overrides.isVisibleOnMainMenu ?? true,
    isAvailable: overrides.isAvailable ?? true,
    tempUnavailableUntil: overrides.tempUnavailableUntil ?? null,
    itemKind: overrides.itemKind ?? 'FOOD',
    category: {
      isActive: overrides.categoryActive ?? true,
      deletedAt: null,
    },
  };
}

describe('HomepageFeaturedService', () => {
  it('reserves fixed positions and fills automatic positions from eligible sales ranking', async () => {
    const prisma = {
      menuItem: {
        findMany: jest.fn().mockResolvedValue([
          menuItem('top-food'),
          menuItem('drink', { itemKind: 'BEVERAGE' }),
          menuItem('no-image', { imageUrl: null }),
          menuItem('second-food'),
          menuItem('third-food'),
        ]),
      },
    } as unknown as PrismaService;
    const reportsService = {
      getTopItemsForRange: jest.fn().mockResolvedValue([
        { stableId: 'top-food', name: 'Top', quantity: 20 },
        { stableId: 'drink', name: 'Drink', quantity: 18 },
        { stableId: 'no-image', name: 'No image', quantity: 17 },
        { stableId: 'second-food', name: 'Second', quantity: 16 },
        { stableId: 'third-food', name: 'Third', quantity: 15 },
      ]),
    } as unknown as ReportsService;
    const contentService = {
      getFeaturedConfig: jest.fn().mockResolvedValue({
        slots: [
          { itemStableId: null, badgeZh: null, badgeEn: null },
          {
            itemStableId: 'top-food',
            badgeZh: '店主推荐',
            badgeEn: 'Owner Pick',
          },
          { itemStableId: null, badgeZh: null, badgeEn: null },
        ],
      }),
    } as unknown as HomepageContentService;

    const service = new HomepageFeaturedService(
      prisma,
      reportsService,
      contentService,
    );

    await expect(service.getFeatured('zh')).resolves.toEqual([
      { itemStableId: 'second-food', badge: null },
      { itemStableId: 'top-food', badge: '店主推荐' },
      { itemStableId: 'third-food', badge: null },
    ]);
  });

  it('automatically labels only the top eligible food as 周销量第一', async () => {
    const prisma = {
      menuItem: {
        findMany: jest.fn().mockResolvedValue([
          menuItem('drink', { itemKind: 'BEVERAGE' }),
          menuItem('food-1'),
          menuItem('food-2'),
          menuItem('food-3'),
        ]),
      },
    } as unknown as PrismaService;
    const reportsService = {
      getTopItemsForRange: jest.fn().mockResolvedValue([
        { stableId: 'drink', name: 'Drink', quantity: 30 },
        { stableId: 'food-1', name: 'Food 1', quantity: 20 },
        { stableId: 'food-2', name: 'Food 2', quantity: 10 },
        { stableId: 'food-3', name: 'Food 3', quantity: 5 },
      ]),
    } as unknown as ReportsService;
    const contentService = {
      getFeaturedConfig: jest.fn().mockResolvedValue({
        slots: [
          { itemStableId: null, badgeZh: null, badgeEn: null },
          { itemStableId: null, badgeZh: null, badgeEn: null },
          { itemStableId: null, badgeZh: null, badgeEn: null },
        ],
      }),
    } as unknown as HomepageContentService;

    const service = new HomepageFeaturedService(
      prisma,
      reportsService,
      contentService,
    );

    await expect(service.getFeatured('zh')).resolves.toEqual([
      { itemStableId: 'food-1', badge: '周销量第一' },
      { itemStableId: 'food-2', badge: null },
      { itemStableId: 'food-3', badge: null },
    ]);
  });
});
