import type { ReportingOrderFactsQueryPort } from './reporting-order-facts-query.contract';
import { ReportsService } from './reports.service';

describe('ReportsService', () => {
  const createService = (
    orderItems: Awaited<
      ReturnType<ReportingOrderFactsQueryPort['readItemsForRange']>
    >,
  ) => {
    const readMetricsForRange = jest
      .fn<ReportingOrderFactsQueryPort['readMetricsForRange']>()
      .mockResolvedValue({
        totalCents: 0,
        subtotalCents: 0,
        taxCents: 0,
        deliveryFeeCents: 0,
        orderCount: 0,
        payment: [],
        fulfillment: [],
        timeline: [],
      });
    const readItemsForRange = jest
      .fn<ReportingOrderFactsQueryPort['readItemsForRange']>()
      .mockResolvedValue(orderItems);
    const orderFacts: ReportingOrderFactsQueryPort = {
      readMetricsForRange,
      readItemsForRange,
    };

    return { service: new ReportsService(orderFacts) };
  };

  it('普通单品按自身计数', async () => {
    const { service } = createService([
      {
        qty: 3,
        productStableId: 'item_noodle',
        displayName: 'Noodle',
        nameEn: 'Noodle',
        nameZh: '面',
        components: [],
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
        components: [],
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
        components: [
          {
            productStableId: 'item_chicken',
            nameEn: 'Chicken',
            nameZh: '鸡肉',
            quantityPerParent: 1,
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

  it('历史套餐排行只消费 Orders 提供的成交时组件事实', async () => {
    const { service } = createService([
      {
        qty: 2,
        productStableId: 'breakfast_combo',
        displayName: 'Breakfast Combo',
        nameEn: 'Breakfast Combo',
        nameZh: '早点套餐',
        components: [
          {
            productStableId: 'hulatang',
            nameEn: 'Hulatang',
            nameZh: '胡辣汤',
            quantityPerParent: 1,
          },
          {
            productStableId: 'youtiao',
            nameEn: 'Youtiao',
            nameZh: '油条',
            quantityPerParent: 2,
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
  });

  it('缺少组件事实时按成交订单行自身计数，不反推当前菜单组成', async () => {
    const { service } = createService([
      {
        qty: 5,
        productStableId: 'combo_unknown',
        displayName: 'Unknown Combo',
        nameEn: 'Unknown Combo',
        nameZh: '未知套餐',
        components: [],
      },
    ]);

    const report = await service.getReport({
      from: '2026-01-01',
      to: '2026-01-01',
    });

    expect(report.topItems).toEqual([{ name: 'Unknown Combo', quantity: 5 }]);
  });
});
