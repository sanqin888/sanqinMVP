import {
  buildUberMenuDraftDiff,
  decodeDraftEdgeKey,
  extractPublishedSnapshotFromPayload,
} from './uber-menu-diff.service';
import type { UberMenuDraftResult } from '../../application/menu/uber-menu-draft.ports';
import { buildUberNodeId } from './uber-menu-graph.service';

describe('Uber menu diff service', () => {
  it('tolerates an unparseable historical payload', () => {
    expect(extractPublishedSnapshotFromPayload('legacy')).toEqual({
      edgeKeys: new Set(),
      preparationTypes: new Map(),
    });
    expect(decodeDraftEdgeKey('broken')).toBeNull();
  });

  it('compares added, modified and deleted resources using stable ids', () => {
    const storeId = 'store';
    const nodeId = (kind: 'category' | 'item' | 'group', stableId: string) =>
      buildUberNodeId(kind, storeId, stableId);
    const draft = {
      uberDraft: {
        categories: [
          { stableId: 'kept-category', itemStableIds: ['kept-source'] },
        ],
        items: [
          {
            sourceType: 'MENU_ITEM',
            stableId: 'kept-source',
            priceCents: 150,
            isAvailable: false,
            preparationType: 'PREPACKAGED',
            hasDelta: true,
          },
          {
            sourceType: 'OPTION_ITEM',
            stableId: 'new-option-source',
            priceCents: 25,
            isAvailable: true,
            preparationType: 'PREPARED',
            hasDelta: true,
          },
        ],
        groups: [
          {
            stableId: 'kept-group-source',
            minSelect: 1,
            maxSelect: 2,
            optionStableIds: ['new-option-source'],
          },
          {
            stableId: 'new-group-source',
            minSelect: 0,
            maxSelect: 1,
            optionStableIds: ['new-option-source'],
          },
        ],
        edges: [
          {
            from: 'kept-group-source',
            to: 'new-option-source',
            type: 'GROUP_OPTION',
          },
        ],
      },
    } as UberMenuDraftResult;
    const result = buildUberMenuDraftDiff({
      storeId,
      draft,
      lastPublishedAt: new Date(0),
      publishedCategoryIds: ['old-category', 'kept-category'],
      publishedMenuItemIds: ['kept-source', 'deleted-item'],
      publishedOptionItemIds: [],
      publishedGroupIds: ['kept-group-source', 'deleted-group'],
      publishedPayload: {
        categories: [
          {
            id: nodeId('category', 'old-category'),
            entities: [{ id: nodeId('item', 'deleted-item') }],
          },
        ],
        items: [
          {
            id: nodeId('item', 'deleted-item'),
            modifier_group_ids: [nodeId('group', 'deleted-group')],
          },
          {
            id: nodeId('item', 'kept-source'),
            dish_info: { classifications: {} },
            modifier_group_ids: [nodeId('group', 'kept-group-source')],
          },
        ],
        modifier_groups: [
          {
            id: nodeId('group', 'deleted-group'),
            modifier_options: [{ id: nodeId('item', 'deleted-item') }],
          },
          {
            id: nodeId('group', 'kept-group-source'),
            modifier_options: [],
          },
        ],
      },
    });
    expect(result.addedItems).toEqual(['new-option-source']);
    expect(result.modifiedItems).toHaveLength(2);
    expect(result.deletedItems).toEqual(['deleted-item']);
    expect(result.addedGroups).toEqual(['new-group-source']);
    expect(result.modifiedGroups).toEqual([
      { stableId: 'kept-group-source', minSelect: 1, maxSelect: 2 },
    ]);
    expect(result.deletedGroups).toEqual(['deleted-group']);
    expect(result.preparationTypeChanges).toEqual([
      {
        sourceType: 'MENU_ITEM',
        stableId: 'kept-source',
        preparationType: 'PREPACKAGED',
      },
      {
        sourceType: 'OPTION_ITEM',
        stableId: 'new-option-source',
        preparationType: 'PREPARED',
      },
    ]);
    expect(result.hierarchyChanges).toEqual([
      {
        from: 'kept-group-source',
        to: 'new-option-source',
        type: 'GROUP_OPTION',
      },
    ]);
    expect(JSON.stringify(result)).not.toContain('sanq:');
  });
});
