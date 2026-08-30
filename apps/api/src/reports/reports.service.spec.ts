import { ReportsService } from './reports.service';

const baseOptionGroup = (choices: Array<{ stableId: string }>) => [
  {
    templateGroupStableId: 'group_combo',
    nameEn: 'Combo choices',
    nameZh: '套餐选项',
    minSelect: 0,
    maxSelect: null,
    sortOrder: 0,
    choices: choices.map((choice, index) => ({
      stableId: choice.stableId,
      templateGroupStableId: 'group_combo',
      nameEn: choice.stableId,
      nameZh: null,
      priceDeltaCents: 0,
      sortOrder: index,
    })),
  },
];

describe('ReportsService', () => {
  const createService = (orderItems: unknown[]) => {
    const prisma = {
      order: {
        aggregate: jest.fn().mockResolvedValue({
          _sum: {
            totalCents: 0,
            subtotalCents: 0,
            taxCents: 0,
            deliveryFeeCents: 0,
          },
          _count: { id: 0 },
        }),
        groupBy: jest.fn().mockResolvedValue([]),
        findMany: jest.fn().mockResolvedValue([]),
      },
      orderItem: {
        findMany: jest.fn().mockResolvedValue(orderItems),
      },
      menuOptionTemplateChoice: {
        findMany: jest.fn().mockResolvedValue([
          { stableId: 'choice_chicken', targetItemStableId: 'item_chicken' },
          { stableId: 'choice_beef', targetItemStableId: 'item_beef' },
        ]),
      },
      menuItem: {
        findMany: jest.fn().mockResolvedValue([
          { stableId: 'item_chicken', nameEn: 'Chicken', nameZh: '鸡肉' },
          { stableId: 'item_beef', nameEn: 'Beef', nameZh: '牛肉' },
        ]),
      },
    };

    const service = new ReportsService(prisma as never);
    return { service, prisma };
  };

  it('普通单品按自身计数', async () => {
    const { service } = createService([
      {
        qty: 3,
        productStableId: 'item_noodle',
        displayName: 'Noodle',
        nameEn: 'Noodle',
        nameZh: '面',
        optionsJson: null,
      },
    ]);

    const report = await service.getReport({
      from: '2026-01-01',
      to: '2026-01-01',
    });

    expect(report.topItems).toEqual([{ name: 'Noodle', quantity: 3 }]);
  });

  it('内部热销排行保留 stableId 供首页等后端消费者复用', async () => {
    const { service } = createService([
      {
        qty: 3,
        productStableId: 'item_noodle',
        displayName: 'Noodle',
        nameEn: 'Noodle',
        nameZh: '面',
        optionsJson: null,
      },
    ]);

    await expect(
      service.getTopItemsForRange(
        new Date('2026-01-01T00:00:00.000Z'),
        new Date('2026-01-08T00:00:00.000Z'),
      ),
    ).resolves.toEqual([
      { stableId: 'item_noodle', name: 'Noodle', quantity: 3 },
    ]);
  });

  it('套餐订单行不作为独立商品出现，且组件快照按套餐数量累加', async () => {
    const { service } = createService([
      {
        qty: 2,
        productStableId: 'combo_lunch',
        displayName: 'Lunch Combo',
        nameEn: 'Lunch Combo',
        nameZh: '午餐套餐',
        componentsJson: [
          {
            productStableId: 'item_chicken',
            nameEn: 'Chicken',
            nameZh: '鸡肉',
            quantityPerParent: 1,
            source: 'OPTION',
            sourceOptionStableId: 'choice_chicken',
            options: [],
          },
        ],
      },
    ]);

    const report = await service.getReport({
      from: '2026-01-01',
      to: '2026-01-01',
    });

    expect(report.topItems).toEqual([{ name: '鸡肉', quantity: 2 }]);
    expect(report.topItems).not.toContainEqual({
      name: 'Lunch Combo',
      quantity: 2,
    });
  });

  it('新套餐优先使用成交时 componentsJson，不回查当前菜单映射', async () => {
    const { service, prisma } = createService([
      {
        qty: 2,
        productStableId: 'breakfast_combo',
        displayName: 'Breakfast Combo',
        nameEn: 'Breakfast Combo',
        nameZh: '早点套餐',
        optionsJson: null,
        componentsJson: [
          {
            productStableId: 'hulatang',
            nameEn: 'Hulatang',
            nameZh: '胡辣汤',
            quantityPerParent: 1,
            source: 'FIXED',
            options: [],
          },
          {
            productStableId: 'youtiao',
            nameEn: 'Youtiao',
            nameZh: '油条',
            quantityPerParent: 2,
            source: 'FIXED',
            options: [],
          },
        ],
      },
    ]);

    const report = await service.getReport({
      from: '2026-01-01',
      to: '2026-01-01',
    });

    expect(report.topItems).toEqual([
      { name: '油条', quantity: 4 },
      { name: '胡辣汤', quantity: 2 },
    ]);
    expect(prisma.menuOptionTemplateChoice.findMany).not.toHaveBeenCalled();
  });

  it('同一套餐内重复组件按出现次数乘以套餐数量累加', async () => {
    const { service } = createService([
      {
        qty: 2,
        productStableId: 'combo_double',
        displayName: 'Double Combo',
        nameEn: 'Double Combo',
        nameZh: '双拼套餐',
        componentsJson: [
          {
            productStableId: 'item_chicken',
            nameEn: 'Chicken',
            nameZh: '鸡肉',
            quantityPerParent: 1,
            source: 'OPTION',
            sourceOptionStableId: 'choice_chicken_a',
            options: [],
          },
          {
            productStableId: 'item_chicken',
            nameEn: 'Chicken',
            nameZh: '鸡肉',
            quantityPerParent: 1,
            source: 'OPTION',
            sourceOptionStableId: 'choice_chicken_b',
            options: [],
          },
          {
            productStableId: 'item_beef',
            nameEn: 'Beef',
            nameZh: '牛肉',
            quantityPerParent: 1,
            source: 'OPTION',
            sourceOptionStableId: 'choice_beef',
            options: [],
          },
        ],
      },
    ]);

    const report = await service.getReport({
      from: '2026-01-01',
      to: '2026-01-01',
    });

    expect(report.topItems).toEqual([
      { name: '鸡肉', quantity: 4 },
      { name: '牛肉', quantity: 2 },
    ]);
  });

  it('缺少组件快照时不再根据当前菜单反推历史套餐组成', async () => {
    const { service, prisma } = createService([
      {
        qty: 5,
        productStableId: 'combo_unknown',
        displayName: 'Unknown Combo',
        nameEn: 'Unknown Combo',
        nameZh: '未知套餐',
        optionsJson: baseOptionGroup([{ stableId: 'choice_chicken' }]),
        componentsJson: null,
      },
    ]);

    const report = await service.getReport({
      from: '2026-01-01',
      to: '2026-01-01',
    });

    expect(report.topItems).toEqual([{ name: 'Unknown Combo', quantity: 5 }]);
    expect(prisma.menuOptionTemplateChoice.findMany).not.toHaveBeenCalled();
    expect(prisma.menuItem.findMany).not.toHaveBeenCalled();
  });
});
