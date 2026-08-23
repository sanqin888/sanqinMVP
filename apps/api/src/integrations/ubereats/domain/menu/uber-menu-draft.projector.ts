import type {
  UberMenuGraphCategory,
  UberMenuGraphGroup,
  UberMenuGraphItem,
} from './uber-menu-graph.service';

type DraftGraph = {
  categories: UberMenuGraphCategory[];
  items: UberMenuGraphItem[];
  groups: UberMenuGraphGroup[];
};

/**
 * Projects the internal Uber publish graph into the Admin contract.
 * Every public `id` below is a SanQ stableId; graph node ids never cross this boundary.
 */
export function buildDraftCategories(graph: DraftGraph) {
  const groupMap = new Map(graph.groups.map((group) => [group.id, group]));
  const itemMap = new Map(graph.items.map((item) => [item.id, item]));
  return graph.categories.map((category) => ({
    id: category.sourceStableId,
    name: category.title,
    items: category.entities
      .map((nodeId) => itemMap.get(nodeId))
      .filter(
        (item): item is UberMenuGraphItem => item?.sourceType === 'MENU_ITEM',
      )
      .map((item) => ({
        id: item.sourceStableId,
        displayName: item.title,
        displayDescription: item.description,
        priceCents: item.priceCents,
        isAvailable: item.isAvailable,
        preparationType: item.preparationType,
        imageUrl: item.imageUrl,
        groups: item.modifierGroupIds.flatMap((groupNodeId) => {
          const group = groupMap.get(groupNodeId);
          if (!group) return [];
          return [
            {
              id: group.sourceStableId,
              name: group.title,
              minSelect: group.minSelect,
              maxSelect: group.maxSelect,
              options: group.optionItemIds.flatMap((optionNodeId) => {
                const option = itemMap.get(optionNodeId);
                if (!option) return [];
                return [
                  {
                    id: option.sourceStableId,
                    displayName: option.title,
                    priceDeltaCents: option.priceCents,
                    isAvailable: option.isAvailable,
                    preparationType: option.preparationType,
                    childGroups: option.modifierGroupIds.flatMap(
                      (childNodeId) => {
                        const child = groupMap.get(childNodeId);
                        return child
                          ? [
                              {
                                id: child.sourceStableId,
                                name: child.title,
                                minSelect: child.minSelect,
                                maxSelect: child.maxSelect,
                              },
                            ]
                          : [];
                      },
                    ),
                  },
                ];
              }),
            },
          ];
        }),
      })),
  }));
}

export function buildUberDraftEdges(
  graph: Pick<DraftGraph, 'categories' | 'items' | 'groups'>,
) {
  const itemMap = new Map(graph.items.map((item) => [item.id, item]));
  const groupMap = new Map(graph.groups.map((group) => [group.id, group]));
  return [
    ...graph.categories.flatMap((category) =>
      category.entities.flatMap((itemNodeId) => {
        const item = itemMap.get(itemNodeId);
        return item
          ? [
              {
                from: category.sourceStableId,
                to: item.sourceStableId,
                type: 'CATEGORY_ITEM',
              },
            ]
          : [];
      }),
    ),
    ...graph.items.flatMap((item) =>
      item.modifierGroupIds.flatMap((groupNodeId) => {
        const group = groupMap.get(groupNodeId);
        return group
          ? [
              {
                from: item.sourceStableId,
                to: group.sourceStableId,
                type: 'ITEM_GROUP',
              },
            ]
          : [];
      }),
    ),
    ...graph.groups.flatMap((group) =>
      group.optionItemIds.flatMap((optionNodeId) => {
        const option = itemMap.get(optionNodeId);
        return option
          ? [
              {
                from: group.sourceStableId,
                to: option.sourceStableId,
                type: 'GROUP_OPTION',
              },
            ]
          : [];
      }),
    ),
  ];
}

export function buildUberDraftTreeNodes(
  categories: ReturnType<typeof buildDraftCategories>,
) {
  return categories.map((category) => ({
    id: category.id,
    type: 'category',
    name: category.name,
    source: 'AUTO-MAPPED',
    children: category.items.map((item) => ({
      id: item.id,
      type: 'item',
      name: item.displayName,
      source: 'AUTO-MAPPED',
      priceCents: item.priceCents,
      isAvailable: item.isAvailable,
      preparationType: item.preparationType,
      children: item.groups.map((group) => ({
        id: group.id,
        type: 'group',
        name: group.name,
        source: 'AUTO-MAPPED',
        minSelect: group.minSelect,
        maxSelect: group.maxSelect,
        children: group.options.map((option) => ({
          id: option.id,
          type: 'option',
          name: option.displayName,
          source: 'AUTO-MAPPED',
          priceDeltaCents: option.priceDeltaCents,
          isAvailable: option.isAvailable,
          preparationType: option.preparationType,
          children: option.childGroups.map((child) => ({
            id: child.id,
            type: 'group',
            name: child.name,
            source: 'AUTO-MAPPED',
            minSelect: child.minSelect,
            maxSelect: child.maxSelect,
          })),
        })),
      })),
    })),
  }));
}

export function buildModifierFlatteningReport(
  graph: Pick<DraftGraph, 'items' | 'groups'>,
  mappings: Array<{
    sourceOptionChoiceStableId: string;
    compositeOptionItemId: string;
    sourcePath: string[];
  }>,
) {
  const prices = new Map(graph.items.map((item) => [item.id, item.priceCents]));
  return {
    reference: 'Uber example menu payload: modifier_options reference ITEM ids',
    optionIdSemantics: 'modifier_options[].id === items[].id',
    groups: graph.groups.map((group) => ({
      groupId: group.id,
      minPermitted: group.minSelect,
      maxPermitted: group.maxSelect,
      optionCount: group.optionItemIds.length,
      valid:
        group.minSelect >= 0 &&
        group.minSelect <= group.maxSelect &&
        group.maxSelect <= group.optionItemIds.length &&
        group.optionItemIds.every((id) => prices.has(id)),
    })),
    combinations: mappings.map((mapping) => ({
      ...mapping,
      combinedPriceCents: prices.get(mapping.compositeOptionItemId) ?? null,
    })),
  };
}
