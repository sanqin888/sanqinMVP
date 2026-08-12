import {
  buildUberMenuDraftDiff,
  decodeDraftEdgeKey,
  extractPublishedSnapshotFromPayload,
} from './uber-menu-diff.service';
import type { UberMenuDraftResult } from '../../application/ports/uber-menu-draft.ports';

describe('Uber menu diff service', () => {
  it('tolerates an unparseable historical payload', () => {
    expect(extractPublishedSnapshotFromPayload('legacy')).toEqual({
      itemIds: new Set(),
      groupIds: new Set(),
      edgeKeys: new Set(),
    });
    expect(decodeDraftEdgeKey('broken')).toBeNull();
  });

  it('compares added, modified and deleted items, groups and edges', () => {
    const draft = {
      uberDraft: {
        items: [
          {
            id: 'kept-item',
            sourceType: 'MENU_ITEM',
            sourceStableId: 'kept-source',
            priceCents: 150,
            isAvailable: false,
            hasDelta: true,
          },
          {
            id: 'new-option',
            sourceType: 'OPTION_ITEM',
            sourceStableId: 'new-option-source',
            priceCents: 25,
            isAvailable: true,
            hasDelta: true,
          },
        ],
        groups: [
          {
            id: 'kept-group',
            sourceStableId: 'kept-group-source',
            minSelect: 1,
            maxSelect: 2,
            optionItemIds: ['new-option'],
          },
          {
            id: 'new-group',
            sourceStableId: 'new-group-source',
            minSelect: 0,
            maxSelect: 1,
            optionItemIds: ['new-option'],
          },
        ],
        edges: [{ from: 'kept-group', to: 'new-option', type: 'GROUP_OPTION' }],
      },
    } as UberMenuDraftResult;
    const result = buildUberMenuDraftDiff({
      storeId: 'store',
      draft,
      lastPublishedAt: new Date(0),
      publishedMenuItemIds: ['kept-source'],
      publishedOptionItemIds: [],
      publishedPayload: {
        categories: [
          { id: 'old-category', entities: [{ id: 'deleted-item' }] },
        ],
        items: [
          { id: 'deleted-item', modifier_group_ids: ['deleted-group'] },
          { id: 'kept-item', modifier_group_ids: ['kept-group'] },
        ],
        modifier_groups: [
          { id: 'deleted-group', modifier_options: [{ id: 'deleted-item' }] },
          { id: 'kept-group', modifier_options: [] },
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
    expect(result.hierarchyChanges).toEqual([
      { from: 'kept-group', to: 'new-option', type: 'GROUP_OPTION' },
    ]);
    expect(result.deletedEdges).toHaveLength(4);
  });
});
