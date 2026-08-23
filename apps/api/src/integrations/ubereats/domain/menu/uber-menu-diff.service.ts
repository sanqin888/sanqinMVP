import type {
  UberMenuDraftDiffResult,
  UberMenuDraftEdgeDto,
  UberMenuDraftResult,
} from './uber-menu-diff.types';
import { buildUberNodeId } from './uber-menu-graph.service';

const object = (value: unknown): Record<string, unknown> | null =>
  value !== null && typeof value === 'object' && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
const string = (value: unknown) =>
  typeof value === 'string' && value.length ? value : null;

export function extractPublishedSnapshotFromPayload(
  payload: unknown,
  resolveNodeId: (nodeId: string) => string | null = () => null,
) {
  const edgeKeys = new Set<string>();
  const preparationTypes = new Map<string, '' | 'PREPACKAGED'>();
  const root = object(payload);
  if (!root) return { edgeKeys, preparationTypes };
  for (const raw of Array.isArray(root.categories) ? root.categories : []) {
    const category = object(raw);
    const categoryNodeId = string(category?.id);
    const categoryStableId = categoryNodeId
      ? resolveNodeId(categoryNodeId)
      : null;
    if (!categoryStableId) continue;
    for (const entity of Array.isArray(category?.entities)
      ? category.entities
      : []) {
      const itemNodeId = string(object(entity)?.id) ?? string(entity);
      const itemStableId = itemNodeId ? resolveNodeId(itemNodeId) : null;
      if (itemStableId) {
        edgeKeys.add(`CATEGORY_ITEM:${categoryStableId}->${itemStableId}`);
      }
    }
  }
  for (const raw of Array.isArray(root.items) ? root.items : []) {
    const item = object(raw);
    const itemNodeId = string(item?.id);
    const itemStableId = itemNodeId ? resolveNodeId(itemNodeId) : null;
    if (!itemStableId) continue;
    const dishInfo = object(item?.dish_info);
    const classifications = object(dishInfo?.classifications);
    const preparationType = classifications?.preparation_type;
    if (preparationType === '' || preparationType === 'PREPACKAGED')
      preparationTypes.set(itemStableId, preparationType);
    for (const group of Array.isArray(item?.modifier_group_ids)
      ? item.modifier_group_ids
      : []) {
      const groupNodeId = string(group);
      const groupStableId = groupNodeId ? resolveNodeId(groupNodeId) : null;
      if (groupStableId) {
        edgeKeys.add(`ITEM_GROUP:${itemStableId}->${groupStableId}`);
      }
    }
  }
  for (const raw of Array.isArray(root.modifier_groups)
    ? root.modifier_groups
    : []) {
    const group = object(raw);
    const groupNodeId = string(group?.id);
    const groupStableId = groupNodeId ? resolveNodeId(groupNodeId) : null;
    if (!groupStableId) continue;
    for (const rawOption of Array.isArray(group?.modifier_options)
      ? group.modifier_options
      : []) {
      const optionNodeId = string(object(rawOption)?.id);
      const optionStableId = optionNodeId ? resolveNodeId(optionNodeId) : null;
      if (optionStableId) {
        edgeKeys.add(`GROUP_OPTION:${groupStableId}->${optionStableId}`);
      }
    }
  }
  return { edgeKeys, preparationTypes };
}

export function decodeDraftEdgeKey(
  edgeKey: string,
): UberMenuDraftEdgeDto | null {
  const match = /^([^:]+):(.+)->(.+)$/.exec(edgeKey);
  return match ? { type: match[1], from: match[2], to: match[3] } : null;
}

export function buildUberMenuDraftDiff(input: {
  storeId: string;
  draft: UberMenuDraftResult;
  lastPublishedAt: Date | null;
  publishedPayload: unknown;
  publishedCategoryIds: Iterable<string>;
  publishedMenuItemIds: Iterable<string>;
  publishedOptionItemIds: Iterable<string>;
  publishedGroupIds: Iterable<string>;
}): UberMenuDraftDiffResult {
  const publishedCategories = new Set(input.publishedCategoryIds);
  const publishedItems = new Set(input.publishedMenuItemIds);
  const publishedOptions = new Set(input.publishedOptionItemIds);
  const publishedGroups = new Set(input.publishedGroupIds);
  const currentCategories = new Set(
    input.draft.uberDraft.categories.map((category) => category.stableId),
  );
  const currentItems = new Set(
    input.draft.uberDraft.items.map((item) => item.stableId),
  );
  const currentGroups = new Set(
    input.draft.uberDraft.groups.map((group) => group.stableId),
  );
  const nodeStableIds = new Map<string, string>();
  const remember = (
    kind: 'category' | 'item' | 'group',
    stableIds: Iterable<string>,
  ) => {
    for (const stableId of stableIds) {
      nodeStableIds.set(
        buildUberNodeId(kind, input.storeId, stableId),
        stableId,
      );
    }
  };
  remember('category', new Set([...currentCategories, ...publishedCategories]));
  remember(
    'item',
    new Set([...currentItems, ...publishedItems, ...publishedOptions]),
  );
  remember('group', new Set([...currentGroups, ...publishedGroups]));
  const snapshot = extractPublishedSnapshotFromPayload(
    input.publishedPayload,
    (nodeId) => nodeStableIds.get(nodeId) ?? null,
  );
  const changed = input.draft.uberDraft.items.filter((item) => item.hasDelta);
  const preparationTypeChanges = input.draft.uberDraft.items
    .filter((item) => {
      const current =
        item.preparationType === 'PREPACKAGED'
          ? 'PREPACKAGED'
          : item.preparationType === 'PREPARED'
            ? ''
            : null;
      return snapshot.preparationTypes.get(item.stableId) !== current;
    })
    .map((item) => ({
      sourceType: item.sourceType,
      stableId: item.stableId,
      preparationType: item.preparationType,
    }));
  const edgeKeys = new Set(
    input.draft.uberDraft.edges.map(
      (edge) => `${edge.type}:${edge.from}->${edge.to}`,
    ),
  );
  return {
    storeId: input.storeId,
    lastPublishedAt: input.lastPublishedAt,
    addedItems: changed
      .filter((item) =>
        item.sourceType === 'MENU_ITEM'
          ? !publishedItems.has(item.stableId)
          : !publishedOptions.has(item.stableId),
      )
      .map((item) => item.stableId),
    modifiedItems: changed.map((item) => ({
      sourceType: item.sourceType,
      stableId: item.stableId,
      priceCents: item.priceCents,
      isAvailable: item.isAvailable,
    })),
    deletedItems: [...publishedItems, ...publishedOptions].filter(
      (stableId) => !currentItems.has(stableId),
    ),
    addedGroups: input.draft.uberDraft.groups
      .filter(
        (group) =>
          group.optionStableIds.length > 0 &&
          !publishedGroups.has(group.stableId),
      )
      .map((group) => group.stableId),
    modifiedGroups: input.draft.uberDraft.groups
      .filter(
        (group) =>
          publishedGroups.has(group.stableId) &&
          (group.minSelect > 0 || group.maxSelect > 1),
      )
      .map((group) => ({
        stableId: group.stableId,
        minSelect: group.minSelect,
        maxSelect: group.maxSelect,
      })),
    deletedGroups: [...publishedGroups].filter(
      (stableId) => !currentGroups.has(stableId),
    ),
    hierarchyChanges: input.draft.uberDraft.edges.filter(
      (edge) => !snapshot.edgeKeys.has(`${edge.type}:${edge.from}->${edge.to}`),
    ),
    deletedEdges: [...snapshot.edgeKeys]
      .filter((key) => !edgeKeys.has(key))
      .map(decodeDraftEdgeKey)
      .filter((edge): edge is UberMenuDraftEdgeDto => edge !== null),
    priceChanges: changed.map((item) => ({
      sourceType: item.sourceType,
      stableId: item.stableId,
      priceCents: item.priceCents,
    })),
    availabilityChanges: changed.map((item) => ({
      sourceType: item.sourceType,
      stableId: item.stableId,
      isAvailable: item.isAvailable,
    })),
    preparationTypeChanges,
  };
}
