import { buildUberMenuGraph, buildUberNodeId } from './uber-menu-graph.service';
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
        childGroupBindings: [],
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
});
