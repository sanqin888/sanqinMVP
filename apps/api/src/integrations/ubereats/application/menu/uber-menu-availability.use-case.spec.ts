import { UberMenuAvailabilityUseCase } from './uber-menu-availability.use-case';

describe('UberMenuAvailabilityUseCase', () => {
  const setup = () => {
    const queries = {
      findItemConfigs: jest.fn(),
      findProvisionedStores: jest.fn(),
    };
    const commands = {
      setItemAvailability: jest.fn(),
      setOptionAvailability: jest.fn(),
      createItemPublishFailure: jest.fn(),
    };
    const publish = { execute: jest.fn() };
    const telemetry = { captureEvent: jest.fn() };
    return {
      queries,
      commands,
      publish,
      telemetry,
      useCase: new UberMenuAvailabilityUseCase(
        queries,
        commands,
        publish,
        telemetry,
      ),
    };
  };

  it('汇总未发布门店与待发布门店，并记录完整 telemetry', async () => {
    const { useCase, queries, publish, telemetry } = setup();
    queries.findItemConfigs.mockResolvedValue([
      { storeId: 'store-a', uberStoreId: 'uber-a', externalItemId: 'ext-a' },
      { storeId: 'store-b', uberStoreId: 'uber-b', externalItemId: null },
    ]);
    queries.findProvisionedStores.mockResolvedValue([
      { uberStoreId: 'uber-a' },
      { uberStoreId: 'uber-b' },
    ]);
    publish.execute.mockResolvedValue({ versionStableId: 'version-a' });
    const result = await useCase.syncUberMenuItemAvailability({
      menuItemStableId: 'item-1',
      isAvailable: false,
    });
    expect(result).toEqual({
      status: 'PENDING',
      stores: [
        {
          storeId: 'store-a',
          uberStoreId: 'uber-a',
          status: 'PENDING',
          versionStableId: 'version-a',
        },
        {
          storeId: 'store-b',
          uberStoreId: 'uber-b',
          status: 'SKIPPED_NOT_PUBLISHED',
        },
      ],
    });
    expect(telemetry.captureEvent).toHaveBeenCalledWith(
      'ubereats_menu_item_availability_sync_requested',
      expect.objectContaining({ status: 'PENDING', stores: result.stores }),
    );
  });

  it('多门店部分发布失败时返回 FAILED 并继续其他门店', async () => {
    const { useCase, queries, commands, publish, telemetry } = setup();
    queries.findProvisionedStores.mockResolvedValue([
      { uberStoreId: 'a' },
      { uberStoreId: 'b' },
    ]);
    publish.execute
      .mockResolvedValueOnce({ versionStableId: 'v-a' })
      .mockRejectedValueOnce(new Error('publish b failed'));
    const result = await useCase.syncUberOptionItemAvailability({
      optionChoiceStableId: 'option-1',
      isAvailable: true,
    });
    expect(result.status).toBe('FAILED');
    expect(result.stores.map(({ status }) => status)).toEqual([
      'PENDING',
      'FAILED',
    ]);
    expect(commands.setOptionAvailability).toHaveBeenCalledTimes(2);
    expect(telemetry.captureEvent).toHaveBeenCalledWith(
      'ubereats_option_item_availability_synced',
      expect.objectContaining({ status: 'FAILED', stores: result.stores }),
    );
  });

  it('没有已发布 item 配置时返回 SKIPPED_NOT_PUBLISHED', async () => {
    const { useCase, queries, publish } = setup();
    queries.findItemConfigs.mockResolvedValue([]);
    queries.findProvisionedStores.mockResolvedValue([]);
    await expect(
      useCase.syncUberMenuItemAvailability({
        menuItemStableId: 'missing',
        isAvailable: true,
      }),
    ).resolves.toEqual({ status: 'SKIPPED_NOT_PUBLISHED', stores: [] });
    expect(publish.execute).not.toHaveBeenCalled();
  });
});
