import {
  buildDraftCategories,
  buildModifierFlatteningReport,
  buildUberDraftEdges,
  buildUberDraftTreeNodes,
} from './uber-menu-draft.projector';
import type { UberMenuGraph } from './uber-menu-graph.service';

describe('Uber menu draft projector', () => {
  const graph = {
    menuId: 'sanq:menu-node',
    categories: [
      {
        id: 'sanq:category-node',
        sourceStableId: 'cat-source',
        title: '主食',
        sortOrder: 0,
        entities: ['sanq:item-node'],
      },
    ],
    items: [
      {
        id: 'sanq:item-node',
        sourceType: 'MENU_ITEM',
        sourceStableId: 'item-source',
        title: '面',
        description: null,
        basePriceCents: 1000,
        priceCents: 1200,
        isAvailable: true,
        suspendUntilEpochSeconds: null,
        preparationType: 'PREPARED',
        modifierGroupIds: ['sanq:group-node'],
        hasDelta: true,
        imageUrl: '/images/noodles.jpg',
      },
      {
        id: 'sanq:option-node',
        sourceType: 'OPTION_ITEM',
        sourceStableId: 'option-source',
        title: '辣',
        description: null,
        basePriceCents: 0,
        priceCents: 100,
        isAvailable: true,
        suspendUntilEpochSeconds: null,
        preparationType: 'PREPARED',
        modifierGroupIds: [],
        hasDelta: false,
        imageUrl: null,
      },
    ],
    groups: [
      {
        id: 'sanq:group-node',
        sourceStableId: 'group-source',
        title: '辣度',
        minSelect: 0,
        maxSelect: 1,
        isAvailable: true,
        optionItemIds: ['sanq:option-node'],
      },
    ],
    mappingErrors: [],
  } satisfies UberMenuGraph;

  it('projects only SanQ stable ids into the Admin tree', () => {
    const before = JSON.stringify(graph);
    const categories = buildDraftCategories(graph);
    expect(categories[0].id).toBe('cat-source');
    expect(categories[0].items[0]).toMatchObject({
      id: 'item-source',
      displayName: '面',
      preparationType: 'PREPARED',
      imageUrl: '/images/noodles.jpg',
    });
    expect(categories[0].items[0].groups[0]).toMatchObject({
      id: 'group-source',
      name: '辣度',
    });
    expect(categories[0].items[0].groups[0].options[0]).toMatchObject({
      id: 'option-source',
      displayName: '辣',
      preparationType: 'PREPARED',
    });
    const tree = buildUberDraftTreeNodes(categories);
    expect(tree[0].children[0].children[0]).toMatchObject({
      id: 'group-source',
      type: 'group',
    });
    expect(JSON.stringify({ categories, tree })).not.toContain('sanq:');
    expect(JSON.stringify({ categories, tree })).not.toContain(
      'sourceStableId',
    );
    expect(JSON.stringify(graph)).toBe(before);
  });

  it('projects graph relationships into stable-id edges', () => {
    expect(buildUberDraftEdges(graph)).toEqual([
      { from: 'cat-source', to: 'item-source', type: 'CATEGORY_ITEM' },
      { from: 'item-source', to: 'group-source', type: 'ITEM_GROUP' },
      { from: 'group-source', to: 'option-source', type: 'GROUP_OPTION' },
    ]);
  });

  it('keeps flattening reports inside the publish graph identity space', () => {
    expect(
      buildModifierFlatteningReport(graph, [
        {
          sourceOptionChoiceStableId: 'option-source',
          compositeOptionItemId: 'sanq:option-node',
          sourcePath: ['option-source'],
        },
      ]),
    ).toMatchObject({
      groups: [{ groupId: 'sanq:group-node', valid: true }],
      combinations: [{ combinedPriceCents: 100 }],
    });
  });
});
