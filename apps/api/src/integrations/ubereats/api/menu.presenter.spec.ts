import { presentMenuDiff, presentMenuDraft } from './menu.presenter';

const categoryTree = {
  id: 'category-1',
  name: '主食',
  items: [
    {
      id: 'item-1',
      sourceMenuItemStableId: 'source-item-1',
      displayName: '肉夹馍',
      displayDescription: '现烤',
      priceCents: 1099,
      isAvailable: true,
      imageUrl: 'https://cdn.example/item.jpg',
      groups: [
        {
          id: 'group-1',
          name: '加料',
          minSelect: 0,
          maxSelect: 1,
          options: [
            {
              id: 'option-1',
              sourceOptionChoiceStableId: 'source-option-1',
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
    menuId: 'menu-1',
    categories: [{ id: 'category-1', title: '主食', entities: ['item-1'] }],
    items: [
      { id: 'item-1', title: '肉夹馍', rawUberPayload: { secret: true } },
    ],
    groups: [{ id: 'group-1', title: '加料', optionItemIds: ['option-1'] }],
    edges: [{ from: 'category-1', to: 'item-1', type: 'CATEGORY_ITEM' }],
    tree: { categories: [categoryTree] },
    treeNodes: [
      {
        id: 'category-1',
        type: 'category',
        name: '主食',
        source: 'AUTO-MAPPED',
        children: [],
      },
    ],
    optionMappings: [
      {
        sourceOptionChoiceStableId: 'source-option-1',
        compositeOptionItemId: 'option-1',
        sourcePath: ['source-option-1'],
      },
    ],
    accessToken: 'must-not-leak',
  },
  mappingWarnings: [
    {
      code: 'IMAGE_MISSING',
      severity: 'WARNING',
      path: '$.items[0]',
      sourceStableId: 'source-item-1',
      message: '缺少图片',
    },
  ],
  mappingErrors: [
    {
      code: 'MAPPING_FAILED',
      sourceOptionChoiceStableId: 'source-option-1',
      message: '映射失败',
    },
  ],
  validation: {
    warnings: [],
    errors: [
      {
        code: 'INVALID',
        severity: 'ERROR',
        path: '$.items[0]',
        sourceStableId: 'source-item-1',
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
  it('presents the complete menu workspace contract while retaining its security boundary', () => {
    const response = presentMenuDraft(internalDraft);

    expect(response.uberDraft.tree.categories[0]).toMatchObject(categoryTree);
    expect(response.sourceMenu.tree.categories[0]).toMatchObject(categoryTree);
    expect(response.uberDraft.treeNodes).toHaveLength(1);
    expect(response.uberDraft.edges).toHaveLength(1);
    expect(response.uberDraft.optionMappings).toHaveLength(1);
    expect(response.mappingWarnings[0]).toMatchObject({
      code: 'IMAGE_MISSING',
    });
    expect(response.mappingErrors[0]).toMatchObject({ code: 'MAPPING_FAILED' });
    expect(response.validation.errors[0]).toMatchObject({ code: 'INVALID' });
    expect(response.publishSummary).toEqual({
      totalItems: 2,
      changedItems: 1,
      totalCategories: 1,
      totalModifierGroups: 1,
    });
    expect(response.serviceAvailabilityTimezone).toBe('America/New_York');
    expect(response.dirty).toBe(true);
    expect(response.lastPublishedVersion?.createdAt).toBe(
      '2026-01-01T00:00:00.000Z',
    );
    expect(response.contractVersion).toBe('2');

    // Exercise the same required property chain that previously crashed MenuWorkspace.
    expect(
      response.uberDraft.tree.categories.flatMap((category) => {
        const record = category as { items: unknown[] };
        return record.items;
      }),
    ).toHaveLength(1);
    const serialized = JSON.stringify(response);
    for (const forbidden of [
      'accessToken',
      'refreshToken',
      'clientSecret',
      'rawUberPayload',
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
