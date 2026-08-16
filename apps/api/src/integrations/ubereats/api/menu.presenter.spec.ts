import { presentMenuDiff, presentMenuDraft } from './menu.presenter';

const categoryTree = {
  id: 'category-stable-1',
  name: '主食',
  items: [
    {
      id: 'item-stable-1',
      displayName: '肉夹馍',
      displayDescription: '现烤',
      priceCents: 1099,
      isAvailable: true,
      imageUrl: 'https://cdn.example/item.jpg',
      groups: [
        {
          id: 'group-stable-1',
          name: '加料',
          minSelect: 0,
          maxSelect: 1,
          options: [
            {
              id: 'option-stable-1',
              displayName: '加辣',
              priceDeltaCents: 0,
              isAvailable: true,
              childGroups: [],
            },
          ],
        },
      ],
    },
  ],
};

const internalDraft = {
  storeId: 'store-1',
  sourceMenu: {
    categories: 1,
    items: 1,
    optionItems: 1,
    groups: 1,
    tree: { categories: [categoryTree] },
    persistenceRevision: 42,
  },
  uberDraft: {
    edges: [
      {
        from: 'category-stable-1',
        to: 'item-stable-1',
        type: 'CATEGORY_ITEM',
      },
    ],
    tree: { categories: [categoryTree] },
    treeNodes: [
      {
        id: 'category-stable-1',
        type: 'category',
        name: '主食',
        source: 'AUTO-MAPPED',
        children: [],
      },
    ],
    optionMappings: [
      {
        stableId: 'option-stable-1',
        sourcePath: ['option-stable-1'],
      },
    ],
    menuId: 'sanq:must-not-leak-menu',
    categories: [{ id: 'sanq:must-not-leak-category' }],
    items: [{ id: 'sanq:must-not-leak-item' }],
    groups: [{ id: 'sanq:must-not-leak-group' }],
    accessToken: 'must-not-leak',
  },
  mappingWarnings: [
    {
      code: 'IMAGE_MISSING',
      severity: 'WARNING',
      path: '$.items[0]',
      stableId: 'item-stable-1',
      message: '缺少图片',
      sourceStableId: 'sanq:must-not-leak-warning',
    },
  ],
  mappingErrors: [
    {
      code: 'MAPPING_FAILED',
      stableId: 'option-stable-1',
      message: '映射失败',
      sourceOptionChoiceStableId: 'sanq:must-not-leak-mapping',
    },
  ],
  validation: {
    warnings: [],
    errors: [
      {
        code: 'INVALID',
        severity: 'ERROR',
        path: '$.items[0]',
        stableId: 'item-stable-1',
        message: '无效',
      },
    ],
  },
  publishSummary: {
    totalItems: 2,
    changedItems: 1,
    totalCategories: 1,
    totalModifierGroups: 1,
  },
  serviceAvailability: [
    {
      day_of_week: 'MONDAY',
      time_periods: [{ start_time: '09:00', end_time: '17:00' }],
    },
  ],
  serviceAvailabilityTimezone: 'America/New_York',
  dirty: true,
  lastPublishedVersion: {
    versionStableId: 'version-1',
    status: 'SUCCEEDED',
    createdAt: new Date('2026-01-01T00:00:00Z'),
    totalItems: 2,
    changedItems: 1,
    errorMessage: null,
    errorDetails: null,
    finishedAt: new Date('2026-01-01T00:01:00Z'),
    stack: 'must-not-leak',
  },
  refreshToken: 'must-not-leak',
  clientSecret: 'must-not-leak',
};

describe('menu public presenters', () => {
  it('exposes only stable-id Admin draft resources', () => {
    const response = presentMenuDraft(internalDraft);

    expect(response.uberDraft.tree.categories[0]).toMatchObject(categoryTree);
    expect(response.sourceMenu.tree.categories[0]).toMatchObject(categoryTree);
    expect(response.uberDraft.treeNodes).toHaveLength(1);
    expect(response.uberDraft.edges).toEqual([
      {
        from: 'category-stable-1',
        to: 'item-stable-1',
        type: 'CATEGORY_ITEM',
      },
    ]);
    expect(response.uberDraft.optionMappings).toEqual([
      { stableId: 'option-stable-1', sourcePath: ['option-stable-1'] },
    ]);
    expect(response.mappingWarnings[0]).toMatchObject({
      code: 'IMAGE_MISSING',
      stableId: 'item-stable-1',
    });
    expect(response.validation.errors[0]).toMatchObject({
      code: 'INVALID',
      stableId: 'item-stable-1',
    });
    expect(response.contractVersion).toBe('2');

    const serialized = JSON.stringify(response);
    for (const forbidden of [
      'sanq:',
      'menuId',
      'sourceStableId',
      'sourceMenuItemStableId',
      'sourceOptionChoiceStableId',
      'sourceTemplateGroupStableId',
      'compositeOptionItemId',
      'accessToken',
      'refreshToken',
      'clientSecret',
      'persistenceRevision',
      'stack',
      'must-not-leak',
    ]) {
      expect(serialized).not.toContain(forbidden);
    }
  });

  it('presents every field consumed by the web diff view', () => {
    const response = presentMenuDiff({
      storeId: 'store-1',
      lastPublishedAt: new Date('2026-01-02T00:00:00Z'),
      addedItems: ['item-1'],
      modifiedItems: [],
      deletedItems: [],
      addedGroups: [],
      modifiedGroups: [],
      deletedGroups: ['group-1'],
      hierarchyChanges: [],
      deletedEdges: [{ from: 'a', to: 'b', type: 'ITEM_GROUP' }],
      priceChanges: [
        { sourceType: 'MENU_ITEM', stableId: 'item-1', priceCents: 1099 },
      ],
      availabilityChanges: [
        { sourceType: 'MENU_ITEM', stableId: 'item-1', isAvailable: true },
      ],
      internalSnapshot: 'must-not-leak',
    });

    expect(response).toMatchObject({
      storeId: 'store-1',
      lastPublishedAt: '2026-01-02T00:00:00.000Z',
      deletedGroups: ['group-1'],
      contractVersion: '2',
    });
    expect(response.deletedEdges).toHaveLength(1);
    expect(response.priceChanges).toHaveLength(1);
    expect(response.availabilityChanges).toHaveLength(1);
    expect(JSON.stringify(response)).not.toContain('internalSnapshot');
  });
});
