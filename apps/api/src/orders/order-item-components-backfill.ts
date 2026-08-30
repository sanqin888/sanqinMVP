import type {
  OrderItemOptionChoiceSnapshot,
  OrderItemOptionGroupSnapshot,
  OrderItemOptionsSnapshot,
} from './order-item-options';
import type { OrderItemComponentsSnapshot } from './order-item-components';

export type HistoricalComponentBackfillIssueCode =
  | 'INVALID_OPTIONS_SNAPSHOT'
  | 'MISSING_PARENT_MENU_ITEM'
  | 'MISSING_TARGET_MENU_ITEM'
  | 'LIVE_TARGET_OUTSIDE_PARENT_GROUP'
  | 'UNOWNED_CHILD_GROUP'
  | 'AMBIGUOUS_CHILD_GROUP_OWNER'
  | 'AMBIGUOUS_PARENT_OR_CHILD_GROUP'
  | 'REPEATED_TARGET_CHILD_OPTIONS';

export type HistoricalComponentBackfillWarningCode =
  | 'TARGET_FROM_CURRENT_MAPPING'
  | 'SNAPSHOT_TARGET_DIFFERS_FROM_CURRENT_MAPPING';

export type HistoricalComponentBackfillIssue = {
  code: HistoricalComponentBackfillIssueCode;
  templateGroupStableId?: string;
  targetItemStableId?: string;
};

export type HistoricalComponentBackfillWarning = {
  code: HistoricalComponentBackfillWarningCode;
  sourceOptionStableId: string;
  snapshotTargetItemStableId?: string;
  currentTargetItemStableId?: string;
};

export type HistoricalComponentBackfillInput = {
  orderItemDbId: string;
  orderStableId: string;
  parentProductStableId: string;
  optionsJson: unknown;
  componentsJson: unknown;
};

export type HistoricalComponentBackfillCatalog = {
  currentTargetByChoiceStableId: ReadonlyMap<string, string | null>;
  knownMenuItemStableIds: ReadonlySet<string>;
  optionGroupStableIdsByItemStableId: ReadonlyMap<
    string,
    ReadonlySet<string>
  >;
};

export type HistoricalComponentBackfillEvidence = {
  componentCount: number;
  childGroupCount: number;
  assignedChildGroupCount: number;
  snapshotTargetCount: number;
  currentMappingTargetCount: number;
};

export type HistoricalComponentBackfillPlan = {
  orderItemDbId: string;
  orderStableId: string;
  parentProductStableId: string;
  status: 'ALREADY_BACKFILLED' | 'NOT_CANDIDATE' | 'SAFE' | 'UNRESOLVED';
  components: OrderItemComponentsSnapshot;
  issues: HistoricalComponentBackfillIssue[];
  warnings: HistoricalComponentBackfillWarning[];
  evidence: HistoricalComponentBackfillEvidence;
};

type ParsedOptionsResult =
  | { ok: true; options: OrderItemOptionsSnapshot }
  | { ok: false };

type ResolvedTargetChoice = {
  groupIndex: number;
  choice: OrderItemOptionChoiceSnapshot;
  targetItemStableId: string;
};

function nonEmptyString(value: unknown): string | null {
  if (typeof value !== 'string') return null;
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
}

function nullableString(value: unknown): string | null {
  return typeof value === 'string' ? value : null;
}

function finiteInteger(value: unknown): number | null {
  if (typeof value !== 'number' || !Number.isFinite(value)) return null;
  return Math.trunc(value);
}

function parseChoice(
  value: unknown,
  groupStableId: string,
): OrderItemOptionChoiceSnapshot | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
  const record = value as Record<string, unknown>;
  const stableId = nonEmptyString(record.stableId);
  const templateGroupStableId = nonEmptyString(record.templateGroupStableId);
  const priceDeltaCents = finiteInteger(record.priceDeltaCents);
  const sortOrder = finiteInteger(record.sortOrder);
  if (
    !stableId ||
    !templateGroupStableId ||
    templateGroupStableId !== groupStableId ||
    priceDeltaCents === null ||
    sortOrder === null
  ) {
    return null;
  }

  const targetItemStableId = nonEmptyString(record.targetItemStableId);
  const displayName = nullableString(record.displayName);

  return {
    stableId,
    templateGroupStableId,
    ...(targetItemStableId ? { targetItemStableId } : {}),
    nameEn: nullableString(record.nameEn),
    nameZh: nullableString(record.nameZh),
    ...(displayName !== null ? { displayName } : {}),
    priceDeltaCents,
    sortOrder,
  };
}

function parseGroup(value: unknown): OrderItemOptionGroupSnapshot | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
  const record = value as Record<string, unknown>;
  const templateGroupStableId = nonEmptyString(record.templateGroupStableId);
  const minSelect = finiteInteger(record.minSelect);
  const maxSelectRaw = record.maxSelect;
  const maxSelect =
    maxSelectRaw === null || maxSelectRaw === undefined
      ? null
      : finiteInteger(maxSelectRaw);
  const sortOrder = finiteInteger(record.sortOrder);
  if (
    !templateGroupStableId ||
    minSelect === null ||
    (maxSelectRaw !== null &&
      maxSelectRaw !== undefined &&
      maxSelect === null) ||
    sortOrder === null ||
    !Array.isArray(record.choices)
  ) {
    return null;
  }

  const choices = record.choices.map((choice) =>
    parseChoice(choice, templateGroupStableId),
  );
  if (choices.some((choice) => choice === null)) return null;

  const groupKey = nonEmptyString(record.groupKey);
  const displayName = nullableString(record.displayName);
  return {
    templateGroupStableId,
    ...(groupKey ? { groupKey } : {}),
    nameEn: nullableString(record.nameEn),
    nameZh: nullableString(record.nameZh),
    ...(displayName !== null ? { displayName } : {}),
    minSelect,
    maxSelect,
    sortOrder,
    choices: choices as OrderItemOptionChoiceSnapshot[],
  };
}

function parseOptions(value: unknown): ParsedOptionsResult {
  if (!Array.isArray(value)) return { ok: false };
  const groups = value.map(parseGroup);
  if (groups.some((group) => group === null)) return { ok: false };
  return { ok: true, options: groups as OrderItemOptionsSnapshot };
}

function hasExistingComponents(value: unknown): boolean {
  return value !== null && value !== undefined;
}

function hasPotentialTargetChoice(
  value: unknown,
  catalog: HistoricalComponentBackfillCatalog,
): boolean {
  if (!Array.isArray(value)) return false;
  for (const group of value) {
    if (!group || typeof group !== 'object' || Array.isArray(group)) continue;
    const choices = (group as Record<string, unknown>).choices;
    if (!Array.isArray(choices)) continue;
    for (const choice of choices) {
      if (!choice || typeof choice !== 'object' || Array.isArray(choice)) {
        continue;
      }
      const record = choice as Record<string, unknown>;
      if (nonEmptyString(record.targetItemStableId)) return true;
      const choiceStableId = nonEmptyString(record.stableId);
      if (
        choiceStableId &&
        nonEmptyString(catalog.currentTargetByChoiceStableId.get(choiceStableId))
      ) {
        return true;
      }
    }
  }
  return false;
}

function itemOwnsGroup(
  catalog: HistoricalComponentBackfillCatalog,
  itemStableId: string,
  templateGroupStableId: string,
): boolean {
  return (
    catalog.optionGroupStableIdsByItemStableId
      .get(itemStableId)
      ?.has(templateGroupStableId) ?? false
  );
}

function semanticGroupSignature(group: OrderItemOptionGroupSnapshot): string {
  return JSON.stringify({
    templateGroupStableId: group.templateGroupStableId,
    nameEn: group.nameEn,
    nameZh: group.nameZh,
    displayName: group.displayName ?? null,
    minSelect: group.minSelect,
    maxSelect: group.maxSelect,
    choices: group.choices.map((choice) => ({
      stableId: choice.stableId,
      templateGroupStableId: choice.templateGroupStableId,
      targetItemStableId: choice.targetItemStableId ?? null,
      nameEn: choice.nameEn,
      nameZh: choice.nameZh,
      displayName: choice.displayName ?? null,
      priceDeltaCents: choice.priceDeltaCents,
    })),
  });
}

function createEmptyEvidence(): HistoricalComponentBackfillEvidence {
  return {
    componentCount: 0,
    childGroupCount: 0,
    assignedChildGroupCount: 0,
    snapshotTargetCount: 0,
    currentMappingTargetCount: 0,
  };
}

export function collectHistoricalOptionChoiceStableIds(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  const stableIds: string[] = [];
  for (const group of value) {
    if (!group || typeof group !== 'object' || Array.isArray(group)) continue;
    const choices = (group as Record<string, unknown>).choices;
    if (!Array.isArray(choices)) continue;
    for (const choice of choices) {
      if (!choice || typeof choice !== 'object' || Array.isArray(choice)) {
        continue;
      }
      const stableId = nonEmptyString(
        (choice as Record<string, unknown>).stableId,
      );
      if (stableId) stableIds.push(stableId);
    }
  }
  return stableIds;
}

export function collectHistoricalSnapshotTargetStableIds(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  const stableIds: string[] = [];
  for (const group of value) {
    if (!group || typeof group !== 'object' || Array.isArray(group)) continue;
    const choices = (group as Record<string, unknown>).choices;
    if (!Array.isArray(choices)) continue;
    for (const choice of choices) {
      if (!choice || typeof choice !== 'object' || Array.isArray(choice)) {
        continue;
      }
      const stableId = nonEmptyString(
        (choice as Record<string, unknown>).targetItemStableId,
      );
      if (stableId) stableIds.push(stableId);
    }
  }
  return stableIds;
}

export function planHistoricalOrderItemComponentsBackfill(
  input: HistoricalComponentBackfillInput,
  catalog: HistoricalComponentBackfillCatalog,
): HistoricalComponentBackfillPlan {
  const evidence = createEmptyEvidence();
  const base = {
    orderItemDbId: input.orderItemDbId,
    orderStableId: input.orderStableId,
    parentProductStableId: input.parentProductStableId,
  };

  if (hasExistingComponents(input.componentsJson)) {
    return {
      ...base,
      status: 'ALREADY_BACKFILLED',
      components: [],
      issues: [],
      warnings: [],
      evidence,
    };
  }

  const parsed = parseOptions(input.optionsJson);
  if (!parsed.ok) {
    const isPotentialCandidate = hasPotentialTargetChoice(
      input.optionsJson,
      catalog,
    );
    return {
      ...base,
      status: isPotentialCandidate ? 'UNRESOLVED' : 'NOT_CANDIDATE',
      components: [],
      issues: isPotentialCandidate
        ? [{ code: 'INVALID_OPTIONS_SNAPSHOT' }]
        : [],
      warnings: [],
      evidence,
    };
  }
  if (parsed.options.length === 0) {
    return {
      ...base,
      status: 'NOT_CANDIDATE',
      components: [],
      issues: [],
      warnings: [],
      evidence,
    };
  }

  const parentGroupStableIds =
    catalog.optionGroupStableIdsByItemStableId.get(input.parentProductStableId);
  const warnings: HistoricalComponentBackfillWarning[] = [];
  const issues: HistoricalComponentBackfillIssue[] = [];
  const resolvedTargets: ResolvedTargetChoice[] = [];
  const targetGroupIndexes = new Set<number>();
  let sawLiveTargetOutsideParentGroup = false;

  parsed.options.forEach((group, groupIndex) => {
    for (const choice of group.choices) {
      const snapshotTargetItemStableId =
        nonEmptyString(choice.targetItemStableId) ?? undefined;
      const currentTargetItemStableId =
        nonEmptyString(
          catalog.currentTargetByChoiceStableId.get(choice.stableId),
        ) ?? undefined;

      if (snapshotTargetItemStableId) {
        resolvedTargets.push({
          groupIndex,
          choice,
          targetItemStableId: snapshotTargetItemStableId,
        });
        targetGroupIndexes.add(groupIndex);
        evidence.snapshotTargetCount += 1;
        if (
          currentTargetItemStableId &&
          currentTargetItemStableId !== snapshotTargetItemStableId
        ) {
          warnings.push({
            code: 'SNAPSHOT_TARGET_DIFFERS_FROM_CURRENT_MAPPING',
            sourceOptionStableId: choice.stableId,
            snapshotTargetItemStableId,
            currentTargetItemStableId,
          });
        }
        continue;
      }

      if (!currentTargetItemStableId) continue;
      if (!parentGroupStableIds?.has(group.templateGroupStableId)) {
        sawLiveTargetOutsideParentGroup = true;
        issues.push({
          code: 'LIVE_TARGET_OUTSIDE_PARENT_GROUP',
          templateGroupStableId: group.templateGroupStableId,
          targetItemStableId: currentTargetItemStableId,
        });
        continue;
      }

      resolvedTargets.push({
        groupIndex,
        choice,
        targetItemStableId: currentTargetItemStableId,
      });
      targetGroupIndexes.add(groupIndex);
      evidence.currentMappingTargetCount += 1;
      warnings.push({
        code: 'TARGET_FROM_CURRENT_MAPPING',
        sourceOptionStableId: choice.stableId,
        currentTargetItemStableId,
      });
    }
  });

  if (resolvedTargets.length === 0) {
    if (
      sawLiveTargetOutsideParentGroup &&
      !catalog.knownMenuItemStableIds.has(input.parentProductStableId)
    ) {
      issues.push({ code: 'MISSING_PARENT_MENU_ITEM' });
    }
    return {
      ...base,
      status: sawLiveTargetOutsideParentGroup ? 'UNRESOLVED' : 'NOT_CANDIDATE',
      components: [],
      issues,
      warnings,
      evidence,
    };
  }

  if (!catalog.knownMenuItemStableIds.has(input.parentProductStableId)) {
    issues.push({ code: 'MISSING_PARENT_MENU_ITEM' });
  }

  for (const target of resolvedTargets) {
    if (!catalog.knownMenuItemStableIds.has(target.targetItemStableId)) {
      issues.push({
        code: 'MISSING_TARGET_MENU_ITEM',
        targetItemStableId: target.targetItemStableId,
      });
    }
  }

  const components: OrderItemComponentsSnapshot = resolvedTargets.map(
    ({ choice, targetItemStableId }) => ({
      productStableId: targetItemStableId,
      nameEn: choice.nameEn ?? choice.displayName ?? null,
      nameZh: choice.nameZh ?? null,
      quantityPerParent: 1,
      source: 'OPTION',
      sourceOptionStableId: choice.stableId,
      options: [],
    }),
  );
  evidence.componentCount = components.length;

  const componentIndexesByTarget = new Map<string, number[]>();
  components.forEach((component, index) => {
    const existing =
      componentIndexesByTarget.get(component.productStableId) ?? [];
    existing.push(index);
    componentIndexesByTarget.set(component.productStableId, existing);
  });

  const nonTargetGroupsByTemplate = new Map<
    string,
    OrderItemOptionGroupSnapshot[]
  >();
  parsed.options.forEach((group, groupIndex) => {
    if (targetGroupIndexes.has(groupIndex)) return;
    const existing =
      nonTargetGroupsByTemplate.get(group.templateGroupStableId) ?? [];
    existing.push(group);
    nonTargetGroupsByTemplate.set(group.templateGroupStableId, existing);
  });

  for (const [templateGroupStableId, groups] of nonTargetGroupsByTemplate) {
    const parentOwnsGroup = itemOwnsGroup(
      catalog,
      input.parentProductStableId,
      templateGroupStableId,
    );
    const ownerTargetStableIds = Array.from(
      componentIndexesByTarget.keys(),
    ).filter((targetItemStableId) =>
      itemOwnsGroup(catalog, targetItemStableId, templateGroupStableId),
    );

    if (parentOwnsGroup && ownerTargetStableIds.length === 0) {
      continue;
    }

    evidence.childGroupCount += groups.length;

    if (parentOwnsGroup && ownerTargetStableIds.length > 0) {
      issues.push({
        code: 'AMBIGUOUS_PARENT_OR_CHILD_GROUP',
        templateGroupStableId,
      });
      continue;
    }
    if (ownerTargetStableIds.length === 0) {
      issues.push({
        code: 'UNOWNED_CHILD_GROUP',
        templateGroupStableId,
      });
      continue;
    }
    if (ownerTargetStableIds.length > 1) {
      issues.push({
        code: 'AMBIGUOUS_CHILD_GROUP_OWNER',
        templateGroupStableId,
      });
      continue;
    }

    const ownerTargetStableId = ownerTargetStableIds[0];
    const componentIndexes =
      componentIndexesByTarget.get(ownerTargetStableId) ?? [];
    if (componentIndexes.length === 1) {
      components[componentIndexes[0]].options.push(...groups);
      evidence.assignedChildGroupCount += groups.length;
      continue;
    }

    const signatures = new Set(groups.map(semanticGroupSignature));
    if (
      groups.length !== componentIndexes.length ||
      signatures.size !== 1
    ) {
      issues.push({
        code: 'REPEATED_TARGET_CHILD_OPTIONS',
        templateGroupStableId,
        targetItemStableId: ownerTargetStableId,
      });
      continue;
    }

    componentIndexes.forEach((componentIndex, groupIndex) => {
      components[componentIndex].options.push(groups[groupIndex]);
    });
    evidence.assignedChildGroupCount += groups.length;
  }

  return {
    ...base,
    status: issues.length > 0 ? 'UNRESOLVED' : 'SAFE',
    components,
    issues,
    warnings,
    evidence,
  };
}
