import {
  buildUberMenuGraph,
  buildUberNodeId,
  validateUberMenuGraph,
} from './uber-menu-graph.service';
import { emptyUberMenuDraftFilters } from './uber-menu-draft-source';

describe('Uber menu graph public identifiers', () => {
  it.each([
    ['menu', 'uber-store-1', 'sanq:769dd4c6e7f7a9488737197d'],
    ['category', 'cat-1', 'sanq:360f3470af545d5ff0f88a61'],
    ['item', 'item-1', 'sanq:517b30dd3588640d7deeca0e'],
    ['group', 'group-1', 'sanq:d71ac8d5eee90bc2a123c1de'],
    ['publish', 'version-1', 'sanq:1548e8f1a7ca63d1ff2acec0'],
  ] as const)('preserves the published %s id', (kind, stableId, expected) => {
    expect(buildUberNodeId(kind, 'store-1', stableId)).toBe(expected);
  });

  it('is deterministic for the same kind, storeId and stableId', () => {
    const first = buildUberNodeId('item', 'store-1', 'item-stable-1');
    expect(buildUberNodeId('item', 'store-1', 'item-stable-1')).toBe(first);
    expect(buildUberNodeId('item', 'store-1', 'item-stable-1')).toBe(first);
  });
});

describe('buildUberMenuGraph', () => {
  it('builds a graph from a Prisma-independent snapshot', () => {
    const graph = buildUberMenuGraph(
      {
        storeId: 'store-1',
        uberStoreId: 'uber-store-1',
        categories: [
          {
            id: 'db-cat',
            stableId: 'cat-1',
            nameEn: 'Mains',
            nameZh: '主菜',
            sortOrder: 1,
            isActive: true,
          },
        ],
        menuItems: [
          {
            stableId: 'item-1',
            categoryId: 'db-cat',
            nameEn: 'Noodles',
            nameZh: '面',
            basePriceCents: 1200,
            isAvailable: true,
            tempUnavailableUntil: null,
            sortOrder: 1,
            imageUrl: null,
            ingredientsEn: 'Wheat',
            optionGroups: [],
          },
        ],
        modifierTemplates: [],
        itemConfigs: [],
        optionConfigs: [],
        modifierConfigs: [],
        categoryConfigs: [],
      },
      emptyUberMenuDraftFilters(),
    );

    expect(graph.menuId).toBe('sanq:769dd4c6e7f7a9488737197d');
    expect(graph.categories[0].entities).toEqual([
      'sanq:517b30dd3588640d7deeca0e',
    ]);
    expect(graph.items[0]).toMatchObject({
      sourceStableId: 'item-1',
      title: 'Noodles 面',
      description: 'Wheat',
    });
  });

  it('keeps temporarily unavailable options in the Uber menu structure', () => {
    const suspendUntil = new Date('2090-01-02T03:04:05.000Z');
    const graph = buildUberMenuGraph(
      {
        storeId: 'store-1',
        uberStoreId: 'uber-store-1',
        categories: [
          {
            id: 'db-cat',
            stableId: 'cat-1',
            nameEn: 'Mains',
            nameZh: '主菜',
            sortOrder: 1,
            isActive: true,
          },
        ],
        menuItems: [
          {
            stableId: 'item-1',
            categoryId: 'db-cat',
            nameEn: 'Cool Noodle',
            nameZh: '凉皮',
            basePriceCents: 999,
            isAvailable: true,
            tempUnavailableUntil: null,
            sortOrder: 1,
            imageUrl: null,
            ingredientsEn: null,
            optionGroups: [{ templateGroupStableId: 'group-1', sortOrder: 1 }],
          },
        ],
        modifierTemplates: [
          {
            stableId: 'group-1',
            nameEn: 'Noodle',
            nameZh: '面型',
            defaultMinSelect: 1,
            defaultMaxSelect: 1,
            isAvailable: true,
            sortOrder: 1,
            options: [
              {
                stableId: 'rice-noodle',
                nameEn: 'Rice Noodle',
                nameZh: '米皮',
                priceDeltaCents: 0,
                isAvailable: true,
                tempUnavailableUntil: suspendUntil,
                sortOrder: 1,
                childTemplateGroupStableIds: [],
              },
            ],
          },
        ],
        itemConfigs: [],
        optionConfigs: [],
        modifierConfigs: [],
        categoryConfigs: [],
      },
      emptyUberMenuDraftFilters(),
    );
    const optionId = buildUberNodeId('item', 'store-1', 'rice-noodle');
    const option = graph.items.find((item) => item.id === optionId);
    expect(option).toMatchObject({
      sourceStableId: 'rice-noodle',
      isAvailable: false,
      suspendUntilEpochSeconds: Math.floor(suspendUntil.getTime() / 1_000),
    });

    const validated = validateUberMenuGraph(graph);
    expect(validated.graph.groups[0]?.optionItemIds).toContain(optionId);
    expect(
      validated.graph.items.some((item) => item.id === optionId),
    ).toBe(true);
    expect(validated.warnings).toEqual([]);
  });
});
