import type { PrismaService } from '../../../../prisma/prisma.service';
import {
  UberMenuDraftCommandPrismaRepository,
  UberMenuDraftQueryPrismaRepository,
} from './uber-menu.repository';

describe('Uber menu repository contracts', () => {
  it('maps Prisma rows to an application DTO without persistence-only fields', async () => {
    const findMany = jest
      .fn<
        Promise<
          Array<{
            id: string;
            storeId: string;
            menuItemStableId: string;
            priceCents: number;
            isAvailable: boolean;
            displayName: string;
            displayDescription: string | null;
            createdAt: Date;
            updatedAt: Date;
          }>
        >,
        [
          {
            select: Record<string, boolean>;
            where: { storeId: string };
            orderBy: { updatedAt: string };
            take: number;
          },
        ]
      >()
      .mockResolvedValue([
        {
          id: 'prisma-id',
          storeId: 'store-1',
          menuItemStableId: 'item-1',
          priceCents: 1200,
          isAvailable: true,
          displayName: 'Noodles',
          displayDescription: null,
          createdAt: new Date(0),
          updatedAt: new Date(0),
        },
      ]);
    const prisma = { uberItemChannelConfig: { findMany } };
    const repository = new UberMenuDraftQueryPrismaRepository(
      prisma as unknown as PrismaService,
    );

    const result = await repository.listItemConfigs('store-1');

    expect(result).toEqual([
      {
        storeId: 'store-1',
        stableId: 'item-1',
        priceCents: 1200,
        isAvailable: true,
        displayName: 'Noodles',
        displayDescription: null,
      },
    ]);
    expect(result[0]).not.toHaveProperty('id');
    expect(result[0]).not.toHaveProperty('createdAt');
    expect(result[0]).not.toHaveProperty('updatedAt');
    expect(findMany.mock.calls[0]?.[0].select.menuItemStableId).toBe(true);
  });

  it('maps command fields explicitly and does not expose the delegate result', async () => {
    const update = jest.fn().mockResolvedValue({ id: 'prisma-id' });
    const prisma = { uberOptionItemConfig: { update } };
    const repository = new UberMenuDraftCommandPrismaRepository(
      prisma as unknown as PrismaService,
    );

    await expect(
      repository.updateOption('store-1', 'option-1', {
        priceDeltaCents: 200,
      }),
    ).resolves.toBeUndefined();
    expect(update).toHaveBeenCalledWith({
      where: {
        storeId_optionChoiceStableId: {
          storeId: 'store-1',
          optionChoiceStableId: 'option-1',
        },
      },
      data: {
        priceDeltaCents: 200,
        isAvailable: undefined,
        displayName: undefined,
        displayDescription: undefined,
      },
    });
  });
});
