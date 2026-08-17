import { UberMenuAvailabilityUseCase } from './uber-menu-availability.use-case';

describe('UberMenuAvailabilityUseCase', () => {
  const setup = () => {
    const queries = {
      isMenuItemPublishable: jest.fn(),
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

  it('没有历史 externalItemId/config 也会按 stableId 同步并重新发布', async () => {
    const { useCase, queries, commands, publish, telemetry } = setup();
    queries.isMenuItemPublishable.mockResolvedValue(true);
    queries.findProvisionedStores.mockResolvedValue([
      { storeId: 'pos-a', uberStoreId: 'uber-a' },
    ]);
    publish.execute.mockResolvedValue({ versionStableId: 'version-a' });

    const result = await useCase.syncUberMenuItemAvailability({
      menuItemStableId: 'item-1',
      isAvailable: false,
    });

    expect(commands.setItemAvailability).toHaveBeenCalledWith(
      'pos-a',
      'item-1',
      false,
    );
    expect(publish.execute).toHaveBeenCalledWith({
      storeId: 'pos-a',
      dryRun: false,
      taxRateConfirmed: true,
      timezoneConfirmed: true,
    });
    expect(result).toEqual({
      status: 'PENDING',
      stores: [
        {
          storeId: 'pos-a',
          uberStoreId: 'uber-a',
          status: 'PENDING',
          versionStableId: 'version-a',
        },
      ],
    });
    expect(telemetry.captureEvent).toHaveBeenCalledWith(
      'ubereats_menu_item_availability_sync_requested',
      expect.objectContaining({ status: 'PENDING', stores: result.stores }),
    );
  });

  it('菜品发布失败时记录失败工单并继续返回 FAILED', async () => {
    const { useCase, queries, commands, publish } = setup();
    queries.isMenuItemPublishable.mockResolvedValue(true);
    queries.findProvisionedStores.mockResolvedValue([
      { storeId: 'pos-a', uberStoreId: 'uber-a' },
    ]);
    publish.execute.mockRejectedValue(new Error('publish failed'));

    const result = await useCase.syncUberMenuItemAvailability({
      menuItemStableId: 'item-1',
      isAvailable: false,
    });

    expect(commands.createItemPublishFailure).toHaveBeenCalledWith({
      storeId: 'pos-a',
      uberStoreId: 'uber-a',
      menuItemStableId: 'item-1',
      isAvailable: false,
      error: 'publish failed',
    });
    expect(result.status).toBe('FAILED');
  });

  it('未配置 publishToUberEats 的菜品返回 SKIPPED_NOT_PUBLISHED', async () => {
    const { useCase, queries, commands, publish } = setup();
    queries.isMenuItemPublishable.mockResolvedValue(false);

    await expect(
      useCase.syncUberMenuItemAvailability({
        menuItemStableId: 'local-only',
        isAvailable: false,
      }),
    ).resolves.toEqual({ status: 'SKIPPED_NOT_PUBLISHED', stores: [] });

    expect(queries.findProvisionedStores).not.toHaveBeenCalled();
    expect(commands.setItemAvailability).not.toHaveBeenCalled();
    expect(publish.execute).not.toHaveBeenCalled();
  });

  it('可发布菜品没有 provisioned store 时返回 SKIPPED_NOT_PUBLISHED', async () => {
    const { useCase, queries, publish } = setup();
    queries.isMenuItemPublishable.mockResolvedValue(true);
    queries.findProvisionedStores.mockResolvedValue([]);

    await expect(
      useCase.syncUberMenuItemAvailability({
        menuItemStableId: 'item-1',
        isAvailable: true,
      }),
    ).resolves.toEqual({ status: 'SKIPPED_NOT_PUBLISHED', stores: [] });
    expect(publish.execute).not.toHaveBeenCalled();
  });

  it('多门店 option 部分发布失败时返回 FAILED 并继续其他门店', async () => {
    const { useCase, queries, commands, publish, telemetry } = setup();
    queries.findProvisionedStores.mockResolvedValue([
      { storeId: 'pos-a', uberStoreId: 'a' },
      { storeId: 'pos-b', uberStoreId: 'b' },
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
});
