import type {
  UberMenuDraftDiffResult,
  UberMenuDraftEdgeDto,
  UberMenuDraftResult,
} from './uber-menu-diff.types';

const object = (value: unknown): Record<string, unknown> | null =>
  value !== null && typeof value === 'object' && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
const string = (value: unknown) =>
  typeof value === 'string' && value.length ? value : null;

export function extractPublishedSnapshotFromPayload(payload: unknown) {
  const itemIds = new Set<string>();
  const groupIds = new Set<string>();
  const edgeKeys = new Set<string>();
  const root = object(payload);
  if (!root) return { itemIds, groupIds, edgeKeys };
  for (const raw of Array.isArray(root.categories) ? root.categories : []) {
    const category = object(raw);
    const id = string(category?.id);
    if (!id) continue;
    for (const entity of Array.isArray(category?.entities)
      ? category.entities
      : []) {
      const itemId = string(object(entity)?.id) ?? string(entity);
      if (itemId) edgeKeys.add(`CATEGORY_ITEM:${id}->${itemId}`);
    }
  }
  for (const raw of Array.isArray(root.items) ? root.items : []) {
    const item = object(raw);
    const id = string(item?.id);
    if (!id) continue;
    itemIds.add(id);
    for (const group of Array.isArray(item?.modifier_group_ids)
      ? item.modifier_group_ids
      : []) {
      const groupId = string(group);
      if (groupId) edgeKeys.add(`ITEM_GROUP:${id}->${groupId}`);
    }
  }
  for (const raw of Array.isArray(root.modifier_groups)
    ? root.modifier_groups
    : []) {
    const group = object(raw);
    const id = string(group?.id);
    if (!id) continue;
    groupIds.add(id);
    for (const rawOption of Array.isArray(group?.modifier_options)
      ? group.modifier_options
      : []) {
      const optionId = string(object(rawOption)?.id);
      if (optionId) edgeKeys.add(`GROUP_OPTION:${id}->${optionId}`);
    }
  }
  return { itemIds, groupIds, edgeKeys };
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
  publishedMenuItemIds: Iterable<string>;
  publishedOptionItemIds: Iterable<string>;
}): UberMenuDraftDiffResult {
  const snapshot = extractPublishedSnapshotFromPayload(input.publishedPayload);
  const publishedItems = new Set(input.publishedMenuItemIds);
  const publishedOptions = new Set(input.publishedOptionItemIds);
  const changed = input.draft.uberDraft.items.filter((item) => item.hasDelta);
  const itemIds = new Set(input.draft.uberDraft.items.map((item) => item.id));
  const groupIds = new Set(
    input.draft.uberDraft.groups.map((group) => group.id),
  );
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
          ? !publishedItems.has(item.sourceStableId)
          : !publishedOptions.has(item.sourceStableId),
      )
      .map((item) => item.sourceStableId),
    modifiedItems: changed.map((item) => ({
      sourceType: item.sourceType,
      stableId: item.sourceStableId,
      priceCents: item.priceCents,
      isAvailable: item.isAvailable,
    })),
    deletedItems: [...snapshot.itemIds].filter((id) => !itemIds.has(id)),
    addedGroups: input.draft.uberDraft.groups
      .filter(
        (group) =>
          group.optionItemIds.length > 0 && !snapshot.groupIds.has(group.id),
      )
      .map((group) => group.sourceStableId),
    modifiedGroups: input.draft.uberDraft.groups
      .filter(
        (group) =>
          snapshot.groupIds.has(group.id) &&
          (group.minSelect > 0 || group.maxSelect > 1),
      )
      .map((group) => ({
        stableId: group.sourceStableId,
        minSelect: group.minSelect,
        maxSelect: group.maxSelect,
      })),
    deletedGroups: [...snapshot.groupIds].filter((id) => !groupIds.has(id)),
    hierarchyChanges: input.draft.uberDraft.edges.filter(
      (edge) => !snapshot.edgeKeys.has(`${edge.type}:${edge.from}->${edge.to}`),
    ),
    deletedEdges: [...snapshot.edgeKeys]
      .filter((key) => !edgeKeys.has(key))
      .map(decodeDraftEdgeKey)
      .filter((edge): edge is UberMenuDraftEdgeDto => edge !== null),
    priceChanges: changed.map((item) => ({
      sourceType: item.sourceType,
      stableId: item.sourceStableId,
      priceCents: item.priceCents,
    })),
    availabilityChanges: changed.map((item) => ({
      sourceType: item.sourceType,
      stableId: item.sourceStableId,
      isAvailable: item.isAvailable,
    })),
  };
}
