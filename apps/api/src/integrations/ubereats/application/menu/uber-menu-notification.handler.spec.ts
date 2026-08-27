import {
  UberMenuNotificationHandler,
  UberMenuRefreshRequestHandler,
} from './uber-menu-notification.handler';

describe('UberMenuNotificationHandler', () => {
  it('未知 correlation 安全忽略', async () => {
    const repository = {
      findByCorrelation: jest.fn().mockResolvedValue(null),
      apply: jest.fn(),
    };
    const handler = new UberMenuNotificationHandler(repository);
    await expect(
      handler.handle({ resourceId: 'unknown', status: 'SUCCEEDED' }),
    ).resolves.toEqual({ kind: 'ignored', reason: 'unknown_publication' });
    expect(repository.apply).not.toHaveBeenCalled();
  });

  it('重复 webhook 始终按同一不可变 resourceId 关联，由 repository 幂等应用', async () => {
    const repository = {
      findByCorrelation: jest
        .fn()
        .mockResolvedValue({ versionStableId: 'publish-version-1' }),
      apply: jest.fn(),
    };
    const handler = new UberMenuNotificationHandler(repository);
    const event = { resourceId: 'resource-1', status: 'SUCCEEDED' };
    await expect(handler.handle(event)).resolves.toEqual({ kind: 'handled' });
    await expect(handler.handle(event)).resolves.toEqual({ kind: 'handled' });
    expect(repository.findByCorrelation).toHaveBeenNthCalledWith(1, {
      publishVersion: null,
      resourceId: 'resource-1',
    });
    expect(repository.apply).toHaveBeenCalledTimes(2);
    expect(repository.apply).toHaveBeenCalledWith('publish-version-1', event);
  });
});

const refreshEvent = {
  version: 1 as const,
  family: 'menu-refresh' as const,
  eventType: 'store.menu_refresh_request' as const,
  eventId: 'evt-refresh-1',
  resourceHref: 'https://api.uber.com/v1/eats/stores/uber-store-1',
  resourceId: 'uber-store-1',
  userId: null,
  storeId: 'uber-store-1',
  partnerStoreId: '4750_Yonge_Street',
};

describe('UberMenuRefreshRequestHandler', () => {
  it('re-uploads the latest confirmed full menu for the mapped store', async () => {
    const payload = {
      menus: [],
      categories: [],
      items: [],
      modifier_groups: [],
      display_options: { disable_item_instructions: false },
    } as never;
    const provisionedStores = {
      resolveProvisionedUberStoreId: jest.fn().mockResolvedValue({
        uberStoreId: 'uber-store-1',
        posExternalStoreId: '4750_Yonge_Street',
      }),
    };
    const publications = {
      findLastSucceededPayload: jest.fn().mockResolvedValue(payload),
    };
    const gateway = { uploadMenu: jest.fn().mockResolvedValue(undefined) };
    const telemetry = {
      captureEvent: jest.fn().mockResolvedValue(undefined),
      workflowLog: jest.fn(),
    };
    const handler = new UberMenuRefreshRequestHandler(
      provisionedStores as never,
      publications as never,
      gateway as never,
      telemetry,
    );

    await handler.execute('evt-refresh-1', refreshEvent);

    expect(publications.findLastSucceededPayload).toHaveBeenCalledWith(
      '4750_Yonge_Street',
    );
    expect(gateway.uploadMenu).toHaveBeenCalledWith(
      expect.objectContaining({
        storeId: 'uber-store-1',
        payload,
        idempotencyKey: expect.stringMatching(/^sanqin-uber-[a-f0-9]{64}$/),
      }),
    );
    expect(telemetry.captureEvent).toHaveBeenCalledWith(
      'ubereats_store_menu_refresh_processed',
      expect.objectContaining({
        eventId: 'evt-refresh-1',
        uberStoreId: 'uber-store-1',
        posStoreId: '4750_Yonge_Street',
      }),
    );
  });

  it('does not upload when partner_store_id conflicts with the stable mapping', async () => {
    const provisionedStores = {
      resolveProvisionedUberStoreId: jest.fn().mockResolvedValue({
        uberStoreId: 'uber-store-1',
        posExternalStoreId: 'different-store',
      }),
    };
    const gateway = { uploadMenu: jest.fn() };
    const handler = new UberMenuRefreshRequestHandler(
      provisionedStores as never,
      { findLastSucceededPayload: jest.fn() } as never,
      gateway as never,
      { captureEvent: jest.fn(), workflowLog: jest.fn() },
    );

    await expect(
      handler.execute('evt-refresh-1', refreshEvent),
    ).rejects.toMatchObject({
      code: 'UBER_MENU_REFRESH_STORE_MAPPING_MISMATCH',
    });
    expect(gateway.uploadMenu).not.toHaveBeenCalled();
  });
});
