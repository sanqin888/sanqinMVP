import { CatalogAdminService } from './catalog-admin.service';

describe('CatalogAdminService marketing subject reader', () => {
  it('returns stable Store-scoped item identity for Marketing composition', async () => {
    const findMany = jest.fn().mockResolvedValue([
      {
        stableId: 'item-1',
        nameEn: 'Pork Roujiamo',
        nameZh: '腊汁肉夹馍',
        category: { storeStableId: 'store-1' },
      },
    ]);
    const service = new CatalogAdminService({
      menuItem: { findMany },
    } as never);

    await expect(
      service.readItemSubjects({ storeStableId: 'store-1' }),
    ).resolves.toEqual([
      {
        itemStableId: 'item-1',
        storeStableId: 'store-1',
        nameEn: 'Pork Roujiamo',
        nameZh: '腊汁肉夹馍',
      },
    ]);
    expect(findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          deletedAt: null,
          category: {
            deletedAt: null,
            storeStableId: 'store-1',
          },
        },
      }),
    );
  });
});
