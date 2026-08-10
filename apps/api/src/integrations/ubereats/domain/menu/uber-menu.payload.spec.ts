import {
  buildUberUploadMenuPayload,
  flattenUberModifierCombinations,
  validateUberMenuPayload,
} from './uber-menu.payload';

const graph = {
  menuId: 'menu-1',
  categories: [{ id: 'cat-1', title: 'Main', entities: ['item-1'] }],
  items: [
    {
      id: 'item-1',
      sourceType: 'MENU_ITEM' as const,
      sourceStableId: 'dish-1',
      title: 'Noodles',
      description: null,
      priceCents: 1299,
      isAvailable: true,
      modifierGroupIds: ['group-1'],
      imageUrl: null,
    },
  ],
  groups: [
    {
      id: 'group-1',
      title: 'Size',
      minSelect: 1,
      maxSelect: 1,
      optionItemIds: [],
    },
  ],
};

describe('uber-menu.payload', () => {
  it('builds the wire payload from a resolved menu graph', () => {
    const payload = buildUberUploadMenuPayload(graph, [], 13);
    expect(payload.menus[0]).toMatchObject({
      id: 'menu-1',
      category_ids: ['cat-1'],
    });
    expect(payload.items[0]).toMatchObject({
      id: 'item-1',
      price_info: { price: 1299, overrides: [] },
    });
  });

  it('flattens nested modifier choices as a cartesian product', () => {
    expect(
      flattenUberModifierCombinations([
        ['small', 'large'],
        ['hot', 'cold'],
      ]),
    ).toEqual([
      ['small', 'hot'],
      ['small', 'cold'],
      ['large', 'hot'],
      ['large', 'cold'],
    ]);
  });

  it('reports dangling payload references', () => {
    const payload = buildUberUploadMenuPayload(graph, [], 13);
    payload.categories[0].entities = [{ id: 'missing', type: 'ITEM' }];
    expect(validateUberMenuPayload(payload)).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          severity: 'ERROR',
          path: '$.categories[0].entities[0].id',
        }),
      ]),
    );
  });
});
