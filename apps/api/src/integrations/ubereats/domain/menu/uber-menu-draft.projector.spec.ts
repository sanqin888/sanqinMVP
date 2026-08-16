import {
  buildDraftCategories,
  buildModifierFlatteningReport,
  buildUberDraftEdges,
  buildUberDraftTreeNodes,
} from './uber-menu-draft.projector';
import type { UberMenuGraph } from './uber-menu-graph.service';

describe('Uber menu draft projector', () => {
  const graph = {
    menuId: 'menu',
    categories: [
      {
        id: 'cat',
        sourceStableId: 'cat-source',
        title: '主食',
        sortOrder: 0,
        entities: ['item'],
      },
    ],
    items: [
      {
        id: 'item',
        sourceType: 'MENU_ITEM',
        sourceStableId: 'item-source',
        title: '面',
        description: null,
        basePriceCents: 1000,
        priceCents: 1200,
        isAvailable: true,
        modifierGroupIds: ['group'],
        hasDelta: true,
        imageUrl: '/images/noodles.jpg',
      },
      {
        id: 'option',
        sourceType: 'OPTION_ITEM',
        sourceStableId: 'option-source',
        title: '辣',
        description: null,
        basePriceCents: 0,
        priceCents: 100,
        isAvailable: true,
        modifierGroupIds: [],
        hasDelta: false,
        imageUrl: null,
      },
    ],
    groups: [
      {
        id: 'group',
        sourceStableId: 'group-source',
        title: '辣度',
        minSelect: 0,
        maxSelect: 1,
        isAvailable: true,
        optionItemIds: ['option'],
      },
    ],
    mappingErrors: [],
  } satisfies UberMenuGraph;

  it('projects new objects without mutating the graph', () => {
    const before = JSON.stringify(graph);
    const categories = buildDraftCategories(graph);
    expect(categories[0].items[0].groups[0].options[0].displayName).toBe('辣');
    expect(categories[0].items[0].imageUrl).toBe('/images/noodles.jpg');
    const tree = buildUberDraftTreeNodes(categories);
    expect(tree[0].children[0].type).toBe('item');
    expect(tree[0].children[0].children[0]).toMatchObject({
      id: 'group',
      sourceStableId: 'group-source',
    });
    expect(JSON.stringify(graph)).toBe(before);
    expect(categories).not.toBe(graph.categories);
  });

  it('projects category, group and option edges', () => {
    expect(buildUberDraftEdges(graph)).toEqual([
      { from: 'cat', to: 'item', type: 'CATEGORY_ITEM' },
      { from: 'item', to: 'group', type: 'ITEM_GROUP' },
      { from: 'group', to: 'option', type: 'GROUP_OPTION' },
    ]);
  });

  it('reports valid flattened modifier references', () => {
    expect(
      buildModifierFlatteningReport(graph, [
        {
          sourceOptionChoiceStableId: 'source',
          compositeOptionItemId: 'option',
          sourcePath: ['source'],
        },
      ]),
    ).toMatchObject({
      groups: [{ groupId: 'group', valid: true }],
      combinations: [{ combinedPriceCents: 100 }],
    });
  });
});
