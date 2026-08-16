/* eslint-disable @typescript-eslint/no-unsafe-assignment */
import type { PrismaService } from '../../../../prisma/prisma.service';
import { UberMenuDraftMutationPrismaAdapter } from './uber-menu-draft-mutation-prisma.adapter';

const db = (value: object) => value as PrismaService;
const semantics = {
  samePayload: 'RETURN_SAME_BUSINESS_STATE',
  differentPayload: 'UPDATE_RESOURCE',
  sideEffects: 'DEDUPLICATE_BY_RESOURCE_AND_RESULTING_STATE',
  concurrency: 'CONVERGE_BY_UNIQUE_RESOURCE_KEY',
} as const;

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
      displayDescription: '  Spicy noodles  ',
      priceCents: 1499,
      isAvailable: false,
    });

    expect(upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        create: expect.objectContaining({
          storeId: 'store-1',
          menuItemStableId: 'item-1',
          priceCents: 1499,
          isAvailable: false,
          displayName: 'Noodles',
          displayDescription: 'Spicy noodles',
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

    await adapter.updateUberDraftOption('option-1', {
      storeId: 'store-1',
      displayName: '  Extra spicy  ',
      priceDeltaCents: 300,
      isAvailable: true,
    });
    expect(upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        create: expect.objectContaining({
          optionChoiceStableId: 'option-1',
          priceDeltaCents: 300,
          isAvailable: true,
          displayName: 'Extra spicy',
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
});
