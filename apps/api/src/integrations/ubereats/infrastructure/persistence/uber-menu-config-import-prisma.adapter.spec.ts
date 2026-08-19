import { UberMenuConfigImportPrismaAdapter } from './uber-menu-config-import-prisma.adapter';

describe('UberMenuConfigImportPrismaAdapter release safety', () => {
  const setup = () => {
    const state = {
      source: [
        {
          id: 'source-row',
          storeId: 'test',
          menuItemStableId: 'pork',
          priceCents: 849,
          isAvailable: true,
          displayName: null,
          displayDescription: null,
        },
      ],
      target: [] as Array<Record<string, unknown>>,
    };
    const itemDelegate = {
      findMany: jest.fn(({ where }: { where: { storeId: string } }) =>
        Promise.resolve(where.storeId === 'test' ? state.source : state.target),
      ),
      create: jest.fn(({ data }: { data: Record<string, unknown> }) => {
        state.target.push({ id: 'target-row', ...data });
        return Promise.resolve(data);
      }),
      update: jest.fn(),
      upsert: jest.fn().mockResolvedValue({}),
    };
    const optionDelegate = {
      findMany: jest.fn().mockResolvedValue([]),
      create: jest.fn(),
      update: jest.fn(),
      upsert: jest.fn().mockResolvedValue({}),
    };
    const emptyDelegate = {
      findMany: jest.fn().mockResolvedValue([]),
      create: jest.fn(),
      update: jest.fn(),
    };
    const tx = {
      uberStoreMapping: { findFirst: jest.fn().mockResolvedValue(null) },
      uberItemChannelConfig: itemDelegate,
      uberOptionItemConfig: optionDelegate,
      uberModifierGroupConfig: emptyDelegate,
      uberCategoryConfig: emptyDelegate,
      opsEvent: { create: jest.fn().mockResolvedValue({}) },
      menuItem: {
        findUnique: jest
          .fn()
          .mockResolvedValue({ basePriceCents: 749, isAvailable: true }),
      },
      menuOptionTemplateChoice: {
        findUnique: jest
          .fn()
          .mockResolvedValue({ priceDeltaCents: 200, isAvailable: true }),
      },
    };
    const prisma = {
      ...tx,
      $transaction: jest.fn((work: (client: typeof tx) => Promise<unknown>) =>
        work(tx),
      ),
    };
    return {
      state,
      itemDelegate,
      optionDelegate,
      prisma,
      adapter: new UberMenuConfigImportPrismaAdapter(prisma as never),
    };
  };

  it('re-reads inside a serializable transaction and rejects a stale preview', async () => {
    const x = setup();
    const preview = await x.adapter.preview(
      'test',
      'production',
      'SKIP_EXISTING',
    );
    x.state.target.push({
      id: 'production-row',
      storeId: 'production',
      menuItemStableId: 'pork',
      priceCents: 1199,
      isAvailable: true,
      displayName: null,
      displayDescription: null,
    });

    await expect(
      x.adapter.apply(
        'test',
        'production',
        'SKIP_EXISTING',
        preview.fingerprint,
        'admin-1',
      ),
    ).rejects.toMatchObject({ code: 'UBER_MENU_IMPORT_PREVIEW_STALE' });
    expect(x.itemDelegate.create).not.toHaveBeenCalled();
    expect(x.prisma.$transaction).toHaveBeenCalledWith(expect.any(Function), {
      isolationLevel: 'Serializable',
    });
  });

  it('applies the exact reviewed state without trusting a client plan', async () => {
    const x = setup();
    const preview = await x.adapter.preview(
      'test',
      'production',
      'SKIP_EXISTING',
    );
    await x.adapter.apply(
      'test',
      'production',
      'SKIP_EXISTING',
      preview.fingerprint,
      'admin-1',
    );
    const [created] = x.itemDelegate.create.mock.calls[0] as unknown as [
      { data: Record<string, unknown> },
    ];
    expect(created.data).toMatchObject({
      storeId: 'production',
      menuItemStableId: 'pork',
      priceCents: 849,
    });
  });

  it('restores only the selected item price and records administrator intent', async () => {
    const x = setup();
    await x.adapter.restoreItemPrice('production', 'pork', 'admin-1');
    expect(x.itemDelegate.upsert).toHaveBeenCalledTimes(1);
    expect(x.itemDelegate.upsert).toHaveBeenCalledWith({
      where: {
        storeId_menuItemStableId: {
          storeId: 'production',
          menuItemStableId: 'pork',
        },
      },
      create: {
        storeId: 'production',
        menuItemStableId: 'pork',
        priceCents: null,
        isAvailable: true,
      },
      update: { priceCents: null },
    });
    expect(x.optionDelegate.upsert).not.toHaveBeenCalled();
    const [event] = x.prisma.opsEvent.create.mock.calls[0] as unknown as [
      { data: { eventName: string; payload: Record<string, unknown> } },
    ];
    expect(event.data.eventName).toBe('ubereats_menu_price_restored');
    expect(event.data.payload).toMatchObject({
      posStoreId: 'production',
      menuItemStableId: 'pork',
      sourcePriceCents: 749,
      administratorId: 'admin-1',
    });
  });

  it('restores only the selected option price', async () => {
    const x = setup();
    await x.adapter.restoreOptionPrice('production', 'extra', 'admin-1');
    expect(x.optionDelegate.upsert).toHaveBeenCalledTimes(1);
    expect(x.optionDelegate.upsert).toHaveBeenCalledWith({
      where: {
        storeId_optionChoiceStableId: {
          storeId: 'production',
          optionChoiceStableId: 'extra',
        },
      },
      create: {
        storeId: 'production',
        optionChoiceStableId: 'extra',
        priceDeltaCents: 200,
        isAvailable: true,
      },
      update: { priceDeltaCents: 200 },
    });
    expect(x.itemDelegate.upsert).not.toHaveBeenCalled();
    const [event] = x.prisma.opsEvent.create.mock.calls[0] as unknown as [
      { data: { eventName: string; payload: Record<string, unknown> } },
    ];
    expect(event.data.payload).toMatchObject({
      posStoreId: 'production',
      optionChoiceStableId: 'extra',
      sourcePriceDeltaCents: 200,
      administratorId: 'admin-1',
    });
  });
});
