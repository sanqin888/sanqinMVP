import type {
  CatalogOrderFactsReaderPort,
  CatalogOrderItemMaterializationFact,
} from '../menu/public-api';
import { OrderItemSnapshotBuilder } from './order-item-snapshot.builder';

const parentStableId = 'c1234567890abcdefghijklmn';
const childStableId = 'c2234567890abcdefghijklmn';

function menuItem(
  overrides: Partial<CatalogOrderItemMaterializationFact> = {},
): CatalogOrderItemMaterializationFact {
  return {
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

function reader(params: {
  initial: CatalogOrderItemMaterializationFact[];
  linked?: CatalogOrderItemMaterializationFact | null;
}): CatalogOrderFactsReaderPort {
  return {
    findHiddenMenuItemStableIds: jest.fn().mockResolvedValue([]),
    getOrderItemMaterializationFacts: jest
      .fn()
      .mockResolvedValue(params.initial),
    getActiveOrderItemMaterializationFact: jest
      .fn()
      .mockResolvedValue(params.linked ?? null),
    getOrderLabelConfigs: jest.fn().mockResolvedValue([]),
  };
}

describe('OrderItemSnapshotBuilder', () => {
  it('keeps the same option stable id when selected in different component group paths', () => {
    const builder = new OrderItemSnapshotBuilder({} as never) as unknown as {
      collectOptionSelectionRefs: (
        options?: Record<string, unknown>,
      ) => Array<{ optionId: string; groupKey?: string; sequence: number }>;
    };

    expect(
      builder.collectOptionSelectionRefs({
        'root__combo__component-soup-a__group-spice': ['mild'],
        'root__combo__component-soup-b__group-spice': ['mild'],
      }),
    ).toEqual([
      {
        optionId: 'mild',
        groupKey: 'root__combo__component-soup-a__group-spice',
        sequence: 0,
      },
      {
        optionId: 'mild',
        groupKey: 'root__combo__component-soup-b__group-spice',
        sequence: 1,
      },
    ]);
  });

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
      stableId: childStableId,
      nameEn: 'Soup',
      nameZh: '汤',
      basePriceCents: 300,
    });
    const catalogOrderFacts = reader({ initial: [parent], linked: child });
    const builder = new OrderItemSnapshotBuilder(catalogOrderFacts);

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
            options: [
              {
                stableId: 'choice_soup',
                nameEn: 'Soup',
                nameZh: '汤',
                priceDeltaCents: 100,
                sortOrder: 0,
                isAvailable: true,
                tempUnavailableUntil: null,
                targetItemStableId: childStableId,
              },
            ],
          },
        },
      ],
    });
    const child = menuItem({
      stableId: childStableId,
      nameEn: 'Soup',
      nameZh: '汤',
      basePriceCents: 300,
    });
    const builder = new OrderItemSnapshotBuilder(
      reader({ initial: [parent], linked: child }),
    );

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
