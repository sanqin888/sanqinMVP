import { PrismaStoreScheduleAdapter } from './brand-store-config.reader';

const storeStableId = '4750_Yonge_Street';
const storeDbId = '8a3d4c0e-4750-4f6a-9138-000000000001';

function setup() {
  const prisma = {
    store: {
      findUnique: jest.fn().mockResolvedValue({ id: storeDbId }),
    },
    businessHour: {
      findMany: jest.fn().mockResolvedValue([
        {
          weekday: 1,
          openMinutes: 660,
          closeMinutes: 1260,
          isClosed: false,
        },
      ]),
      findUnique: jest.fn().mockResolvedValue(null),
    },
    holiday: {
      findMany: jest.fn().mockResolvedValue([]),
    },
  };

  return {
    prisma,
    adapter: new PrismaStoreScheduleAdapter(prisma as never),
  };
}

describe('PrismaStoreScheduleAdapter', () => {
  it('translates storeStableId to storeDbId before reading business hours', async () => {
    const { prisma, adapter } = setup();

    await expect(adapter.listBusinessHours(storeStableId)).resolves.toEqual([
      {
        weekday: 1,
        openMinutes: 660,
        closeMinutes: 1260,
        isClosed: false,
      },
    ]);

    expect(prisma.store.findUnique).toHaveBeenCalledWith({
      where: { storeStableId },
      select: { id: true },
    });
    expect(prisma.businessHour.findMany).toHaveBeenCalledWith({
      where: { storeDbId },
      orderBy: { weekday: 'asc' },
    });
  });

  it('uses the storeDbId + weekday compound identity for one business day', async () => {
    const { prisma, adapter } = setup();

    await adapter.getBusinessHour(storeStableId, 2);

    expect(prisma.businessHour.findUnique).toHaveBeenCalledWith({
      where: {
        storeDbId_weekday: { storeDbId, weekday: 2 },
      },
    });
  });

  it('scopes holiday reads to the resolved storeDbId', async () => {
    const { prisma, adapter } = setup();

    await adapter.listHolidays(storeStableId);

    expect(prisma.holiday.findMany).toHaveBeenCalledWith({
      where: { storeDbId },
      orderBy: { date: 'asc' },
    });
  });
});
