import { CatalogAdminService } from './catalog-admin.service';

describe('Catalog external-menu facts reader contract', () => {
  it('maps Catalog persistence to stable external-menu facts', async () => {
    const tempUnavailableUntil = new Date('2090-01-02T03:04:05.000Z');
    const prisma = {
      menuCategory: {
        findMany: jest.fn().mockResolvedValue([
          {
            stableId: 'category-1',
            nameEn: 'Noodles',
            nameZh: '面',
            sortOrder: 1,
            isActive: true,
          },
        ]),
      },
      menuItem: {
        findMany: jest.fn().mockResolvedValue([
          {
            stableId: 'item-1',
            category: { stableId: 'category-1' },
            nameEn: 'Dry Noodles',
            nameZh: '拌面',
            basePriceCents: 1299,
            isAvailable: true,
            tempUnavailableUntil,
            visibility: 'PUBLIC',
            publishToUberEats: true,
            sortOrder: 2,
            imageUrl: '/uploads/item-1.jpg',
            ingredientsEn: 'Noodles',
            optionGroups: [
              {
                sortOrder: 1,
                isEnabled: true,
                templateGroup: { stableId: 'group-1' },
              },
            ],
          },
        ]),
        findUnique: jest.fn(),
      },
      menuOptionGroupTemplate: {
        findMany: jest.fn().mockResolvedValue([
          {
            stableId: 'group-1',
            nameEn: 'Size',
            nameZh: '份量',
            defaultMinSelect: 0,
            defaultMaxSelect: 1,
            isAvailable: true,
            sortOrder: 3,
            options: [
              {
                stableId: 'option-1',
                nameEn: 'Large',
                nameZh: '大份',
                priceDeltaCents: 200,
                isAvailable: true,
                tempUnavailableUntil,
                sortOrder: 1,
                targetItemStableId: ' target-item ',
                childLinks: [
                  {
                    childOption: {
                      templateGroup: { stableId: 'child-group' },
                    },
                  },
                ],
              },
            ],
          },
        ]),
        findUnique: jest.fn(),
      },
      menuOptionTemplateChoice: {
        findUnique: jest.fn(),
        findMany: jest.fn(),
      },
    };
    const service = new CatalogAdminService(prisma as never);

    await expect(service.readMenuSource()).resolves.toEqual({
      categories: [
        {
          stableId: 'category-1',
          nameEn: 'Noodles',
          nameZh: '面',
          sortOrder: 1,
          isActive: true,
        },
      ],
      items: [
        {
          stableId: 'item-1',
          categoryStableId: 'category-1',
          nameEn: 'Dry Noodles',
          nameZh: '拌面',
          basePriceCents: 1299,
          isAvailable: true,
          tempUnavailableUntil: tempUnavailableUntil.toISOString(),
          visibility: 'PUBLIC',
          publishToUberEats: true,
          sortOrder: 2,
          imageUrl: '/uploads/item-1.jpg',
          ingredientsEn: 'Noodles',
          optionGroups: [
            {
              templateGroupStableId: 'group-1',
              sortOrder: 1,
              isEnabled: true,
            },
          ],
        },
      ],
      modifierGroups: [
        {
          stableId: 'group-1',
          nameEn: 'Size',
          nameZh: '份量',
          defaultMinSelect: 0,
          defaultMaxSelect: 1,
          isAvailable: true,
          sortOrder: 3,
          options: [
            {
              stableId: 'option-1',
              nameEn: 'Large',
              nameZh: '大份',
              priceDeltaCents: 200,
              isAvailable: true,
              tempUnavailableUntil: tempUnavailableUntil.toISOString(),
              sortOrder: 1,
              targetItemStableId: 'target-item',
              childTemplateGroupStableIds: ['child-group'],
            },
          ],
        },
      ],
    });
    const stableOrder = [{ sortOrder: 'asc' }, { id: 'asc' }];
    expect(prisma.menuCategory.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ orderBy: stableOrder }),
    );
    expect(prisma.menuItem.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        orderBy: stableOrder,
        select: expect.objectContaining({
          category: { select: { stableId: true } },
        }),
      }),
    );
    expect(prisma.menuOptionGroupTemplate.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ orderBy: stableOrder }),
    );
  });

  it('provides narrow source defaults and stable modifier snapshot facts', async () => {
    const prisma = {
      menuCategory: { findMany: jest.fn() },
      menuItem: {
        findMany: jest.fn(),
        findUnique: jest.fn().mockResolvedValue({
          stableId: 'item-1',
          basePriceCents: 1099,
          isAvailable: true,
        }),
      },
      menuOptionGroupTemplate: {
        findMany: jest.fn(),
        findUnique: jest.fn().mockResolvedValue({
          stableId: 'group-1',
          nameEn: 'Size',
          defaultMinSelect: 0,
          defaultMaxSelect: 1,
        }),
      },
      menuOptionTemplateChoice: {
        findUnique: jest.fn().mockResolvedValue({
          stableId: 'option-1',
          priceDeltaCents: 200,
          isAvailable: true,
        }),
        findMany: jest.fn().mockResolvedValue([
          {
            stableId: 'option-1',
            targetItemStableId: 'item-2',
            nameEn: 'Large',
            nameZh: '大份',
            templateGroup: {
              stableId: 'group-1',
              nameEn: 'Size',
              nameZh: '份量',
            },
          },
        ]),
      },
    };
    const service = new CatalogAdminService(prisma as never);

    await expect(service.getMenuItemSource(' item-1 ')).resolves.toMatchObject({
      stableId: 'item-1',
      basePriceCents: 1099,
    });
    await expect(service.getOptionSource(' option-1 ')).resolves.toMatchObject({
      stableId: 'option-1',
      priceDeltaCents: 200,
    });
    await expect(
      service.getModifierGroupSource(' group-1 '),
    ).resolves.toMatchObject({ stableId: 'group-1', nameEn: 'Size' });
    await expect(service.listOrderModifierSnapshotSources()).resolves.toEqual([
      {
        stableId: 'option-1',
        templateGroupStableId: 'group-1',
        targetItemStableId: 'item-2',
        nameEn: 'Large',
        nameZh: '大份',
        templateNameEn: 'Size',
        templateNameZh: '份量',
      },
    ]);
  });
});
