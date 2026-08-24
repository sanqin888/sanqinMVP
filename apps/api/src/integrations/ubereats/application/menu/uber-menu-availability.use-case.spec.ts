import { UberMenuAvailabilityUseCase } from './uber-menu-availability.use-case';

describe('UberMenuAvailabilityUseCase', () => {
  const setup = () => {
    const queries = {
      isMenuItemPublishable: jest.fn(),
      findMenuItemSuspendUntil: jest.fn().mockResolvedValue(null),
      findOptionSuspendUntil: jest.fn().mockResolvedValue(null),
      findProvisionedStores: jest.fn(),
    };
    const commands = {
      createItemPublishFailure: jest.fn(),
    };
    const gateway = {
      uploadMenu: jest.fn(),
      updateItemAvailability: jest.fn(),
    };
    const telemetry = { captureEvent: jest.fn() };
    return {
      queries,
      commands,
      gateway,
      telemetry,
      useCase: new UberMenuAvailabilityUseCase(
        queries,
        commands,
        gateway,
        telemetry,
      ),
    };
  };

  it('通过 Uber item endpoint 同步单品可售状态', async () => {
    const { useCase, queries, gateway, telemetry } = setup();
    queries.isMenuItemPublishable.mockResolvedValue(true);
    queries.findProvisionedStores.mockResolvedValue([
      { storeId: 'pos-a', uberStoreId: 'uber-a' },
    ]);
    gateway.updateItemAvailability.mockResolvedValue(undefined);

    const result = await useCase.syncUberMenuItemAvailability({
      menuItemStableId: 'item-1',
      isAvailable: false,
    });

    expect(gateway.updateItemAvailability).toHaveBeenCalledWith(
      expect.objectContaining({
        storeId: 'uber-a',
        isAvailable: false,
        suspendUntilEpochSeconds: null,
      }),
    );
    expect(gateway.uploadMenu).not.toHaveBeenCalled();
    expect(result).toEqual({
      status: 'SYNCED',
      stores: [
        {
          storeId: 'pos-a',
          uberStoreId: 'uber-a',
          status: 'SYNCED',
        },
      ],
    });
    expect(telemetry.captureEvent).toHaveBeenCalledWith(
      'ubereats_menu_item_availability_sync_requested',
      expect.objectContaining({ status: 'SYNCED', stores: result.stores }),
    );
  });

  it('临时下架把本地结束时间转换为 Uber Unix 秒', async () => {
    const { useCase, queries, gateway } = setup();
    const suspendUntil = new Date('2090-01-02T03:04:05.000Z');
    queries.isMenuItemPublishable.mockResolvedValue(true);
    queries.findMenuItemSuspendUntil.mockResolvedValue(suspendUntil);
    queries.findProvisionedStores.mockResolvedValue([
      { storeId: 'pos-a', uberStoreId: 'uber-a' },
    ]);
    gateway.updateItemAvailability.mockResolvedValue(undefined);

    await useCase.syncUberMenuItemAvailability({
      menuItemStableId: 'item-1',
      isAvailable: false,
    });

    expect(gateway.updateItemAvailability).toHaveBeenCalledWith(
      expect.objectContaining({
        suspendUntilEpochSeconds: Math.floor(suspendUntil.getTime() / 1_000),
      }),
    );
  });

  it('菜品同步失败时记录失败工单并返回 FAILED', async () => {
    const { useCase, queries, commands, gateway } = setup();
    queries.isMenuItemPublishable.mockResolvedValue(true);
    queries.findProvisionedStores.mockResolvedValue([
      { storeId: 'pos-a', uberStoreId: 'uber-a' },
    ]);
    gateway.updateItemAvailability.mockRejectedValue(
      new Error('update failed'),
    );

    const result = await useCase.syncUberMenuItemAvailability({
      menuItemStableId: 'item-1',
      isAvailable: false,
    });

    expect(commands.createItemPublishFailure).toHaveBeenCalledWith({
      storeId: 'pos-a',
      uberStoreId: 'uber-a',
      menuItemStableId: 'item-1',
      isAvailable: false,
      error: 'update failed',
    });
    expect(result.status).toBe('FAILED');
  });

  it('未配置 publishToUberEats 的菜品返回 SKIPPED_NOT_PUBLISHED', async () => {
    const { useCase, queries, gateway } = setup();
    queries.isMenuItemPublishable.mockResolvedValue(false);

    await expect(
      useCase.syncUberMenuItemAvailability({
        menuItemStableId: 'local-only',
        isAvailable: false,
      }),
    ).resolves.toEqual({ status: 'SKIPPED_NOT_PUBLISHED', stores: [] });

    expect(queries.findProvisionedStores).not.toHaveBeenCalled();
    expect(gateway.updateItemAvailability).not.toHaveBeenCalled();
  });

  it('可发布菜品没有 provisioned store 时返回 SKIPPED_NOT_PUBLISHED', async () => {
    const { useCase, queries, gateway } = setup();
    queries.isMenuItemPublishable.mockResolvedValue(true);
    queries.findProvisionedStores.mockResolvedValue([]);

    await expect(
      useCase.syncUberMenuItemAvailability({
        menuItemStableId: 'item-1',
        isAvailable: true,
      }),
    ).resolves.toEqual({ status: 'SKIPPED_NOT_PUBLISHED', stores: [] });
    expect(gateway.updateItemAvailability).not.toHaveBeenCalled();
  });

  it('option 204 成功后返回 SYNCED，不保留旧的 PENDING 状态', async () => {
    const { useCase, queries, gateway, telemetry } = setup();
    queries.findProvisionedStores.mockResolvedValue([
      { storeId: 'pos-a', uberStoreId: 'uber-a' },
    ]);
    gateway.updateItemAvailability.mockResolvedValue(undefined);

    const result = await useCase.syncUberOptionItemAvailability({
      optionChoiceStableId: 'option-1',
      isAvailable: false,
    });

    expect(gateway.updateItemAvailability).toHaveBeenCalledWith(
      expect.objectContaining({
        storeId: 'uber-a',
        isAvailable: false,
        suspendUntilEpochSeconds: null,
      }),
    );
    expect(gateway.uploadMenu).not.toHaveBeenCalled();
    expect(result).toEqual({
      status: 'SYNCED',
      stores: [
        {
          storeId: 'pos-a',
          uberStoreId: 'uber-a',
          status: 'SYNCED',
        },
      ],
    });
    expect(telemetry.captureEvent).toHaveBeenCalledWith(
      'ubereats_option_item_availability_synced',
      expect.objectContaining({ status: 'SYNCED', stores: result.stores }),
    );
  });

  it('多门店 option 部分同步失败时返回 FAILED 并继续其他门店', async () => {
    const { useCase, queries, gateway, telemetry } = setup();
    queries.findProvisionedStores.mockResolvedValue([
      { storeId: 'pos-a', uberStoreId: 'a' },
      { storeId: 'pos-b', uberStoreId: 'b' },
    ]);
    gateway.updateItemAvailability
      .mockResolvedValueOnce(undefined)
      .mockRejectedValueOnce(new Error('update b failed'));

    const result = await useCase.syncUberOptionItemAvailability({
      optionChoiceStableId: 'option-1',
      isAvailable: true,
    });

    expect(result.status).toBe('FAILED');
    expect(result.stores.map(({ status }) => status)).toEqual([
      'SYNCED',
      'FAILED',
    ]);
    expect(gateway.updateItemAvailability).toHaveBeenNthCalledWith(
      1,
      expect.objectContaining({
        storeId: 'a',
        isAvailable: true,
        suspendUntilEpochSeconds: null,
      }),
    );
    expect(telemetry.captureEvent).toHaveBeenCalledWith(
      'ubereats_option_item_availability_synced',
      expect.objectContaining({ status: 'FAILED', stores: result.stores }),
    );
  });
});
