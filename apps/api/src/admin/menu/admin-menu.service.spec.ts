jest.mock('@prisma/client', () => ({
  PrismaClient: class {},
  SpecialPricingMode: {},
}));
jest.mock(
  '@shared/menu',
  () => ({
    isAvailableNow: ({
      isAvailable,
      tempUnavailableUntil,
    }: {
      isAvailable: boolean;
      tempUnavailableUntil: string | null;
    }) =>
      isAvailable &&
      (!tempUnavailableUntil || Date.parse(tempUnavailableUntil) <= Date.now()),
  }),
  { virtual: true },
);
jest.mock('../../integrations/ubereats/ubereats.service', () => ({
  UberEatsService: class {},
}));

import { AdminMenuService } from './admin-menu.service';

describe('AdminMenuService availability Uber status', () => {
  const build = (syncResult: unknown) => {
    const prisma = {
      menuItem: {
        findFirst: jest.fn().mockResolvedValue({ id: 1 }),
        update: jest.fn().mockImplementation(({ data }) =>
          Promise.resolve({
            stableId: 'dish-1',
            ...data,
            visibility: 'PUBLIC',
            isVisibleOnMainMenu: true,
          }),
        ),
      },
    };
    const uber = {
      syncUberMenuItemAvailability: jest.fn().mockResolvedValue(syncResult),
    };
    return {
      service: new AdminMenuService(prisma as never, uber as never),
      uber,
    };
  };

  it.each([
    ['TEMP_TODAY_OFF', false],
    ['PERMANENT_OFF', false],
    ['ON', true],
  ] as const)('%s 返回结构化 PENDING 状态', async (mode, available) => {
    const { service, uber } = build({ status: 'PENDING', stores: [] });
    const result = await service.setItemAvailability('dish-1', mode);
    expect(result.uberSync.status).toBe('PENDING');
    expect(uber.syncUberMenuItemAvailability).toHaveBeenCalledWith({
      menuItemStableId: 'dish-1',
      isAvailable: available,
    });
  });

  it('上游异常不会伪装成功，并返回可重试的 FAILED 状态', async () => {
    const { service, uber } = build(null);
    uber.syncUberMenuItemAvailability.mockRejectedValue(new Error('upstream'));
    const result = await service.setItemAvailability('dish-1', 'PERMANENT_OFF');
    expect(result.uberSync).toEqual(
      expect.objectContaining({ status: 'FAILED' }),
    );
  });
});
