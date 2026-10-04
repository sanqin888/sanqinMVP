import { CatalogAdminService } from './catalog-admin.service';

describe('CatalogAdminService reporting item classification reader', () => {
  it('returns current Store-scoped canonical item kinds for requested items', async () => {
    const findMany = jest.fn().mockResolvedValue([
      {
        stableId: 'drink_plum',
        itemKind: 'BEVERAGE',
        category: { storeStableId: 'store-1' },
      },
      {
        stableId: 'roujiamo',
        itemKind: 'FOOD',
        category: { storeStableId: 'store-1' },
      },
    ]);
    const service = new CatalogAdminService({
      menuItem: { findMany },
    } as never);

    await expect(
      service.readItemClassifications({
        storeStableId: 'store-1',
        itemStableIds: ['roujiamo', 'drink_plum', 'roujiamo', ''],
      }),
    ).resolves.toEqual([
      {
        itemStableId: 'drink_plum',
        storeStableId: 'store-1',
        itemKind: 'BEVERAGE',
      },
      {
        itemStableId: 'roujiamo',
        storeStableId: 'store-1',
        itemKind: 'FOOD',
      },
    ]);

    expect(findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          stableId: { in: ['roujiamo', 'drink_plum'] },
          deletedAt: null,
          category: {
            deletedAt: null,
            storeStableId: 'store-1',
          },
        },
      }),
    );
  });

  it('does not query persistence when no stable item IDs are requested', async () => {
    const findMany = jest.fn();
    const service = new CatalogAdminService({
      menuItem: { findMany },
    } as never);

    await expect(
      service.readItemClassifications({
        storeStableId: 'store-1',
        itemStableIds: [],
      }),
    ).resolves.toEqual([]);
    expect(findMany).not.toHaveBeenCalled();
  });
});
