import { createHash } from 'crypto';
import type { UberMenuGraphValidationIssue } from './uber-menu.types';
import type {
  UberMenuDraftFilters,
  UberMenuDraftSource,
} from './uber-menu-draft-source';
import { composeUberDisplayName } from './uber-menu-payload.builder';

export interface UberMenuGraphItem {
  id: string;
  sourceType: 'MENU_ITEM' | 'OPTION_ITEM';
  sourceStableId: string;
  title: string;
  description: string | null;
  basePriceCents: number;
  priceCents: number;
  isAvailable: boolean;
  modifierGroupIds: string[];
  hasDelta: boolean;
  imageUrl: string | null;
}
export interface UberMenuGraphGroup {
  id: string;
  sourceStableId: string;
  title: string;
  minSelect: number;
  maxSelect: number;
  isAvailable: boolean;
  optionItemIds: string[];
}
export interface UberMenuGraphCategory {
  id: string;
  sourceStableId: string;
  title: string;
  sortOrder: number;
  entities: string[];
}
export interface UberMenuGraph {
  menuId: string;
  categories: UberMenuGraphCategory[];
  items: UberMenuGraphItem[];
  groups: UberMenuGraphGroup[];
  mappingErrors: Array<{ code: string; message: string }>;
  [key: string]: unknown;
}
export type UberMenuGraphResult =
  | {
      kind: 'valid';
      graph: UberMenuGraph;
      warnings: UberMenuGraphValidationIssue[];
      summary: UberMenuGraphSummary;
    }
  | {
      kind: 'invalid';
      graph: UberMenuGraph;
      warnings: UberMenuGraphValidationIssue[];
      errors: UberMenuGraphValidationIssue[];
      summary: UberMenuGraphSummary;
    };
export interface UberMenuGraphSummary {
  totalItems: number;
  changedItems: number;
  totalCategories: number;
  totalModifierGroups: number;
}

export function buildUberNodeId(
  kind: 'menu' | 'category' | 'group' | 'item' | 'publish',
  storeId: string,
  stableId: string,
): string {
  return `sanq:${createHash('sha1')
    .update(`${kind}:${storeId}:${stableId}`)
    .digest('hex')
    .slice(0, 24)}`;
}
export function summarizeUberMenuGraph(
  graph: Pick<UberMenuGraph, 'items' | 'categories' | 'groups'>,
): UberMenuGraphSummary {
  return {
    totalItems: graph.items.length,
    changedItems: graph.items.filter((i) => i.hasDelta).length,
    totalCategories: graph.categories.length,
    totalModifierGroups: graph.groups.length,
  };
}
export function buildRequiredChildSelections(
  group: Pick<UberMenuGraphGroup, 'minSelect' | 'maxSelect' | 'optionItemIds'>,
  optionById: ReadonlyMap<string, Pick<UberMenuGraphItem, 'isAvailable'>>,
): string[][] {
  const available = group.optionItemIds.filter(
    (id) => optionById.get(id)?.isAvailable !== false,
  );
  const out: string[][] = [];
  const choose = (size: number, start = 0, selected: string[] = []) => {
    if (selected.length === size) {
      out.push([...selected]);
      return;
    }
    for (let i = start; i < available.length; i++) {
      selected.push(available[i]);
      choose(size, i + 1, selected);
      selected.pop();
    }
  };
  for (
    let size = group.minSelect;
    size <= Math.min(group.maxSelect, available.length);
    size++
  )
    choose(size);
  return out;
}
export function flattenNestedModifiersForUber(input: {
  storeId: string;
  groups: UberMenuGraphGroup[];
  optionItems: UberMenuGraphItem[];
  combinationLimit?: number;
}) {
  const groupById = new Map(input.groups.map((g) => [g.id, g]));
  const optionById = new Map(input.optionItems.map((o) => [o.id, o]));
  const output = new Map(
    input.optionItems
      .filter((o) => !o.modifierGroupIds.length)
      .map((o) => [o.id, { ...o, modifierGroupIds: [] }]),
  );
  const optionMappings: Array<{
    sourceOptionChoiceStableId: string;
    compositeOptionItemId: string;
    sourcePath: string[];
  }> = [];
  const mappingErrors: Array<{
    code: string;
    sourceOptionChoiceStableId: string;
    message: string;
  }> = [];
  const groups = input.groups.map((group) => {
    const optionItemIds: string[] = [];
    for (const id of group.optionItemIds) {
      const parent = optionById.get(id);
      if (!parent) continue;
      if (!parent.modifierGroupIds.length) {
        optionItemIds.push(id);
        continue;
      }
      const children = parent.modifierGroupIds
        .map((g) => groupById.get(g))
        .filter((g): g is UberMenuGraphGroup => Boolean(g));
      let error: { code: string; message: string } | undefined;
      if (!children.length)
        error = {
          code: 'UBER_CHILD_GROUP_MISSING',
          message: '子选项组不存在或已被排除。',
        };
      else if (children.some((g) => g.minSelect === 0))
        error = {
          code: 'UBER_OPTIONAL_CHILD_GROUP_UNSUPPORTED',
          message: '可选子组无法无损展开为 Uber 平面选项。',
        };
      else if (
        children.some((g) =>
          g.optionItemIds.some(
            (x) => (optionById.get(x)?.modifierGroupIds.length ?? 0) > 0,
          ),
        )
      )
        error = {
          code: 'UBER_MULTI_LEVEL_NESTING_UNSUPPORTED',
          message: '多级嵌套选项无法无损展开为 Uber 平面选项。',
        };
      else if (children.filter((g) => g.maxSelect > 1).length > 1)
        error = {
          code: 'UBER_MULTIPLE_MULTI_SELECT_CHILD_GROUPS_UNSUPPORTED',
          message: '多个可多选子组会导致不可控的笛卡尔积。',
        };
      if (error) {
        mappingErrors.push({
          ...error,
          sourceOptionChoiceStableId: parent.sourceStableId,
        });
        continue;
      }
      const combinations = children
        .map((g) => buildRequiredChildSelections(g, optionById))
        .reduce<
          string[][]
        >((a, s) => a.flatMap((p) => s.map((v) => [...p, ...v])), [[]]);
      if (combinations.length > (input.combinationLimit ?? 100)) {
        mappingErrors.push({
          code: 'UBER_MODIFIER_COMBINATION_LIMIT_EXCEEDED',
          sourceOptionChoiceStableId: parent.sourceStableId,
          message: `选项 ${parent.title} 展开后产生 ${combinations.length} 个组合，超过上限 ${input.combinationLimit ?? 100}。`,
        });
        continue;
      }
      for (const selection of combinations) {
        const selected = selection
          .map((x) => optionById.get(x))
          .filter((x): x is UberMenuGraphItem => Boolean(x));
        const sourcePath = [
          parent.sourceStableId,
          ...selected.map((x) => x.sourceStableId),
        ];
        const compositeId = buildUberNodeId(
          'item',
          input.storeId,
          `composite:${sourcePath.join('>')}`,
        );
        output.set(compositeId, {
          ...parent,
          id: compositeId,
          title: [parent.title, ...selected.map((x) => x.title)].join(' / '),
          basePriceCents:
            parent.basePriceCents +
            selected.reduce((s, x) => s + x.basePriceCents, 0),
          priceCents:
            parent.priceCents + selected.reduce((s, x) => s + x.priceCents, 0),
          isAvailable:
            parent.isAvailable && selected.every((x) => x.isAvailable),
          modifierGroupIds: [],
          hasDelta: parent.hasDelta || selected.some((x) => x.hasDelta),
        });
        optionItemIds.push(compositeId);
        optionMappings.push({
          sourceOptionChoiceStableId: parent.sourceStableId,
          compositeOptionItemId: compositeId,
          sourcePath,
        });
      }
    }
    return { ...group, optionItemIds };
  });
  return {
    groups,
    optionItems: [...output.values()],
    optionMappings,
    mappingErrors,
  };
}

export function validateUberMenuGraph(
  graph: UberMenuGraph,
): UberMenuGraphResult {
  const warnings: UberMenuGraphValidationIssue[] = [];
  const errors: UberMenuGraphValidationIssue[] = graph.mappingErrors.map(
    (e) => ({ ...e }),
  );
  const itemById = new Map(graph.items.map((i) => [i.id, i]));
  const groupById = new Map(graph.groups.map((g) => [g.id, g]));
  const menuIds = new Set<string>();
  const categories = graph.categories.map((c) => ({
    ...c,
    entities: c.entities.filter((id) => {
      const item = itemById.get(id);
      if (!item || item.sourceType !== 'MENU_ITEM') {
        errors.push({
          code: 'UBER_CATEGORY_ITEM_MISSING',
          message: `Category ${c.id} references missing menu item ${id}.`,
          itemId: id,
        });
        return false;
      }
      menuIds.add(id);
      return true;
    }),
  }));
  const reachable = new Set<string>();
  const candidates = new Map<string, UberMenuGraphItem>();
  menuIds.forEach((id) => {
    const i = itemById.get(id);
    if (i) candidates.set(id, i);
  });
  const queue = [...candidates.values()].flatMap((i) => i.modifierGroupIds);
  for (let n = 0; n < queue.length; n++) {
    const id = queue[n];
    if (reachable.has(id)) continue;
    const g = groupById.get(id);
    if (!g) continue;
    reachable.add(id);
    for (const oid of g.optionItemIds) {
      const o = itemById.get(oid);
      if (o?.sourceType === 'OPTION_ITEM') {
        candidates.set(oid, o);
        queue.push(...o.modifierGroupIds);
      }
    }
  }
  const groups = graph.groups
    .filter((g) => reachable.has(g.id))
    .map((g) => ({
      ...g,
      optionItemIds: g.optionItemIds.filter((id) => {
        const o = itemById.get(id);
        if (!o || o.sourceType !== 'OPTION_ITEM') {
          errors.push({
            code: 'UBER_GROUP_OPTION_MISSING',
            message: `Modifier group ${g.id} references missing option item ${id}.`,
            groupId: g.id,
            optionItemId: id,
          });
          return false;
        }
        if (!o.isAvailable) {
          warnings.push({
            code: 'UBER_UNAVAILABLE_OPTION_REMOVED',
            message: `Unavailable option item ${id} was removed from modifier group ${g.id}.`,
            groupId: g.id,
            optionItemId: id,
          });
          candidates.delete(id);
          return false;
        }
        return true;
      }),
    }));
  const nonEmpty = new Set(
    groups.filter((g) => g.optionItemIds.length).map((g) => g.id),
  );
  const items = [...candidates.values()].map((i) => ({
    ...i,
    modifierGroupIds: i.modifierGroupIds.filter((id) => {
      const g = groupById.get(id);
      if (!g) {
        errors.push({
          code: 'UBER_ITEM_GROUP_MISSING',
          message: `Item ${i.id} references missing modifier group ${id}.`,
          itemId: i.id,
          groupId: id,
        });
        return false;
      }
      if (nonEmpty.has(id)) return true;
      const issue = {
        code:
          g.minSelect > 0
            ? 'UBER_REQUIRED_GROUP_EMPTY'
            : 'UBER_EMPTY_GROUP_REMOVED',
        message: `Item ${i.id} references empty modifier group ${id}.`,
        itemId: i.id,
        itemStableId: i.sourceStableId,
        groupId: id,
        groupStableId: g.sourceStableId,
      };
      (g.minSelect > 0 ? errors : warnings).push(issue);
      return false;
    }),
  }));
  const retained = groups.filter((g) => nonEmpty.has(g.id));
  for (const g of retained) {
    if (
      !Number.isInteger(g.minSelect) ||
      !Number.isInteger(g.maxSelect) ||
      g.minSelect < 0 ||
      g.minSelect > g.maxSelect ||
      g.maxSelect > g.optionItemIds.length
    )
      errors.push({
        code: 'UBER_GROUP_QUANTITY_INVALID',
        message: `Modifier group ${g.id} has invalid selection quantity.`,
        groupId: g.id,
      });
  }
  const optionIds = new Set(retained.flatMap((g) => g.optionItemIds));
  const normalized = {
    ...graph,
    categories,
    groups: retained,
    items: items.filter(
      (i) => i.sourceType === 'MENU_ITEM' || optionIds.has(i.id),
    ),
  };
  const summary = summarizeUberMenuGraph(normalized);
  return errors.length
    ? { kind: 'invalid', graph: normalized, warnings, errors, summary }
    : { kind: 'valid', graph: normalized, warnings, summary };
}

/** Purely converts a persistence-independent draft snapshot into an Uber graph. */
export function buildUberMenuGraph(
  source: UberMenuDraftSource,
  filters: UberMenuDraftFilters,
) {
  const {
    storeId,
    uberStoreId,
    categories,
    menuItems,
    modifierTemplates,
    itemConfigs,
    optionConfigs,
    modifierConfigs: modifierGroupConfigs,
    categoryConfigs,
    childGroupBindings,
  } = source;
  const categoryConfigMap = new Map(
    categoryConfigs.map((config) => [config.menuCategoryStableId, config]),
  );
  const itemConfigMap = new Map(
    itemConfigs.map((item) => [item.menuItemStableId, item]),
  );
  const optionConfigMap = new Map(
    optionConfigs.map((config) => [config.optionChoiceStableId, config]),
  );
  const groupConfigMap = new Map(
    modifierGroupConfigs.map((config) => [
      config.templateGroupStableId,
      config,
    ]),
  );
  const childGroupBindingMap = new Map<
    string,
    Array<{ childTemplateGroupStableId: string; isBound: boolean }>
  >();
  for (const binding of childGroupBindings) {
    const list =
      childGroupBindingMap.get(binding.parentOptionChoiceStableId) ?? [];
    list.push({
      childTemplateGroupStableId: binding.childTemplateGroupStableId,
      isBound: binding.isBound,
    });
    childGroupBindingMap.set(binding.parentOptionChoiceStableId, list);
  }
  const categoryById = new Map(
    categories.map((category) => [category.id, category]),
  );

  const groupDraftMap = new Map<
    string,
    {
      id: string;
      sourceStableId: string;
      title: string;
      minSelect: number;
      maxSelect: number;
      isAvailable: boolean;
      optionItemIds: string[];
    }
  >();

  const optionItemDraftMap = new Map<
    string,
    {
      id: string;
      sourceType: 'OPTION_ITEM';
      sourceStableId: string;
      title: string;
      description: string | null;
      basePriceCents: number;
      priceCents: number;
      isAvailable: boolean;
      modifierGroupIds: string[];
      hasDelta: boolean;
      imageUrl: string | null;
    }
  >();

  const itemDrafts: Array<{
    id: string;
    sourceType: 'MENU_ITEM';
    sourceStableId: string;
    title: string;
    description: string | null;
    basePriceCents: number;
    priceCents: number;
    isAvailable: boolean;
    modifierGroupIds: string[];
    categoryStableId: string;
    sortOrder: number;
    hasDelta: boolean;
    imageUrl: string | null;
  }> = [];

  for (const template of modifierTemplates) {
    const groupConfig = groupConfigMap.get(template.stableId);
    const groupId = buildUberNodeId('group', storeId, template.stableId);
    if (filters.excludedGroupIds.has(groupId)) {
      continue;
    }
    const optionItemIds: string[] = [];
    const minSelect = groupConfig?.minSelect ?? template.defaultMinSelect;
    const maxSelect =
      groupConfig?.maxSelect ??
      template.defaultMaxSelect ??
      Math.max(template.options.length, minSelect, 1);
    const groupIsActive = groupConfig?.isActive ?? template.isAvailable;
    if (!groupIsActive) {
      continue;
    }

    for (const choice of template.options) {
      if (filters.excludedOptionChoiceStableIds.has(choice.stableId)) {
        continue;
      }
      const optionConfig = optionConfigMap.get(choice.stableId);
      const optionItemId = buildUberNodeId('item', storeId, choice.stableId);
      const optionAvailable =
        optionConfig?.isAvailable !== undefined
          ? optionConfig.isAvailable
          : choice.isAvailable;
      const optionPriceCents =
        optionConfig?.priceDeltaCents ?? choice.priceDeltaCents;
      const sourceChildGroupStableIds = new Set(
        choice.childTemplateGroupStableIds,
      );
      const bindings = childGroupBindingMap.get(choice.stableId) ?? [];
      for (const binding of bindings) {
        if (binding.isBound) {
          sourceChildGroupStableIds.add(binding.childTemplateGroupStableId);
        } else {
          sourceChildGroupStableIds.delete(binding.childTemplateGroupStableId);
        }
      }
      const childGroupIds = Array.from(sourceChildGroupStableIds).map(
        (childTemplateGroupStableId) =>
          buildUberNodeId('group', storeId, childTemplateGroupStableId),
      );

      optionItemIds.push(optionItemId);
      optionItemDraftMap.set(choice.stableId, {
        id: optionItemId,
        sourceType: 'OPTION_ITEM',
        sourceStableId: choice.stableId,
        title:
          optionConfig?.displayName ||
          composeUberDisplayName(choice.nameEn, choice.nameZh),
        description: optionConfig?.displayDescription || null,
        basePriceCents: choice.priceDeltaCents,
        priceCents: optionPriceCents,
        isAvailable: optionAvailable,
        modifierGroupIds: childGroupIds,
        hasDelta:
          optionPriceCents !== choice.priceDeltaCents ||
          optionAvailable !== choice.isAvailable,
        imageUrl: null,
      });
    }

    groupDraftMap.set(template.stableId, {
      id: groupId,
      sourceStableId: template.stableId,
      title:
        groupConfig?.displayName ||
        composeUberDisplayName(template.nameEn, template.nameZh),
      minSelect,
      maxSelect,
      isAvailable: template.isAvailable,
      optionItemIds,
    });
  }

  for (const menuItem of menuItems) {
    if (filters.excludedMenuItemStableIds.has(menuItem.stableId)) {
      continue;
    }
    const itemConfig = itemConfigMap.get(menuItem.stableId);
    const category = categoryById.get(menuItem.categoryId);
    if (!category) continue;

    const categoryConfig = categoryConfigMap.get(category.stableId);
    const categoryActive = categoryConfig?.isActive ?? category.isActive;
    if (!categoryActive) {
      continue;
    }

    const mappedGroupIds = menuItem.optionGroups
      .map((link) => {
        const templateStableId = link.templateGroupStableId;
        if (!groupDraftMap.has(templateStableId)) return null;
        return buildUberNodeId('group', storeId, templateStableId);
      })
      .filter((groupId): groupId is string => Boolean(groupId));

    const priceCents = itemConfig?.priceCents ?? menuItem.basePriceCents;
    const isAvailable =
      itemConfig?.isAvailable !== undefined
        ? itemConfig.isAvailable
        : menuItem.isAvailable;

    itemDrafts.push({
      id: buildUberNodeId('item', storeId, menuItem.stableId),
      sourceType: 'MENU_ITEM',
      sourceStableId: menuItem.stableId,
      title:
        itemConfig?.displayName ||
        composeUberDisplayName(menuItem.nameEn, menuItem.nameZh),
      // Website ingredients are reusable English description copy, not a
      // legally complete allergen declaration. Never emit ingredientsZh.
      description:
        itemConfig?.displayDescription?.trim() ||
        menuItem.ingredientsEn?.trim() ||
        null,
      basePriceCents: menuItem.basePriceCents,
      priceCents,
      isAvailable,
      modifierGroupIds: mappedGroupIds,
      categoryStableId: category.stableId,
      sortOrder: menuItem.sortOrder,
      hasDelta:
        priceCents !== menuItem.basePriceCents ||
        isAvailable !== menuItem.isAvailable,
      imageUrl: menuItem.imageUrl,
    });
  }

  const categoryDrafts = categories
    .map((category) => {
      const categoryId = buildUberNodeId(
        'category',
        storeId,
        category.stableId,
      );
      if (filters.excludedCategoryIds.has(categoryId)) return null;
      const categoryConfig = categoryConfigMap.get(category.stableId);
      const categoryActive = categoryConfig?.isActive ?? category.isActive;
      if (!categoryActive) return null;

      const categoryItemIds = itemDrafts
        .filter((item) => item.categoryStableId === category.stableId)
        .sort((a, b) => a.sortOrder - b.sortOrder)
        .map((item) => item.id);
      if (!categoryItemIds.length) return null;

      return {
        id: categoryId,
        sourceStableId: category.stableId,
        title:
          categoryConfig?.displayName ||
          composeUberDisplayName(category.nameEn, category.nameZh),
        sortOrder: categoryConfig?.sortOrder ?? category.sortOrder,
        entities: categoryItemIds,
      };
    })
    .filter((category): category is NonNullable<typeof category> =>
      Boolean(category),
    )
    .sort((a, b) => a.sortOrder - b.sortOrder);

  const sourceGroups = Array.from(groupDraftMap.values()).map((group) => ({
    ...group,
    optionItemIds: [...group.optionItemIds],
  }));
  const sourceOptionItems = Array.from(optionItemDraftMap.values()).map(
    (item) => ({ ...item, modifierGroupIds: [...item.modifierGroupIds] }),
  );
  const flattened = flattenNestedModifiersForUber({
    storeId,
    groups: sourceGroups,
    optionItems: sourceOptionItems,
  });

  return {
    menuId: buildUberNodeId('menu', storeId, uberStoreId),
    categories: categoryDrafts,
    items: [...itemDrafts, ...flattened.optionItems],
    groups: flattened.groups,
    sourceItems: [...itemDrafts, ...sourceOptionItems],
    sourceGroups,
    optionMappings: flattened.optionMappings,
    mappingErrors: flattened.mappingErrors,
  };
}
