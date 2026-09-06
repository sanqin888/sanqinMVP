import { OrderItemSnapshotBuilder } from './order-item-snapshot.builder';

const parentStableId = 'c1234567890abcdefghijklmn';
const childStableId = 'c2234567890abcdefghijklmn';

function menuItem(overrides: Record<string, unknown> = {}) {
  return {
    id: '11111111-1111-4111-8111-111111111111',
    stableId: parentStableId,
    nameEn: 'Combo',
    nameZh: '套餐',
    basePriceCents: 1000,
    isAvailable: true,
    tempUnavailableUntil: null,
    fixedComponents: [],
    optionGroups: [],
    ...overrides,
  };
}

describe('OrderItemSnapshotBuilder', () => {
  it('materializes fixed combo components into the canonical immutable snapshot', async () => {
    const parent = menuItem({
      fixedComponents: [
        {
          componentItemStableId: childStableId,
          quantity: 2,
          sortOrder: 0,
        },
      ],
    });
    const child = menuItem({
      id: '22222222-2222-4222-8222-222222222222',
      stableId: childStableId,
      nameEn: 'Soup',
      nameZh: '汤',
      basePriceCents: 300,
    });
    const prisma = {
      menuItem: {
        findMany: jest.fn().mockResolvedValue([parent]),
        findFirst: jest.fn().mockResolvedValue(child),
      },
    };
    const builder = new OrderItemSnapshotBuilder(prisma as never);

    await expect(
      builder.buildMany([{ productStableId: parentStableId, qty: 1 }]),
    ).resolves.toEqual([
      expect.objectContaining({
        productStableId: parentStableId,
        optionsSnapshot: [],
        componentSnapshots: [
          expect.objectContaining({
            productStableId: childStableId,
            quantityPerParent: 2,
            source: 'FIXED',
          }),
        ],
      }),
    ]);
  });

  it('re-materializes amendment option snapshots through current canonical menu structure', async () => {
    const parent = menuItem({
      optionGroups: [
        {
          isEnabled: true,
          minSelect: 0,
          maxSelect: 1,
          sortOrder: 0,
          templateGroup: {
            stableId: 'group_combo_choice',
            nameEn: 'Choose soup',
            nameZh: '选择汤',
            defaultMinSelect: 0,
            defaultMaxSelect: 1,
            sortOrder: 0,
            deletedAt: null,
            options: [
              {
                id: '33333333-3333-4333-8333-333333333333',
                stableId: 'choice_soup',
                nameEn: 'Soup',
                nameZh: '汤',
                priceDeltaCents: 100,
                sortOrder: 0,
                isAvailable: true,
                tempUnavailableUntil: null,
                targetItemStableId: childStableId,
                deletedAt: null,
              },
            ],
          },
        },
      ],
    });
    const child = menuItem({
      id: '22222222-2222-4222-8222-222222222222',
      stableId: childStableId,
      nameEn: 'Soup',
      nameZh: '汤',
      basePriceCents: 300,
    });
    const prisma = {
      menuItem: {
        findMany: jest.fn().mockResolvedValue([parent]),
        findFirst: jest.fn().mockResolvedValue(child),
      },
    };
    const builder = new OrderItemSnapshotBuilder(prisma as never);

    const [snapshot] = await builder.buildMany([
      {
        productStableId: parentStableId,
        qty: 1,
        optionsSnapshot: [
          {
            templateGroupStableId: 'group_combo_choice',
            choices: [{ stableId: 'choice_soup' }],
          },
        ],
      },
    ]);

    expect(snapshot?.optionsUnitPriceCents).toBe(100);
    expect(snapshot?.optionsSnapshot).toEqual([
      expect.objectContaining({
        templateGroupStableId: 'group_combo_choice',
        choices: [
          expect.objectContaining({
            stableId: 'choice_soup',
            targetItemStableId: childStableId,
          }),
        ],
      }),
    ]);
    expect(snapshot?.componentSnapshots).toEqual([
      expect.objectContaining({
        productStableId: childStableId,
        source: 'OPTION',
        sourceOptionStableId: 'choice_soup',
      }),
    ]);
  });
});
