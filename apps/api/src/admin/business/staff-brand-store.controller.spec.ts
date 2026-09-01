import { StaffBrandStoreController } from './staff-brand-store.controller';

describe('StaffBrandStoreController store identity routing', () => {
  const originalStoreId = process.env.STORE_ID;

  afterEach(() => {
    if (originalStoreId === undefined) {
      delete process.env.STORE_ID;
    } else {
      process.env.STORE_ID = originalStoreId;
    }
  });

  it('keeps the legacy singular route explicit at the adapter while canonical routes use their requested stable id', async () => {
    process.env.STORE_ID = ' configured_store ';
    const service = {
      getStoreConfig: jest
        .fn()
        .mockResolvedValue({ storeStableId: 'configured_store' }),
    };
    const controller = new StaffBrandStoreController(
      service as never,
      {} as never,
    );

    await controller.getStoreConfig();
    await controller.getStoreConfigByStableId('store_b');

    expect(service.getStoreConfig).toHaveBeenNthCalledWith(
      1,
      'configured_store',
    );
    expect(service.getStoreConfig).toHaveBeenNthCalledWith(2, 'store_b');
  });
});
