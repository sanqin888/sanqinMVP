import { FulfillmentType } from '@prisma/client';
import { OrderLabelPlanService } from './order-label-plan.service';

function optionGroup(
  templateGroupStableId: string,
  choiceStableId: string,
  options?: {
    nameZh?: string;
    targetItemStableId?: string | null;
    groupKey?: string | null;
  },
) {
  return {
    templateGroupStableId,
    groupKey: options?.groupKey ?? null,
    nameEn: templateGroupStableId,
    nameZh: templateGroupStableId,
    minSelect: 0,
    maxSelect: 1,
    sortOrder: 0,
    choices: [
      {
        stableId: choiceStableId,
        templateGroupStableId,
        targetItemStableId: options?.targetItemStableId ?? null,
        nameEn: choiceStableId,
        nameZh: options?.nameZh ?? choiceStableId,
        priceDeltaCents: 0,
        sortOrder: 0,
      },
    ],
  };
}

type ItemConfig = {
  stableId: string;
  nameEn: string;
  nameZh: string;
  labelStrategy: 'AUTO' | 'ALWAYS' | 'NEVER';
  packagings: Array<{
    id: string;
    sortOrder: number;
    packagingType: { stableId: string; name: string };
  }>;
  optionGroups: Array<{
    affectedPackagingTypeStableIds: string[];
    templateGroup: { stableId: string };
  }>;
};

function packaging(packagingTypeStableId: string, sortOrder = 0) {
  return {
    id: `item-packaging:${packagingTypeStableId}:${sortOrder}`,
    sortOrder,
    packagingType: {
      stableId: packagingTypeStableId,
      name: packagingTypeStableId,
    },
  };
}

function menuConfig(
  stableId: string,
  input: Partial<Omit<ItemConfig, 'stableId'>> = {},
): ItemConfig {
  return {
    stableId,
    nameEn: input.nameEn ?? stableId,
    nameZh: input.nameZh ?? stableId,
    labelStrategy: input.labelStrategy ?? 'AUTO',
    packagings: input.packagings ?? [packaging(`package:${stableId}`)],
    optionGroups: input.optionGroups ?? [],
  };
}

function splitSoupNoodleConfig(
  stableId: string,
  input: Partial<Omit<ItemConfig, 'stableId' | 'packagings'>> = {},
): ItemConfig {
  return menuConfig(stableId, {
    ...input,
    packagings: [packaging('38oz', 0), packaging('16oz', 1)],
  });
}

function dryNoodleConfig(stableId: string): ItemConfig {
  return menuConfig(stableId, {
    packagings: [packaging('38oz')],
  });
}

function orderLine(
  productStableId: string,
  optionsJson: unknown[] = [],
  qty = 1,
  componentsJson: unknown[] = [],
) {
  return {
    productStableId,
    qty,
    nameEn: productStableId,
    nameZh: productStableId,
    displayName: productStableId,
    optionsJson,
    componentsJson,
    externalSpecialInstructions: null,
  };
}

function createService(
  items: ReturnType<typeof orderLine>[],
  configs: ItemConfig[],
) {
  const prisma = {
    order: {
      findUnique: jest.fn().mockResolvedValue({
        fulfillmentType: FulfillmentType.pickup,
        items,
      }),
    },
    menuItem: {
      findMany: jest.fn().mockResolvedValue(configs),
    },
  };
  return {
    service: new OrderLabelPlanService(prisma as never),
    prisma,
  };
}

describe('OrderLabelPlanService', () => {
  it('does not print a lone split soup noodle item', async () => {
    const { service } = createService(
      [orderLine('hot-sour')],
      [splitSoupNoodleConfig('hot-sour')],
    );

    await expect(service.getByStableId('order-1')).resolves.toEqual({
      labelWidthMm: 70,
      labelHeightMm: 30,
      labels: [],
    });
  });

  it('prints only 38oz noodle bowls when two identical soup noodles differ only by spice', async () => {
    const { service } = createService(
      [
        orderLine('hot-sour', [optionGroup('spice', 'mild')]),
        orderLine('hot-sour', [optionGroup('spice', 'extra-hot')]),
      ],
      [
        splitSoupNoodleConfig('hot-sour', {
          optionGroups: [
            {
              affectedPackagingTypeStableIds: ['38oz'],
              templateGroup: { stableId: 'spice' },
            },
          ],
        }),
      ],
    );

    const plan = await service.getByStableId('order-1');
    expect(plan.labels).toHaveLength(2);
    expect(plan.labels.map((label) => label.component)).toEqual([
      '38oz',
      '38oz',
    ]);
    expect(
      plan.labels.every((label) => label.packagingTypeStableId === '38oz'),
    ).toBe(true);
    expect(plan.labels.every((label) => label.pairCode === null)).toBe(true);
  });

  it('prints only 16oz soup bowls when cilantro selection differs', async () => {
    const { service } = createService(
      [
        orderLine('hot-sour', [optionGroup('coriander', 'no-coriander')]),
        orderLine('hot-sour', [optionGroup('coriander', 'normal-coriander')]),
      ],
      [
        splitSoupNoodleConfig('hot-sour', {
          optionGroups: [
            {
              affectedPackagingTypeStableIds: ['16oz'],
              templateGroup: { stableId: 'coriander' },
            },
          ],
        }),
      ],
    );

    const plan = await service.getByStableId('order-1');
    expect(plan.labels).toHaveLength(2);
    expect(plan.labels.map((label) => label.component)).toEqual([
      '16oz',
      '16oz',
    ]);
    expect(
      plan.labels.every((label) => label.packagingTypeStableId === '16oz'),
    ).toBe(true);
    expect(plan.labels.every((label) => label.pairCode === null)).toBe(true);
  });

  it('prints and pairs split soup noodle with a dry noodle sharing the same 38oz package', async () => {
    const { service } = createService(
      [orderLine('hot-sour'), orderLine('oil-splash')],
      [splitSoupNoodleConfig('hot-sour'), dryNoodleConfig('oil-splash')],
    );

    const plan = await service.getByStableId('order-1');
    expect(plan.labels).toHaveLength(3);
    expect(plan.labels).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          productStableId: 'hot-sour',
          component: '38oz',
          packagingTypeStableId: '38oz',
          pairCode: 'A',
        }),
        expect.objectContaining({
          productStableId: 'hot-sour',
          component: '16oz',
          packagingTypeStableId: '16oz',
          pairCode: 'A',
        }),
        expect.objectContaining({
          productStableId: 'oil-splash',
          component: '38oz',
          packagingTypeStableId: '38oz',
          pairCode: 'B',
        }),
      ]),
    );
  });

  it('prints same 16oz package braised pork and braised beef without A/B', async () => {
    const { service } = createService(
      [orderLine('braised-pork'), orderLine('braised-beef')],
      [
        menuConfig('braised-pork', { packagings: [packaging('16oz')] }),
        menuConfig('braised-beef', { packagings: [packaging('16oz')] }),
      ],
    );

    const plan = await service.getByStableId('order-1');
    expect(plan.labels).toHaveLength(2);
    expect(
      plan.labels.every((label) => label.packagingTypeStableId === '16oz'),
    ).toBe(true);
    expect(plan.labels.every((label) => label.pairCode === null)).toBe(true);
  });

  it('expands a combo target into the same physical-package decision pool as a direct item', async () => {
    const comboTarget = optionGroup('noodle-slot-a', 'choose-hot-sour', {
      targetItemStableId: 'hot-sour',
    });
    const { service } = createService(
      [orderLine('combo-single', [comboTarget]), orderLine('oil-splash')],
      [splitSoupNoodleConfig('hot-sour'), dryNoodleConfig('oil-splash')],
    );

    const plan = await service.getByStableId('order-1');
    expect(plan.labels).toHaveLength(3);
    expect(plan.labels.map((label) => label.productStableId).sort()).toEqual([
      'hot-sour',
      'hot-sour',
      'oil-splash',
    ]);
  });

  it('uses immutable component snapshots for fixed combo label planning', async () => {
    const fixedComponents = [
      {
        productStableId: 'hot-sour',
        nameEn: 'Hot Sour Soup',
        nameZh: '胡辣汤',
        quantityPerParent: 1,
        source: 'FIXED',
        options: [],
      },
      {
        productStableId: 'side-dish',
        nameEn: 'Side Dish',
        nameZh: '小菜',
        quantityPerParent: 1,
        source: 'FIXED',
        options: [],
      },
    ];
    const { service } = createService(
      [orderLine('breakfast-combo', [], 2, fixedComponents)],
      [
        menuConfig('hot-sour', { labelStrategy: 'ALWAYS' }),
        menuConfig('side-dish', { labelStrategy: 'ALWAYS' }),
      ],
    );

    const plan = await service.getByStableId('order-1');
    expect(plan.labels).toHaveLength(2);
    expect(plan.labels).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ productStableId: 'hot-sour', copies: 2 }),
        expect.objectContaining({ productStableId: 'side-dish', copies: 2 }),
      ]),
    );
  });

  it('uses A/B only when both noodle and soup package variants must stay correlated', async () => {
    const first = [
      optionGroup('spice', 'mild'),
      optionGroup('coriander', 'no-coriander'),
    ];
    const second = [
      optionGroup('spice', 'extra-hot'),
      optionGroup('coriander', 'normal-coriander'),
    ];
    const { service } = createService(
      [orderLine('hot-sour', first), orderLine('hot-sour', second)],
      [
        splitSoupNoodleConfig('hot-sour', {
          optionGroups: [
            {
              affectedPackagingTypeStableIds: ['38oz'],
              templateGroup: { stableId: 'spice' },
            },
            {
              affectedPackagingTypeStableIds: ['16oz'],
              templateGroup: { stableId: 'coriander' },
            },
          ],
        }),
      ],
    );

    const plan = await service.getByStableId('order-1');
    expect(plan.labels).toHaveLength(4);
    const codes = new Set(plan.labels.map((label) => label.pairCode));
    expect(codes).toEqual(new Set(['A', 'B']));
    expect(plan.labels.filter((label) => label.pairCode === 'A')).toHaveLength(
      2,
    );
    expect(plan.labels.filter((label) => label.pairCode === 'B')).toHaveLength(
      2,
    );
  });

  it('does not infer cross-product confusion when packaging is unconfigured', async () => {
    const { service } = createService(
      [orderLine('one'), orderLine('two')],
      [
        menuConfig('one', { packagings: [] }),
        menuConfig('two', { packagings: [] }),
      ],
    );

    const plan = await service.getByStableId('order-1');
    expect(plan.labels).toEqual([]);
  });

  it('respects ALWAYS even before an item has packaging configured', async () => {
    const { service } = createService(
      [orderLine('special')],
      [menuConfig('special', { packagings: [], labelStrategy: 'ALWAYS' })],
    );

    const plan = await service.getByStableId('order-1');
    expect(plan.labels).toHaveLength(1);
    expect(plan.labels[0]).toEqual(
      expect.objectContaining({
        productStableId: 'special',
        packagingTypeStableId: 'unconfigured:special',
      }),
    );
  });

  it('skips all automatic labels for dine-in orders', async () => {
    const prisma = {
      order: {
        findUnique: jest.fn().mockResolvedValue({
          fulfillmentType: FulfillmentType.dine_in,
          items: [orderLine('hot-sour')],
        }),
      },
      menuItem: { findMany: jest.fn() },
    };
    const service = new OrderLabelPlanService(prisma as never);

    const plan = await service.getByStableId('order-1');
    expect(plan.labels).toEqual([]);
    expect(prisma.menuItem.findMany).not.toHaveBeenCalled();
  });
});
