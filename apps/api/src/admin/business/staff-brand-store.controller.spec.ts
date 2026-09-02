import { StaffBrandStoreController } from './staff-brand-store.controller';

describe('StaffBrandStoreController store identity routing', () => {
  it('passes the requested stable id through every canonical Store route', async () => {
    const hours = [
      { weekday: 1, openMinutes: 600, closeMinutes: 1200, isClosed: false },
    ];
    const holidays = [
      {
        date: '2026-12-25',
        name: 'Christmas',
        isClosed: true,
        openMinutes: null,
        closeMinutes: null,
      },
    ];
    const service = {
      getStoreConfig: jest.fn().mockResolvedValue({ storeStableId: 'store_b' }),
      updateStoreConfig: jest
        .fn()
        .mockResolvedValue({ storeStableId: 'store_b' }),
      getStoreHours: jest.fn().mockResolvedValue(hours),
      updateStoreHours: jest.fn().mockResolvedValue(hours),
      getStoreHolidays: jest.fn().mockResolvedValue(holidays),
      updateStoreHolidays: jest.fn().mockResolvedValue(holidays),
    };
    const controller = new StaffBrandStoreController(
      service as never,
      {} as never,
    );
    const configUpdate = { timezone: 'America/Toronto' };
    const hoursBody = { hours };
    const holidaysBody = { holidays };

    await controller.getStoreConfigByStableId('store_b');
    await controller.updateStoreConfigByStableId('store_b', configUpdate);
    await controller.getStoreHoursByStableId('store_b');
    await controller.updateStoreHoursByStableId('store_b', hoursBody);
    await controller.getStoreHolidaysByStableId('store_b');
    await controller.updateStoreHolidaysByStableId('store_b', holidaysBody);

    expect(service.getStoreConfig).toHaveBeenCalledWith('store_b');
    expect(service.updateStoreConfig).toHaveBeenCalledWith(
      configUpdate,
      'store_b',
    );
    expect(service.getStoreHours).toHaveBeenCalledWith('store_b');
    expect(service.updateStoreHours).toHaveBeenCalledWith(hours, 'store_b');
    expect(service.getStoreHolidays).toHaveBeenCalledWith('store_b');
    expect(service.updateStoreHolidays).toHaveBeenCalledWith(
      holidaysBody,
      'store_b',
    );
  });
});
