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
  UberMenuPublicJson,
  UberMenuReconciliationResponse,
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
      [
        'preparationType',
        item.preparationType === 'PREPARED' ||
        item.preparationType === 'PREPACKAGED' ||
        item.preparationType === null
          ? item.preparationType
          : undefined,
      ],
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
  'stableId',
  'priceCents',
  'priceDeltaCents',
  'isAvailable',
  'hasDelta',
  'minSelect',
  'maxSelect',
  'from',
  'to',
  'type',
  'code',
  'severity',
  'path',
  'message',
  'description',
  'basePriceCents',
  'imageUrl',
  'sortOrder',
  'entities',
  'fingerprint',
  'safety',
  'semanticallyChanged',
  'criticalCount',
  'risks',
  'entityType',
  'entityId',
  'field',
  'intentional',
  'previousValue',
  'currentValue',
  'sourceValue',
  'sourceStoreId',
  'targetStoreId',
  'mode',
  'counts',
  'create',
  'update',
  'unchanged',
  'conflicts',
  'warnings',
  'kind',
  'source',
  'target',
  'displayName',
  'displayDescription',
  'preparationType',
  'groups',
  'items',
  'options',
  'childGroups',
  'children',
  'status',
  'sourcePath',
  'day_of_week',
  'time_periods',
  'start_time',
  'end_time',
  'summary',
  'totalItems',
  'changedItems',
  'totalCategories',
  'totalModifierGroups',
  'taxRate',
  'percentage',
  'requiresAdminConfirmation',
  'confirmed',
  'serviceAvailability',
  'serviceAvailabilityTimezone',
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
    draft = recordOf(source.uberDraft),
    sourceMenu = recordOf(source.sourceMenu),
    sourceTree = recordOf(sourceMenu.tree),
    draftTree = recordOf(draft.tree),
    validation = recordOf(source.validation),
    summary = recordOf(source.publishSummary),
    published = source.lastPublishedVersion
      ? recordOf(source.lastPublishedVersion)
      : null;
  const list = (value: unknown): UberMenuDraftResponse['mappingWarnings'] =>
    Array.isArray(value)
      ? (presentDraftValue(value) as UberMenuDraftResponse['mappingWarnings'])
      : [];
  return {
    storeId: textOf(source.storeId),
    sourceMenu: {
      categories: numberOf(sourceMenu.categories),
      items: numberOf(sourceMenu.items),
      optionItems: numberOf(sourceMenu.optionItems),
      groups: numberOf(sourceMenu.groups),
      tree: { categories: list(sourceTree.categories) },
    },
    uberDraft: {
      edges: list(draft.edges),
      tree: { categories: list(draftTree.categories) },
      treeNodes: list(draft.treeNodes),
      optionMappings: list(draft.optionMappings),
    },
    mappingWarnings: list(source.mappingWarnings),
    mappingErrors: list(source.mappingErrors),
    validation: {
      warnings: list(validation.warnings),
      errors: list(validation.errors),
    },
    publishSummary: {
      totalItems: numberOf(summary.totalItems),
      changedItems: numberOf(summary.changedItems),
      totalCategories: numberOf(summary.totalCategories),
      totalModifierGroups: numberOf(summary.totalModifierGroups),
    },
    serviceAvailability: list(source.serviceAvailability),
    serviceAvailabilityTimezone:
      textOf(source.serviceAvailabilityTimezone) ?? '',
    dirty: booleanOf(source.dirty),
    lastPublishedVersion: published
      ? {
          versionStableId: textOf(published.versionStableId) ?? '',
          status: textOf(published.status) ?? '',
          createdAt: dateOf(published.createdAt) ?? null,
          totalItems: numberOf(published.totalItems),
          changedItems: numberOf(published.changedItems),
          errorMessage: textOf(published.errorMessage),
          errorDetails: presentDraftValue(
            published.errorDetails,
          ) as UberMenuPublicJson,
          finishedAt: dateOf(published.finishedAt) ?? null,
        }
      : null,
    contractVersion: UBER_PUBLIC_CONTRACT_VERSION,
  };
};
export const presentMenuReconciliation = (
  result: unknown,
): UberMenuReconciliationResponse => {
  const source = recordOf(result);
  const retrieved = recordOf(source.retrieved);
  const baseline = source.baseline ? recordOf(source.baseline) : null;
  const reconciliation = recordOf(source.reconciliation);
  const specialInstructions = recordOf(source.specialInstructions);
  const strings = (value: unknown): string[] =>
    Array.isArray(value)
      ? value.flatMap((candidate) =>
          typeof candidate === 'string' ? [candidate] : [],
        )
      : [];
  const nullableBoolean = (value: unknown): boolean | null =>
    typeof value === 'boolean' ? value : null;
  const mismatches: UberMenuReconciliationResponse['reconciliation']['mismatches'] =
    Array.isArray(reconciliation.mismatches)
      ? reconciliation.mismatches.flatMap(
          (
            candidate,
          ): UberMenuReconciliationResponse['reconciliation']['mismatches'] => {
            const mismatch = recordOf(candidate);
            const resourceType = textOf(mismatch.resourceType);
            const resourceId = textOf(mismatch.resourceId);
            const field = textOf(mismatch.field);
            const expected = textOf(mismatch.expected);
            const actual = textOf(mismatch.actual);
            return (resourceType === 'ITEM' ||
              resourceType === 'MODIFIER_GROUP') &&
              resourceId &&
              field &&
              expected !== null &&
              actual !== null
              ? [{ resourceType, resourceId, field, expected, actual }]
              : [];
          },
        )
      : [];
  return {
    storeId: textOf(source.storeId) ?? '',
    uberStoreId: textOf(source.uberStoreId) ?? '',
    retrieved: {
      menuCount: numberOf(retrieved.menuCount),
      categoryCount: numberOf(retrieved.categoryCount),
      itemCount: numberOf(retrieved.itemCount),
      modifierGroupCount: numberOf(retrieved.modifierGroupCount),
      taxLabelItemCount: numberOf(retrieved.taxLabelItemCount),
      preparationTypeItemCount: numberOf(retrieved.preparationTypeItemCount),
    },
    baseline: baseline
      ? {
          itemCount: numberOf(baseline.itemCount),
          modifierGroupCount: numberOf(baseline.modifierGroupCount),
          expectedDisableItemInstructions: nullableBoolean(
            baseline.expectedDisableItemInstructions,
          ),
        }
      : null,
    reconciliation: {
      matchesLastSuccessfulPublish: nullableBoolean(
        reconciliation.matchesLastSuccessfulPublish,
      ),
      missingMenuIds: strings(reconciliation.missingMenuIds),
      extraMenuIds: strings(reconciliation.extraMenuIds),
      missingCategoryIds: strings(reconciliation.missingCategoryIds),
      extraCategoryIds: strings(reconciliation.extraCategoryIds),
      missingItemIds: strings(reconciliation.missingItemIds),
      extraItemIds: strings(reconciliation.extraItemIds),
      missingModifierGroupIds: strings(reconciliation.missingModifierGroupIds),
      extraModifierGroupIds: strings(reconciliation.extraModifierGroupIds),
      mismatches,
    },
    specialInstructions: {
      expectedDisableItemInstructions: nullableBoolean(
        specialInstructions.expectedDisableItemInstructions,
      ),
      remoteDisableItemInstructions: nullableBoolean(
        specialInstructions.remoteDisableItemInstructions,
      ),
      verified: booleanOf(specialInstructions.verified),
    },
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
    lastPublishedAt: dateOf(source.lastPublishedAt) ?? null,
    addedItems: list('addedItems'),
    modifiedItems: list('modifiedItems'),
    deletedItems: list('deletedItems'),
    addedGroups: list('addedGroups'),
    modifiedGroups: list('modifiedGroups'),
    deletedGroups: list('deletedGroups'),
    hierarchyChanges: list('hierarchyChanges'),
    deletedEdges: list('deletedEdges'),
    priceChanges: list('priceChanges'),
    availabilityChanges: list('availabilityChanges'),
    preparationTypeChanges: list('preparationTypeChanges'),
    contractVersion: UBER_PUBLIC_CONTRACT_VERSION,
  };
};
export const presentMenuMutation = () => toUberMutationResponse();
export const presentMenuOperation = (result: unknown): UberMenuPublicJson =>
  presentDraftValue(result) as UberMenuPublicJson;
