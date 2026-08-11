import {
  UBER_PUBLIC_CONTRACT_VERSION,
  toUberListResponse,
  toUberMutationResponse,
} from '../contracts/responses/ubereats.responses';
import type {
  UberMenuDraftResponse,
  UberMenuDiffResponse,
  UberMenuItemResponse,
  UberMenuListResponse,
} from '../contracts/responses/menu.responses';
import {
  booleanOf,
  dateOf,
  numberOf,
  recordOf,
  textOf,
} from './presenter.utils';

const presentItem = (value: unknown): UberMenuItemResponse => {
  const item = recordOf(value);
  return Object.fromEntries(
    [
      ['menuItemStableId', textOf(item.menuItemStableId) ?? undefined],
      ['optionChoiceStableId', textOf(item.optionChoiceStableId) ?? undefined],
      [
        'priceCents',
        typeof item.priceCents === 'number'
          ? numberOf(item.priceCents)
          : undefined,
      ],
      [
        'priceDeltaCents',
        typeof item.priceDeltaCents === 'number'
          ? numberOf(item.priceDeltaCents)
          : undefined,
      ],
      [
        'isAvailable',
        typeof item.isAvailable === 'boolean'
          ? booleanOf(item.isAvailable)
          : undefined,
      ],
      ['displayName', textOf(item.displayName)],
      ['displayDescription', textOf(item.displayDescription)],
      ['externalItemId', textOf(item.externalItemId)],
      ['externalCategoryId', textOf(item.externalCategoryId)],
      ['updatedAt', dateOf(item.updatedAt)],
    ].filter(([, value]) => value !== undefined),
  ) as UberMenuItemResponse;
};

const draftFields = new Set([
  'id',
  'title',
  'name',
  'sourceType',
  'sourceStableId',
  'sourceOptionChoiceStableId',
  'priceCents',
  'priceDeltaCents',
  'isAvailable',
  'hasDelta',
  'minSelect',
  'maxSelect',
  'optionItemIds',
  'modifierGroupIds',
  'from',
  'to',
  'type',
  'code',
  'severity',
  'path',
  'message',
]);
const presentDraftValue = (value: unknown): unknown => {
  if (Array.isArray(value)) return value.map(presentDraftValue);
  if (value === null || typeof value !== 'object') return value;
  return Object.fromEntries(
    Object.entries(recordOf(value))
      .filter(([key]) => draftFields.has(key))
      .map(([key, item]) => [key, presentDraftValue(item)]),
  );
};

export const presentMenuList = (
  result: unknown,
  limit = 1000,
): UberMenuListResponse => {
  const source = recordOf(result);
  const items = Array.isArray(source.items)
    ? source.items.map(presentItem)
    : [];
  return {
    ...toUberListResponse(items, limit),
    storeId: textOf(source.storeId),
  };
};

export const presentMenuDraft = (result: unknown): UberMenuDraftResponse => {
  const source = recordOf(result),
    draft = recordOf(source.uberDraft);
  return {
    storeId: textOf(source.storeId),
    summary: source.summary
      ? (presentDraftValue(source.summary) as Record<string, unknown>)
      : null,
    categories: Array.isArray(draft.categories)
      ? (presentDraftValue(draft.categories) as unknown[])
      : [],
    items: Array.isArray(draft.items)
      ? (presentDraftValue(draft.items) as unknown[])
      : [],
    groups: Array.isArray(draft.groups)
      ? (presentDraftValue(draft.groups) as unknown[])
      : [],
    edges: Array.isArray(draft.edges)
      ? (presentDraftValue(draft.edges) as unknown[])
      : [],
    contractVersion: UBER_PUBLIC_CONTRACT_VERSION,
  };
};
export const presentMenuDiff = (result: unknown): UberMenuDiffResponse => {
  const source = recordOf(result);
  const list = (key: string): unknown[] =>
    Array.isArray(source[key])
      ? (presentDraftValue(source[key]) as unknown[])
      : [];
  return {
    storeId: textOf(source.storeId),
    addedItems: list('addedItems'),
    modifiedItems: list('modifiedItems'),
    deletedItems: list('deletedItems'),
    addedGroups: list('addedGroups'),
    modifiedGroups: list('modifiedGroups'),
    deletedGroups: list('deletedGroups'),
    hierarchyChanges: list('hierarchyChanges'),
    contractVersion: UBER_PUBLIC_CONTRACT_VERSION,
  };
};
export const presentMenuMutation = () => toUberMutationResponse();
