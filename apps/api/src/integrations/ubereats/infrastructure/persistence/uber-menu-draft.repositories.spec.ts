import type { PrismaService } from '../../../../prisma/prisma.service';
import {
  UberBusinessSchedulePrismaRepository,
  UberItemChannelConfigPrismaRepository,
  UberMenuSnapshotPrismaRepository,
  UberMenuStoreMappingPrismaRepository,
  UberModifierConfigPrismaRepository,
} from './uber-menu-draft.repositories';

const db = (value: object) => value as PrismaService;
describe('split Uber menu repositories field mapping', () => {
  it('maps the source menu snapshot', async () => {
    const repository = new UberMenuSnapshotPrismaRepository(
      db({
        menuCategory: {
          findMany: jest
            .fn()
            .mockResolvedValue([
              { stableId: 'c', nameEn: 'Food', sortOrder: 1, id: 'db-id' },
            ]),
        },
        menuItem: {
          findMany: jest.fn().mockResolvedValue([
            {
              stableId: 'i',
              nameEn: 'Soup',
              basePriceCents: 500,
              isAvailable: true,
              category: { stableId: 'c' },
              id: 'db-id',
            },
          ]),
        },
      }),
    );
    expect(await repository.load()).toEqual({
      categories: [{ stableId: 'c', name: 'Food', sortOrder: 1 }],
      items: [
        {
          stableId: 'i',
          categoryStableId: 'c',
          name: 'Soup',
          priceCents: 500,
          isAvailable: true,
        },
      ],
    });
  });

  it('maps item channel config', async () => {
    const repository = new UberItemChannelConfigPrismaRepository(
      db({
        uberItemChannelConfig: {
          findMany: jest.fn().mockResolvedValue([
            {
              storeId: 's',
              menuItemStableId: 'i',
              priceCents: 10,
              isAvailable: true,
              displayName: null,
              displayDescription: null,
              id: 'db-id',
            },
          ]),
        },
      }),
    );
    expect(await repository.list('s')).toEqual([
      {
        storeId: 's',
        stableId: 'i',
        priceCents: 10,
        isAvailable: true,
        displayName: null,
        displayDescription: null,
      },
    ]);
  });

  it('maps modifier config', async () => {
    const repository = new UberModifierConfigPrismaRepository(
      db({
        uberModifierGroupConfig: {
          findMany: jest.fn().mockResolvedValue([
            {
              storeId: 's',
              templateGroupStableId: 'g',
              displayName: 'Size',
              minSelect: 1,
              maxSelect: 1,
              isActive: true,
              id: 'db-id',
            },
          ]),
        },
      }),
    );
    expect(await repository.list('s')).toEqual([
      {
        storeId: 's',
        stableId: 'g',
        displayName: 'Size',
        minSelect: 1,
        maxSelect: 1,
        isActive: true,
      },
    ]);
  });

  it('maps business schedule', async () => {
    const repository = new UberBusinessSchedulePrismaRepository(
      db({
        businessConfig: {
          findUnique: jest.fn().mockResolvedValue({
            timezone: 'Asia/Shanghai',
            salesTaxRate: 0.1,
            id: 1,
          }),
        },
        businessHour: {
          findMany: jest.fn().mockResolvedValue([
            {
              weekday: 1,
              openMinutes: 60,
              closeMinutes: 120,
              isClosed: false,
              id: 9,
            },
          ]),
        },
      }),
    );
    expect(await repository.get()).toEqual({
      timezone: 'Asia/Shanghai',
      salesTaxRate: 0.1,
      hours: [
        { weekday: 1, openMinutes: 60, closeMinutes: 120, isClosed: false },
      ],
    });
  });

  it('maps store data and extracts its timezone without returning raw JSON', async () => {
    const repository = new UberMenuStoreMappingPrismaRepository(
      db({
        uberStoreMapping: {
          findFirst: jest.fn().mockResolvedValue({
            uberStoreId: 'u',
            connectionId: 'm',
            posExternalStoreId: 's',
            isProvisioned: true,
            rawPayload: { location: { time_zone: 'America/Toronto' } },
            id: 'db-id',
          }),
        },
      }),
    );
    expect(await repository.findByPosStoreId('s')).toEqual({
      uberStoreId: 'u',
      connectionId: 'm',
      posExternalStoreId: 's',
      isProvisioned: true,
      timezone: 'America/Toronto',
    });
  });
});
