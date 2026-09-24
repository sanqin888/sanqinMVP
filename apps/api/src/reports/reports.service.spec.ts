import type { ReportingOrderFactsQueryPort } from './reporting-order-facts-query.contract';
import { ReportsService } from './reports.service';

describe('ReportsService top-item ranking', () => {
  const START = new Date('2026-01-01T00:00:00.000Z');
  const END = new Date('2026-01-08T00:00:00.000Z');

  const createService = (
    orderItems: Awaited<
      ReturnType<ReportingOrderFactsQueryPort['readItemsForRange']>
    >,
  ) => {
    const readItemsForRange = jest
      .fn<ReportingOrderFactsQueryPort['readItemsForRange']>()
      .mockResolvedValue(orderItems);
    const orderFacts: ReportingOrderFactsQueryPort = {
      readItemsForRange,
    };

    return {
      service: new ReportsService(orderFacts),
      readItemsForRange,
    };
  };

  it('counts a normal item under its own stable identity', async () => {
    const { service, readItemsForRange } = createService([
      {
        qty: 3,
        productStableId: 'item_noodle',
        displayName: 'Noodle',
        nameEn: 'Noodle',
        nameZh: '面',
        components: [],
      },
    ]);

    await expect(service.getTopItemsForRange(START, END)).resolves.toEqual([
      { stableId: 'item_noodle', name: 'Noodle', quantity: 3 },
    ]);
    expect(readItemsForRange).toHaveBeenCalledWith(START, END);
  });

  it('expands package snapshots and aggregates components by stable identity', async () => {
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

    await expect(service.getTopItemsForRange(START, END)).resolves.toEqual([
      { stableId: 'youtiao', name: '油条', quantity: 4 },
      { stableId: 'hulatang', name: '胡辣汤', quantity: 2 },
    ]);
  });

  it('does not rank a package parent separately when component facts exist', async () => {
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

    const ranking = await service.getTopItemsForRange(START, END);

    expect(ranking).toEqual([
      { stableId: 'item_chicken', name: '鸡肉', quantity: 2 },
    ]);
    expect(ranking).not.toContainEqual({
      stableId: 'combo_lunch',
      name: 'Lunch Combo',
      quantity: 2,
    });
  });

  it('falls back to the immutable order item when no component snapshot exists', async () => {
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

    await expect(service.getTopItemsForRange(START, END)).resolves.toEqual([
      {
        stableId: 'combo_unknown',
        name: 'Unknown Combo',
        quantity: 5,
      },
    ]);
  });
});
