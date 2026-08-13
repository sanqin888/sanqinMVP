/* eslint-disable @typescript-eslint/no-unsafe-assignment */
import type { PrismaService } from '../../../../prisma/prisma.service';
import { UberMenuDraftMutationPrismaAdapter } from './uber-menu-draft-mutation-prisma.adapter';

type BindingRow = {
  storeId: string;
  parentOptionChoiceStableId: string;
  childTemplateGroupStableId: string;
  isBound: boolean;
};

type BindingWrite = {
  where: {
    storeId_parentOptionChoiceStableId_childTemplateGroupStableId: Omit<
      BindingRow,
      'isBound'
    >;
  };
  create: BindingRow;
  update: Pick<BindingRow, 'isBound'>;
};

type OpsEventWrite = {
  where: { idempotencyKey: string };
  create: { idempotencyKey: string; eventName: string };
  update: Record<string, never>;
};

const persistentBindingPrisma = () => {
  const bindings = new Map<string, BindingRow>();
  const events = new Map<string, OpsEventWrite['create']>();
  const bindingKey = (row: Omit<BindingRow, 'isBound'>) =>
    `${row.storeId}:${row.parentOptionChoiceStableId}:${row.childTemplateGroupStableId}`;

  const create = jest.fn(({ data }: { data: BindingRow }) => {
    const key = bindingKey(data);
    if (bindings.has(key))
      return Promise.reject(new Error('Unique constraint failed'));
    bindings.set(key, { ...data });
    return Promise.resolve({ ...data });
  });
  const upsert = jest.fn(({ where, create, update }: BindingWrite) => {
    const key = bindingKey(
      where.storeId_parentOptionChoiceStableId_childTemplateGroupStableId,
    );
    const current = bindings.get(key);
    const row = current ? { ...current, ...update } : { ...create };
    bindings.set(key, row);
    return Promise.resolve({ ...row });
  });
  const findMany = jest.fn(() =>
    Promise.resolve(Array.from(bindings.values(), (row) => ({ ...row }))),
  );
  const upsertEvent = jest.fn(({ where, create }: OpsEventWrite) => {
    const current = events.get(where.idempotencyKey);
    if (current) return Promise.resolve({ ...current });
    events.set(where.idempotencyKey, { ...create });
    return Promise.resolve({ ...create });
  });
  const findManyEvents = jest.fn(() =>
    Promise.resolve(Array.from(events.values(), (event) => ({ ...event }))),
  );

  return {
    client: db({
      menuOptionTemplateChoice: {
        findUnique: jest.fn().mockResolvedValue({ stableId: 'option-1' }),
      },
      menuOptionGroupTemplate: {
        findUnique: jest.fn().mockResolvedValue({ stableId: 'group-1' }),
      },
      uberOptionChildGroupBinding: { create, upsert, findMany },
      opsEvent: { upsert: upsertEvent, findMany: findManyEvents },
    }),
    binding: { create, upsert, findMany },
    events: { upsert: upsertEvent, findMany: findManyEvents },
  };
};

const semantics = {
  samePayload: 'RETURN_SAME_BUSINESS_STATE',
  differentPayload: 'UPDATE_RESOURCE',
  sideEffects: 'DEDUPLICATE_BY_RESOURCE_AND_RESULTING_STATE',
  concurrency: 'CONVERGE_BY_UNIQUE_RESOURCE_KEY',
} as const;

const db = (value: object) => value as PrismaService;

describe('UberMenuDraftMutationPrismaAdapter contract', () => {
  it('upserts an item with source defaults and keeps the public field mapping', async () => {
    const upsert = jest.fn().mockResolvedValue({ menuItemStableId: 'item-1' });
    const adapter = new UberMenuDraftMutationPrismaAdapter(
      db({
        menuItem: {
          findUnique: jest
            .fn()
            .mockResolvedValue({ basePriceCents: 1299, isAvailable: true }),
        },
        uberItemChannelConfig: { upsert },
      }),
    );

    const result = await adapter.updateUberDraftItem('item-1', {
      storeId: 'store-1',
      displayName: '  Noodles  ',
    });

    expect(upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        create: expect.objectContaining({
          storeId: 'store-1',
          menuItemStableId: 'item-1',
          priceCents: 1299,
          isAvailable: true,
          displayName: 'Noodles',
          displayDescription: null,
        }),
      }),
    );
    expect(result).toMatchObject({
      ok: true,
      storeId: 'store-1',
      itemId: 'item-1',
      config: { menuItemStableId: 'item-1' },
      warnings: [],
    });
  });

  it('upserts a group with template defaults and required selection semantics', async () => {
    const upsert = jest
      .fn()
      .mockResolvedValue({ templateGroupStableId: 'group-1' });
    const adapter = new UberMenuDraftMutationPrismaAdapter(
      db({
        menuOptionGroupTemplate: {
          findUnique: jest.fn().mockResolvedValue({
            stableId: 'group-1',
            nameEn: 'Size',
            defaultMinSelect: 0,
            defaultMaxSelect: 2,
          }),
        },
        uberModifierGroupConfig: { upsert },
      }),
    );

    await expect(
      adapter.updateUberDraftGroup({
        resourceKey: {
          storeId: 'store-1',
          templateGroupStableId: 'group-1',
        },
        payload: { storeId: 'store-1', required: true },
        semantics,
      }),
    ).resolves.toMatchObject({ groupId: 'group-1', warnings: [] });
    expect(upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        create: expect.objectContaining({
          displayName: 'Size',
          minSelect: 1,
          maxSelect: 2,
        }),
        update: { minSelect: 1, maxSelect: 2 },
      }),
    );
  });

  it('upserts an option with source defaults and reports not-found consistently', async () => {
    const findUnique = jest
      .fn()
      .mockResolvedValueOnce({ priceDeltaCents: 250, isAvailable: false })
      .mockResolvedValueOnce(null);
    const upsert = jest
      .fn()
      .mockResolvedValue({ optionChoiceStableId: 'option-1' });
    const adapter = new UberMenuDraftMutationPrismaAdapter(
      db({
        menuOptionTemplateChoice: { findUnique },
        uberOptionItemConfig: { upsert },
      }),
    );

    await adapter.updateUberDraftOption('option-1', { storeId: 'store-1' });
    expect(upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        create: expect.objectContaining({
          optionChoiceStableId: 'option-1',
          priceDeltaCents: 250,
          isAvailable: false,
          displayName: null,
        }),
      }),
    );
    await expect(
      adapter.updateUberDraftOption('missing', { storeId: 'store-1' }),
    ).rejects.toMatchObject({
      code: 'UBER_MENU_INPUT_INVALID',
      operation: 'menu.validate',
    });
  });

  it('keeps sequential bind/unbind persistence and telemetry idempotent', async () => {
    const persistence = persistentBindingPrisma();
    const adapter = new UberMenuDraftMutationPrismaAdapter(persistence.client);

    const resourceKey = {
      storeId: 'store-1',
      parentOptionChoiceStableId: 'option-1',
      childTemplateGroupStableId: 'group-1',
    };
    const bindCommand = {
      resourceKey,
      payload: { isBound: true },
      semantics,
    } as const;
    const unbindCommand = {
      resourceKey,
      payload: { isBound: false },
      semantics,
    } as const;

    const firstBind = await adapter.bindUberDraftOptionChildGroup(bindCommand);
    const secondBind = await adapter.bindUberDraftOptionChildGroup(bindCommand);

    expect(secondBind).toEqual(firstBind);
    await expect(persistence.binding.findMany()).resolves.toEqual([
      expect.objectContaining({ ...resourceKey, isBound: true }),
    ]);
    await expect(persistence.events.findMany()).resolves.toHaveLength(1);

    const firstUnbind =
      await adapter.unbindUberDraftOptionChildGroup(unbindCommand);
    const secondUnbind =
      await adapter.unbindUberDraftOptionChildGroup(unbindCommand);

    expect(secondUnbind).toEqual(firstUnbind);
    await expect(persistence.binding.findMany()).resolves.toEqual([
      expect.objectContaining({ ...resourceKey, isBound: false }),
    ]);
    await expect(persistence.events.findMany()).resolves.toEqual([
      expect.objectContaining({
        eventName: 'ubereats_draft_option_child_group_bound',
      }),
      expect.objectContaining({
        eventName: 'ubereats_draft_option_child_group_unbound',
      }),
    ]);
  });

  it.each([
    ['bind', true],
    ['unbind', false],
  ] as const)(
    'concurrent duplicate %s calls converge to one row and one event',
    async (operation, isBound) => {
      const persistence = persistentBindingPrisma();
      const adapter = new UberMenuDraftMutationPrismaAdapter(
        persistence.client,
      );
      const resourceKey = {
        storeId: 'store-1',
        parentOptionChoiceStableId: 'option-1',
        childTemplateGroupStableId: 'group-1',
      };
      const command = { resourceKey, payload: { isBound }, semantics };
      const invoke = () =>
        operation === 'bind'
          ? adapter.bindUberDraftOptionChildGroup(command)
          : adapter.unbindUberDraftOptionChildGroup(command);

      const results = await Promise.all([invoke(), invoke(), invoke()]);

      expect(results[1]).toEqual(results[0]);
      expect(results[2]).toEqual(results[0]);
      await expect(persistence.binding.findMany()).resolves.toEqual([
        expect.objectContaining({ ...resourceKey, isBound }),
      ]);
      await expect(persistence.events.findMany()).resolves.toHaveLength(1);
    },
  );
});
