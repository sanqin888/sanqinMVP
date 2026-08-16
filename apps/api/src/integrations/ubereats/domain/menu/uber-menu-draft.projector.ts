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

export function buildDraftCategories(graph: DraftGraph) {
  const groupMap = new Map(graph.groups.map((group) => [group.id, group]));
  const itemMap = new Map(graph.items.map((item) => [item.id, item]));
  return graph.categories.map((category) => ({
    id: category.id,
    name: category.title,
    items: category.entities
      .map((id) => itemMap.get(id))
      .filter(
        (item): item is UberMenuGraphItem => item?.sourceType === 'MENU_ITEM',
      )
      .map((item) => ({
        id: item.id,
        sourceMenuItemStableId: item.sourceStableId,
        displayName: item.title,
        displayDescription: item.description,
        priceCents: item.priceCents,
        isAvailable: item.isAvailable,
        imageUrl: item.imageUrl,
        groups: item.modifierGroupIds.flatMap((groupId) => {
          const group = groupMap.get(groupId);
          if (!group) return [];
          return [
            {
              id: group.id,
              sourceTemplateGroupStableId: group.sourceStableId,
              name: group.title,
              minSelect: group.minSelect,
              maxSelect: group.maxSelect,
              options: group.optionItemIds.flatMap((optionId) => {
                const option = itemMap.get(optionId);
                if (!option) return [];
                return [
                  {
                    id: option.id,
                    sourceOptionChoiceStableId: option.sourceStableId,
                    displayName: option.title,
                    priceDeltaCents: option.priceCents,
                    isAvailable: option.isAvailable,
                    childGroups: option.modifierGroupIds.flatMap((childId) => {
                      const child = groupMap.get(childId);
                      return child
                        ? [
                            {
                              id: child.id,
                              sourceTemplateGroupStableId: child.sourceStableId,
                              name: child.title,
                              minSelect: child.minSelect,
                              maxSelect: child.maxSelect,
                            },
                          ]
                        : [];
                    }),
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
  return [
    ...graph.categories.flatMap((category) =>
      category.entities.map((to) => ({
        from: category.id,
        to,
        type: 'CATEGORY_ITEM',
      })),
    ),
    ...graph.items.flatMap((item) =>
      item.modifierGroupIds.map((to) => ({
        from: item.id,
        to,
        type: 'ITEM_GROUP',
      })),
    ),
    ...graph.groups.flatMap((group) =>
      group.optionItemIds.map((to) => ({
        from: group.id,
        to,
        type: 'GROUP_OPTION',
      })),
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
    sourceStableId: category.id,
    source: 'AUTO-MAPPED',
    children: category.items.map((item) => ({
      id: item.id,
      type: 'item',
      name: item.displayName,
      sourceStableId: item.sourceMenuItemStableId,
      source: 'AUTO-MAPPED',
      priceCents: item.priceCents,
      isAvailable: item.isAvailable,
      children: item.groups.map((group) => ({
        id: group.id,
        type: 'group',
        name: group.name,
        sourceStableId: group.sourceTemplateGroupStableId,
        source: 'AUTO-MAPPED',
        minSelect: group.minSelect,
        maxSelect: group.maxSelect,
        children: group.options.map((option) => ({
          id: option.id,
          type: 'option',
          name: option.displayName,
          sourceStableId: option.sourceOptionChoiceStableId,
          source: 'AUTO-MAPPED',
          priceDeltaCents: option.priceDeltaCents,
          isAvailable: option.isAvailable,
          children: option.childGroups.map((child) => ({
            id: child.id,
            type: 'group',
            name: child.name,
            sourceStableId: child.sourceTemplateGroupStableId,
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
