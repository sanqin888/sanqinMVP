/* eslint-disable @typescript-eslint/no-unsafe-assignment */
import type { PrismaService } from '../../../../prisma/prisma.service';
import { UberMenuDraftMutationPrismaAdapter } from './uber-menu-draft-mutation-prisma.adapter';
import type { UberTelemetryService } from './uber-telemetry.service';

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

  it('emits telemetry only after bind and unbind persistence succeeds', async () => {
    const upsert = jest
      .fn()
      .mockResolvedValueOnce({ isBound: true })
      .mockResolvedValueOnce({ isBound: false });
    const captureEvent = jest.fn().mockResolvedValue(undefined);
    const adapter = new UberMenuDraftMutationPrismaAdapter(
      db({
        menuOptionTemplateChoice: {
          findUnique: jest.fn().mockResolvedValue({ stableId: 'option-1' }),
        },
        menuOptionGroupTemplate: {
          findUnique: jest.fn().mockResolvedValue({ stableId: 'group-1' }),
        },
        uberOptionChildGroupBinding: { upsert },
      }),
      { captureEvent } as unknown as UberTelemetryService,
    );

    const resourceKey = {
      storeId: 'store-1',
      parentOptionChoiceStableId: 'option-1',
      childTemplateGroupStableId: 'group-1',
    };
    await adapter.bindUberDraftOptionChildGroup({
      resourceKey,
      payload: { isBound: true },
      semantics,
    });
    await adapter.unbindUberDraftOptionChildGroup({
      resourceKey,
      payload: { isBound: false },
      semantics,
    });

    expect(captureEvent).toHaveBeenNthCalledWith(
      1,
      'ubereats_draft_option_child_group_bound',
      expect.objectContaining({
        storeId: 'store-1',
        optionItemId: 'option-1',
        groupId: 'group-1',
      }),
      {
        eventId: 'uber-menu:binding:bound:store-1:option-1:group-1',
      },
    );
    expect(captureEvent).toHaveBeenNthCalledWith(
      2,
      'ubereats_draft_option_child_group_unbound',
      expect.objectContaining({ isBound: false }),
      {
        eventId: 'uber-menu:binding:unbound:store-1:option-1:group-1',
      },
    );
    expect(upsert.mock.invocationCallOrder[0]).toBeLessThan(
      captureEvent.mock.invocationCallOrder[0],
    );
  });
});
