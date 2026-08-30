import {
  planHistoricalOrderItemComponentsBackfill,
  type HistoricalComponentBackfillCatalog,
} from './order-item-components-backfill';
import type {
  OrderItemOptionChoiceSnapshot,
  OrderItemOptionGroupSnapshot,
} from './order-item-options';

function choice(
  stableId: string,
  templateGroupStableId: string,
  overrides: Partial<OrderItemOptionChoiceSnapshot> = {},
): OrderItemOptionChoiceSnapshot {
  return {
    stableId,
    templateGroupStableId,
    nameEn: stableId,
    nameZh: stableId,
    priceDeltaCents: 0,
    sortOrder: 0,
    ...overrides,
  };
}

function group(
  templateGroupStableId: string,
  choices: OrderItemOptionChoiceSnapshot[],
  sortOrder = 0,
): OrderItemOptionGroupSnapshot {
  return {
    templateGroupStableId,
    nameEn: templateGroupStableId,
    nameZh: templateGroupStableId,
    minSelect: 0,
    maxSelect: 1,
    sortOrder,
    choices,
  };
}

function catalog(params: {
  currentTargets?: Record<string, string | null>;
  itemGroups?: Record<string, string[]>;
  knownItems?: string[];
}): HistoricalComponentBackfillCatalog {
  return {
    currentTargetByChoiceStableId: new Map<string, string | null>(
      Object.entries(params.currentTargets ?? {}),
    ),
    knownMenuItemStableIds: new Set(params.knownItems ?? []),
    optionGroupStableIdsByItemStableId: new Map<
      string,
      ReadonlySet<string>
    >(
      Object.entries(params.itemGroups ?? {}).map(
        ([stableId, groups]): [string, ReadonlySet<string>] => [
          stableId,
          new Set(groups),
        ],
      ),
    ),
  };
}

const baseInput = {
  orderItemDbId: '11111111-1111-4111-8111-111111111111',
  orderStableId: 'order_stable_1',
  parentProductStableId: 'combo',
  componentsJson: null,
};

describe('historical order item component backfill planner', () => {
  it('reconstructs unique target components and assigns child options', () => {
    const noodleChoice = choice('choose-noodle', 'root-noodle', {
      nameEn: 'Historical Noodle',
      nameZh: '历史面食',
    });
    const burgerChoice = choice('choose-burger', 'root-burger', {
      targetItemStableId: 'burger',
      nameEn: 'Historical Burger',
      nameZh: '历史夹馍',
    });
    const options = [
      group('root-noodle', [noodleChoice]),
      group('noodle-option', [choice('wide-noodle', 'noodle-option')]),
      group('root-burger', [burgerChoice], 1),
      group('meat-option', [choice('beef', 'meat-option')], 1),
    ];

    const plan = planHistoricalOrderItemComponentsBackfill(
      { ...baseInput, optionsJson: options },
      catalog({
        currentTargets: {
          'choose-noodle': 'noodle',
          'choose-burger': 'different-current-burger',
        },
        knownItems: ['combo', 'noodle', 'burger'],
        itemGroups: {
          combo: ['root-noodle', 'root-burger'],
          noodle: ['noodle-option'],
          burger: ['meat-option'],
        },
      }),
    );

    expect(plan.status).toBe('SAFE');
    expect(plan.components).toEqual([
      expect.objectContaining({
        productStableId: 'noodle',
        nameEn: 'Historical Noodle',
        sourceOptionStableId: 'choose-noodle',
        options: [options[1]],
      }),
      expect.objectContaining({
        productStableId: 'burger',
        nameEn: 'Historical Burger',
        sourceOptionStableId: 'choose-burger',
        options: [options[3]],
      }),
    ]);
    expect(plan.evidence).toEqual({
      componentCount: 2,
      childGroupCount: 2,
      assignedChildGroupCount: 2,
      snapshotTargetCount: 1,
      currentMappingTargetCount: 1,
    });
    expect(plan.warnings).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ code: 'TARGET_FROM_CURRENT_MAPPING' }),
        expect.objectContaining({
          code: 'SNAPSHOT_TARGET_DIFFERS_FROM_CURRENT_MAPPING',
        }),
      ]),
    );
  });

  it('keeps non-target parent option groups out of component options', () => {
    const options = [
      group('root-choice', [choice('choose-target', 'root-choice')]),
      group('parent-extra', [choice('extra', 'parent-extra')]),
      group('child-option', [choice('child', 'child-option')]),
    ];

    const plan = planHistoricalOrderItemComponentsBackfill(
      { ...baseInput, optionsJson: options },
      catalog({
        currentTargets: { 'choose-target': 'target' },
        knownItems: ['combo', 'target'],
        itemGroups: {
          combo: ['root-choice', 'parent-extra'],
          target: ['child-option'],
        },
      }),
    );

    expect(plan.status).toBe('SAFE');
    expect(plan.components[0].options).toEqual([options[2]]);
    expect(plan.evidence.childGroupCount).toBe(1);
  });

  it('marks an unowned child group unresolved instead of guessing', () => {
    const plan = planHistoricalOrderItemComponentsBackfill(
      {
        ...baseInput,
        optionsJson: [
          group('root-choice', [choice('choose-target', 'root-choice')]),
          group('orphan-option', [choice('orphan', 'orphan-option')]),
        ],
      },
      catalog({
        currentTargets: { 'choose-target': 'target' },
        knownItems: ['combo', 'target'],
        itemGroups: { combo: ['root-choice'], target: [] },
      }),
    );

    expect(plan.status).toBe('UNRESOLVED');
    expect(plan.issues).toContainEqual({
      code: 'UNOWNED_CHILD_GROUP',
      templateGroupStableId: 'orphan-option',
    });
  });

  it('marks child groups owned by multiple selected targets unresolved', () => {
    const plan = planHistoricalOrderItemComponentsBackfill(
      {
        ...baseInput,
        optionsJson: [
          group('root-a', [choice('choose-a', 'root-a')]),
          group('root-b', [choice('choose-b', 'root-b')]),
          group('shared-child', [choice('shared', 'shared-child')]),
        ],
      },
      catalog({
        currentTargets: { 'choose-a': 'a', 'choose-b': 'b' },
        knownItems: ['combo', 'a', 'b'],
        itemGroups: {
          combo: ['root-a', 'root-b'],
          a: ['shared-child'],
          b: ['shared-child'],
        },
      }),
    );

    expect(plan.status).toBe('UNRESOLVED');
    expect(plan.issues).toContainEqual({
      code: 'AMBIGUOUS_CHILD_GROUP_OWNER',
      templateGroupStableId: 'shared-child',
    });
  });

  it('marks a non-target group shared by the parent and a component unresolved', () => {
    const plan = planHistoricalOrderItemComponentsBackfill(
      {
        ...baseInput,
        optionsJson: [
          group('root-choice', [choice('choose-target', 'root-choice')]),
          group('shared-option', [choice('shared', 'shared-option')]),
        ],
      },
      catalog({
        currentTargets: { 'choose-target': 'target' },
        knownItems: ['combo', 'target'],
        itemGroups: {
          combo: ['root-choice', 'shared-option'],
          target: ['shared-option'],
        },
      }),
    );

    expect(plan.status).toBe('UNRESOLVED');
    expect(plan.issues).toContainEqual({
      code: 'AMBIGUOUS_PARENT_OR_CHILD_GROUP',
      templateGroupStableId: 'shared-option',
    });
  });

  it('allows repeated targets only when repeated child selections are semantically identical', () => {
    const firstChild = group(
      'child-option',
      [choice('same-child', 'child-option', { sortOrder: 1 })],
      1,
    );
    const secondChild = group(
      'child-option',
      [choice('same-child', 'child-option', { sortOrder: 9 })],
      9,
    );
    const plan = planHistoricalOrderItemComponentsBackfill(
      {
        ...baseInput,
        optionsJson: [
          group('root-a', [choice('choose-a', 'root-a')]),
          firstChild,
          group('root-b', [choice('choose-b', 'root-b')]),
          secondChild,
        ],
      },
      catalog({
        currentTargets: { 'choose-a': 'same-target', 'choose-b': 'same-target' },
        knownItems: ['combo', 'same-target'],
        itemGroups: {
          combo: ['root-a', 'root-b'],
          'same-target': ['child-option'],
        },
      }),
    );

    expect(plan.status).toBe('SAFE');
    expect(plan.components).toHaveLength(2);
    expect(plan.components[0].options).toEqual([firstChild]);
    expect(plan.components[1].options).toEqual([secondChild]);
  });

  it('rejects repeated targets when their child selections differ', () => {
    const plan = planHistoricalOrderItemComponentsBackfill(
      {
        ...baseInput,
        optionsJson: [
          group('root-a', [choice('choose-a', 'root-a')]),
          group('child-option', [choice('child-a', 'child-option')]),
          group('root-b', [choice('choose-b', 'root-b')]),
          group('child-option', [choice('child-b', 'child-option')]),
        ],
      },
      catalog({
        currentTargets: { 'choose-a': 'same-target', 'choose-b': 'same-target' },
        knownItems: ['combo', 'same-target'],
        itemGroups: {
          combo: ['root-a', 'root-b'],
          'same-target': ['child-option'],
        },
      }),
    );

    expect(plan.status).toBe('UNRESOLVED');
    expect(plan.issues).toContainEqual({
      code: 'REPEATED_TARGET_CHILD_OPTIONS',
      templateGroupStableId: 'child-option',
      targetItemStableId: 'same-target',
    });
  });

  it('does not trust a current target mapping from a group outside the parent item', () => {
    const plan = planHistoricalOrderItemComponentsBackfill(
      {
        ...baseInput,
        optionsJson: [
          group('child-only', [choice('looks-like-target', 'child-only')]),
        ],
      },
      catalog({
        currentTargets: { 'looks-like-target': 'target' },
        knownItems: ['combo', 'target'],
        itemGroups: { combo: [], target: [] },
      }),
    );

    expect(plan.status).toBe('UNRESOLVED');
    expect(plan.issues).toContainEqual({
      code: 'LIVE_TARGET_OUTSIDE_PARENT_GROUP',
      templateGroupStableId: 'child-only',
      targetItemStableId: 'target',
    });
  });

  it('flags malformed candidate snapshots instead of silently skipping them', () => {
    const plan = planHistoricalOrderItemComponentsBackfill(
      {
        ...baseInput,
        optionsJson: [
          {
            templateGroupStableId: 'root-choice',
            choices: [
              {
                stableId: 'choose-target',
                targetItemStableId: 'target',
              },
            ],
          },
        ],
      },
      catalog({
        knownItems: ['combo', 'target'],
        itemGroups: { combo: ['root-choice'], target: [] },
      }),
    );

    expect(plan.status).toBe('UNRESOLVED');
    expect(plan.issues).toEqual([{ code: 'INVALID_OPTIONS_SNAPSHOT' }]);
  });

  it('never overwrites an existing component snapshot', () => {
    const plan = planHistoricalOrderItemComponentsBackfill(
      {
        ...baseInput,
        optionsJson: [],
        componentsJson: [{ productStableId: 'already-there' }],
      },
      catalog({}),
    );

    expect(plan.status).toBe('ALREADY_BACKFILLED');
    expect(plan.components).toEqual([]);
  });
});
