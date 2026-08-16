import { UberMenuSnapshotPrismaAdapter } from './uber-menu-snapshot-prisma.adapter';

describe('UberMenuSnapshotPrismaAdapter publish configuration', () => {
  const setup = (businessConfig: {
    timezone: string | null;
    salesTaxRate: number | null;
  }) => {
    const emptyMany = jest.fn().mockResolvedValue([]);
    const prisma = {
      uberStoreMapping: {
        findFirst: jest.fn().mockResolvedValue({ uberStoreId: 'uber-store' }),
      },
      businessConfig: {
        findUnique: jest.fn().mockResolvedValue(businessConfig),
      },
      menuCategory: { findMany: emptyMany },
      menuItem: { findMany: emptyMany },
      menuOptionGroupTemplate: { findMany: emptyMany },
      uberItemChannelConfig: { findMany: emptyMany },
      uberOptionItemConfig: { findMany: emptyMany },
      uberModifierGroupConfig: { findMany: emptyMany },
    };
    return {
      prisma,
      adapter: new UberMenuSnapshotPrismaAdapter(prisma as never),
    };
  };

  it('loads timezone and converts BusinessConfig.salesTaxRate to Uber percentage', async () => {
    const x = setup({ timezone: ' America/Toronto ', salesTaxRate: 0.13 });

    const snapshot = await x.adapter.loadPublishSnapshot(
      'pos-store',
      'uber-store',
    );

    expect(x.prisma.businessConfig.findUnique).toHaveBeenCalledWith({
      where: { id: 1 },
      select: { timezone: true, salesTaxRate: true },
    });
    expect(snapshot).toMatchObject({
      timezone: 'America/Toronto',
      taxRate: 13,
    });
  });

  it('rejects percentage-formatted BusinessConfig.salesTaxRate', async () => {
    const x = setup({ timezone: 'America/Toronto', salesTaxRate: 13 });

    await expect(
      x.adapter.loadPublishSnapshot('pos-store', 'uber-store'),
    ).rejects.toThrow(
      'salesTaxRate 必须使用 0～1 的比例格式，例如 13% 应保存为 0.13',
    );
  });

  it('rejects a missing publish timezone instead of silently falling back', async () => {
    const x = setup({ timezone: '   ', salesTaxRate: 0.13 });

    await expect(
      x.adapter.loadPublishSnapshot('pos-store', 'uber-store'),
    ).rejects.toThrow('发布 Uber 菜单前必须配置门店时区。');
  });
});
