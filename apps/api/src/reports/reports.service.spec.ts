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

  it('套餐订单行不作为独立商品出现，且套餐内菜品按套餐数量累加', async () => {
    const { service } = createService([
      {
        qty: 2,
        productStableId: 'combo_lunch',
        displayName: 'Lunch Combo',
        nameEn: 'Lunch Combo',
        nameZh: '午餐套餐',
        optionsJson: baseOptionGroup([{ stableId: 'choice_chicken' }]),
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

  it('同一套餐内重复目标菜品按出现次数乘以套餐数量累加', async () => {
    const { service } = createService([
      {
        qty: 2,
        productStableId: 'combo_double',
        displayName: 'Double Combo',
        nameEn: 'Double Combo',
        nameZh: '双拼套餐',
        optionsJson: baseOptionGroup([
          { stableId: 'choice_chicken' },
          { stableId: 'choice_chicken' },
          { stableId: 'choice_beef' },
        ]),
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

  it('没有可拆分选项的订单项按原订单行回退统计', async () => {
    const { service } = createService([
      {
        qty: 5,
        productStableId: 'combo_unknown',
        displayName: 'Unknown Combo',
        nameEn: 'Unknown Combo',
        nameZh: '未知套餐',
        optionsJson: baseOptionGroup([{ stableId: 'choice_without_target' }]),
      },
    ]);

    const report = await service.getReport({
      from: '2026-01-01',
      to: '2026-01-01',
    });

    expect(report.topItems).toEqual([{ name: 'Unknown Combo', quantity: 5 }]);
  });

  it('批量查询选项和目标菜品，避免按订单项逐条查询', async () => {
    const { service, prisma } = createService([
      {
        qty: 1,
        productStableId: 'combo_a',
        displayName: 'Combo A',
        nameEn: 'Combo A',
        nameZh: null,
        optionsJson: baseOptionGroup([{ stableId: 'choice_chicken' }]),
      },
      {
        qty: 1,
        productStableId: 'combo_b',
        displayName: 'Combo B',
        nameEn: 'Combo B',
        nameZh: null,
        optionsJson: baseOptionGroup([
          { stableId: 'choice_chicken' },
          { stableId: 'choice_beef' },
        ]),
      },
    ]);

    await service.getReport({ from: '2026-01-01', to: '2026-01-01' });

    expect(prisma.menuOptionTemplateChoice.findMany).toHaveBeenCalledTimes(1);
    expect(prisma.menuOptionTemplateChoice.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { stableId: { in: ['choice_chicken', 'choice_beef'] } },
      }),
    );
    expect(prisma.menuItem.findMany).toHaveBeenCalledTimes(1);
  });
});
