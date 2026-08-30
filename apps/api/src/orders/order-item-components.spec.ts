import {
  buildOrderItemComponentDisplaySnapshots,
  buildOrderItemParentDisplayOptions,
  readOrderItemComponentsSnapshot,
} from './order-item-components';

describe('order item component snapshots', () => {
  const componentsJson = [
    {
      productStableId: 'hulatang',
      nameEn: 'Hulatang',
      nameZh: '胡辣汤',
      quantityPerParent: 1,
      source: 'FIXED',
      sourceOptionStableId: null,
      options: [],
    },
    {
      productStableId: 'youtiao',
      nameEn: 'Youtiao',
      nameZh: '油条',
      quantityPerParent: 2,
      source: 'FIXED',
      sourceOptionStableId: null,
      options: [],
    },
  ];

  it('keeps the immutable per-parent snapshot unchanged', () => {
    expect(
      readOrderItemComponentsSnapshot(componentsJson),
    ).toEqual(componentsJson);
  });

  it('expands component quantities for display without changing parent pricing', () => {
    expect(buildOrderItemComponentDisplaySnapshots(componentsJson, 2)).toEqual([
      expect.objectContaining({
        productStableId: 'hulatang',
        quantity: 2,
      }),
      expect.objectContaining({
        productStableId: 'youtiao',
        quantity: 4,
      }),
    ]);
  });

  it('keeps selectable combo price delta on the component display row', () => {
    expect(
      buildOrderItemComponentDisplaySnapshots(
        [
          {
            productStableId: 'noodle-1',
            nameEn: 'Noodle 1',
            nameZh: '面食一',
            quantityPerParent: 1,
            source: 'OPTION',
            sourceOptionStableId: 'noodle-choice',
            options: [],
          },
        ],
        2,
        [
          {
            templateGroupStableId: 'noodle-group',
            nameEn: 'Noodle',
            nameZh: '面食',
            minSelect: 1,
            maxSelect: 1,
            sortOrder: 0,
            choices: [
              {
                stableId: 'noodle-choice',
                templateGroupStableId: 'noodle-group',
                nameEn: 'Noodle 1',
                nameZh: '面食一',
                priceDeltaCents: 150,
                sortOrder: 0,
              },
            ],
          },
        ],
      ),
    ).toEqual([
      expect.objectContaining({
        productStableId: 'noodle-1',
        quantity: 2,
        priceDeltaCents: 150,
      }),
    ]);
  });

  it('builds parent display options without nested component groups or target choices', () => {
    const options = [
      {
        templateGroupStableId: 'noodle-group',
        groupKey: 'root__combo__group-noodle-group',
        nameEn: 'Noodle',
        nameZh: '面食',
        minSelect: 1,
        maxSelect: 2,
        sortOrder: 0,
        choices: [
          {
            stableId: 'noodle-choice',
            templateGroupStableId: 'noodle-group',
            nameEn: 'Noodle 1',
            nameZh: '面食一',
            priceDeltaCents: 150,
            sortOrder: 0,
          },
          {
            stableId: 'extra-spice',
            templateGroupStableId: 'noodle-group',
            nameEn: 'Extra spice',
            nameZh: '加辣',
            priceDeltaCents: 0,
            sortOrder: 1,
          },
        ],
      },
      {
        templateGroupStableId: 'child-group',
        groupKey: 'root__combo__component-soup__group-child-group',
        nameEn: 'Child option',
        nameZh: '子菜品选项',
        minSelect: 0,
        maxSelect: 1,
        sortOrder: 1,
        choices: [
          {
            stableId: 'child-choice',
            templateGroupStableId: 'child-group',
            nameEn: 'Child choice',
            nameZh: '子选项',
            priceDeltaCents: 0,
            sortOrder: 0,
          },
        ],
      },
    ];
    const components = buildOrderItemComponentDisplaySnapshots(
      [
        {
          productStableId: 'noodle-1',
          nameEn: 'Noodle 1',
          nameZh: '面食一',
          quantityPerParent: 1,
          source: 'OPTION',
          sourceOptionStableId: 'noodle-choice',
          options: [],
        },
      ],
      1,
      options,
    );

    expect(buildOrderItemParentDisplayOptions(options, components)).toEqual([
      expect.objectContaining({
        templateGroupStableId: 'noodle-group',
        choices: [expect.objectContaining({ stableId: 'extra-spice' })],
      }),
    ]);
  });

  it('treats missing legacy component snapshots as an empty display list', () => {
    expect(buildOrderItemComponentDisplaySnapshots(null, 3)).toEqual([]);
  });
});
