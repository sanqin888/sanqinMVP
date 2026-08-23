import {
  DiscoverUberStoresUseCase,
  MapUberStoreUseCase,
} from './uber-merchant-store-mapping.service';
import {
  DeprovisionUberStoreUseCase,
  ProvisionUberStoreUseCase,
  RetrieveUberStoreIntegrationConfigUseCase,
  RetrieveUberStoreStatusUseCase,
  SyncUberStoreStatusUseCase,
  UpdateUberStoreIntegrationConfigUseCase,
  UpdateUberStorePrepTimeUseCase,
} from './uber-merchant-provisioning.service';

const connection = { connectionId: 'merchant-1' };

describe('Uber merchant gateway use-case boundaries', () => {
  it('presents discovery candidates without binding before admin confirmation', async () => {
    const store = {
      storeId: 'uber-store-1',
      storeName: 'Fixture Store',
      locationSummary: 'Toronto',
      integrationEnabled: true,
      posExternalStoreId: 'pos-store-1',
      timezone: 'America/Toronto',
    };
    const api = {
      discoverStores: jest.fn().mockResolvedValue({ stores: [store] }),
    };
    const mappings = {
      findMappings: jest.fn().mockResolvedValue([]),
    };
    const useCase = new DiscoverUberStoresUseCase(
      api,
      { findConnection: jest.fn().mockResolvedValue(connection) } as never,
      mappings as never,
    );

    await expect(
      useCase.getMerchantStores(' merchant-1 '),
    ).resolves.toMatchObject({
      ok: true,
      connectionId: 'merchant-1',
      count: 1,
      stores: [
        expect.objectContaining({
          storeId: 'uber-store-1',
          isProvisioned: true,
        }),
      ],
    });
    expect(api.discoverStores).toHaveBeenCalledWith(connection);
  });

  it.each([
    ['malformed top-level response', 'UBER_STORE_DISCOVERY_MAPPING_FAILED'],
    ['malformed store entry', 'UBER_STORE_DISCOVERY_MAPPING_FAILED'],
  ])('does not interpret a %s from discovery', async (_scenario, code) => {
    const failure = {
      category: 'non-retryable-upstream',
      code,
      retryable: false,
    };
    const mappings = {
      findMappings: jest.fn(),
    };
    const useCase = new DiscoverUberStoresUseCase(
      { discoverStores: jest.fn().mockRejectedValue(failure) },
      { findConnection: jest.fn().mockResolvedValue(connection) } as never,
      mappings as never,
    );

    await expect(useCase.getMerchantStores('merchant-1')).rejects.toBe(failure);
    expect(mappings.findMappings).not.toHaveBeenCalled();
  });

  it('recovers a valid integrator store id into a new local mapping', async () => {
    const mappings = {
      findMapping: jest.fn().mockResolvedValue(null),
      upsertMapping: jest
        .fn()
        .mockImplementation((value) => Promise.resolve(value)),
    };
    const useCase = new MapUberStoreUseCase(
      mappings as never,
      {
        discoverStores: jest.fn().mockResolvedValue({
          stores: [
            {
              storeId: 'uber-store-1',
              posExternalStoreId: '4750_Yonge_Street',
            },
          ],
        }),
      } as never,
      { findConnection: jest.fn().mockResolvedValue(connection) } as never,
    );

    await expect(
      useCase.selectStore({
        connectionId: 'merchant-1',
        storeId: 'uber-store-1',
      }),
    ).resolves.toMatchObject({
      mapping: { posExternalStoreId: '4750_Yonge_Street' },
    });
    expect(mappings.upsertMapping).toHaveBeenCalledWith(
      expect.objectContaining({ posExternalStoreId: '4750_Yonge_Street' }),
    );
  });

  it('reauthorization reconnects an existing mapped store and preserves provisioning state', async () => {
    const existing = {
      connectionId: 'old-connection',
      uberStoreId: 'uber-store-1',
      storeName: 'SanQ',
      locationSummary: 'Toronto',
      isProvisioned: true,
      provisionedAt: new Date('2026-01-01T00:00:00.000Z'),
      posExternalStoreId: 'sanq-pos',
    };
    const mappings = {
      findMapping: jest.fn().mockResolvedValue(existing),
      reconnectMapping: jest.fn().mockResolvedValue({
        ...existing,
        connectionId: 'new-connection',
      }),
    };
    const useCase = new MapUberStoreUseCase(
      mappings as never,
      {
        discoverStores: jest
          .fn()
          .mockResolvedValue({ stores: [{ storeId: 'uber-store-1' }] }),
      } as never,
      {
        findConnection: jest
          .fn()
          .mockResolvedValue({ connectionId: 'new-connection' }),
      } as never,
    );

    await expect(
      useCase.selectStore({
        connectionId: 'new-connection',
        reconnectFromConnectionId: 'old-connection',
        storeId: 'uber-store-1',
      }),
    ).resolves.toMatchObject({
      mapping: {
        connectionId: 'new-connection',
        isProvisioned: true,
        provisionedAt: existing.provisionedAt,
        posExternalStoreId: 'sanq-pos',
      },
    });
    expect(mappings.reconnectMapping).toHaveBeenCalledWith(
      expect.objectContaining({
        fromConnectionId: 'old-connection',
        toConnectionId: 'new-connection',
      }),
    );
  });

  it('does not let an unrelated connection hijack an existing mapping', async () => {
    const mappings = {
      findMapping: jest.fn().mockResolvedValue({
        connectionId: 'owner-connection',
        uberStoreId: 'uber-store-1',
      }),
      reconnectMapping: jest.fn(),
    };
    const useCase = new MapUberStoreUseCase(
      mappings as never,
      { discoverStores: jest.fn().mockResolvedValue({ stores: [] }) } as never,
      {
        findConnection: jest
          .fn()
          .mockResolvedValue({ connectionId: 'attacker' }),
      } as never,
    );
    await expect(
      useCase.selectStore({
        connectionId: 'attacker',
        storeId: 'uber-store-1',
        reconnectFromConnectionId: 'owner-connection',
      }),
    ).rejects.toMatchObject({ code: 'STORE_NOT_AUTHORIZED' });
    expect(mappings.reconnectMapping).not.toHaveBeenCalled();
  });

  it('persists a validated provision response and enables scheduled order webhooks', async () => {
    const api = {
      provisionStore: jest.fn().mockResolvedValue({
        storeId: 'uber-store-1',
        status: 'ACTIVE',
        storeName: 'Fixture Store',
        locationSummary: 'Toronto',
        posExternalStoreId: 'pos-store-1',
      }),
    };
    const mappings = {
      findMapping: jest.fn().mockResolvedValue({
        ...connection,
        uberStoreId: 'uber-store-1',
        storeName: 'Fixture Store',
        locationSummary: 'Toronto',
        isProvisioned: false,
        provisionedAt: null,
        posExternalStoreId: 'sanq-store-1',
      }),
      upsertMapping: jest.fn().mockResolvedValue({
        provisionedAt: new Date('2026-01-01T00:00:00.000Z'),
      }),
    };
    const useCase = new ProvisionUberStoreUseCase(
      api,
      { findConnection: jest.fn().mockResolvedValue(connection) } as never,
      mappings as never,
    );

    await expect(
      useCase.provisionStore(
        ' uber-store-1 ',
        {
          is_order_manager: false,
          require_manual_acceptance: true,
          allowed_customer_requests: {
            allow_single_use_items_requests: false,
            allow_special_instruction_requests: false,
          },
          webhooks_config: {
            delivery_status_webhooks: { is_enabled: false },
            schedule_order_webhooks: { is_enabled: false },
            webhooks_version: '0.9.0',
          },
        },
        'merchant-1',
      ),
    ).resolves.toMatchObject({
      ok: true,
      storeId: 'uber-store-1',
      response: { storeId: 'uber-store-1', status: 'ACTIVE' },
    });
    expect(api.provisionStore).toHaveBeenCalledWith(
      connection,
      'uber-store-1',
      {
        integrator_store_id: 'sanq-store-1',
        is_order_manager: true,
        require_manual_acceptance: false,
        allowed_customer_requests: {
          allow_single_use_items_requests: true,
          allow_special_instruction_requests: true,
        },
        webhooks_config: {
          delivery_status_webhooks: { is_enabled: false },
          schedule_order_webhooks: { is_enabled: true },
          webhooks_version: '1.0.0',
        },
      },
      expect.stringMatching(/^sanqin-uber-/),
    );
    expect(mappings.upsertMapping).toHaveBeenCalledWith(
      expect.objectContaining({
        uberStoreId: 'uber-store-1',
        isProvisioned: true,
      }),
    );
  });

  it('requires a valid local Store ID mapping before Activate', async () => {
    const api = { provisionStore: jest.fn() };
    const mappings = {
      findMapping: jest.fn().mockResolvedValue({
        ...connection,
        uberStoreId: 'uber-store-1',
        posExternalStoreId: null,
      }),
      upsertMapping: jest.fn(),
    };
    const useCase = new ProvisionUberStoreUseCase(
      api as never,
      { findConnection: jest.fn().mockResolvedValue(connection) } as never,
      mappings as never,
    );

    await expect(
      useCase.provisionStore('uber-store-1', {}, 'merchant-1'),
    ).rejects.toMatchObject({ code: 'INVALID_REQUEST' });
    expect(api.provisionStore).not.toHaveBeenCalled();
  });

  it.each([
    [
      'order_manager_client_id',
      { order_manager_client_id: 'read-only-client' },
    ],
    ['integrator_store_id', { integrator_store_id: 'client-managed-store' }],
    ['integration_enabled', { integration_enabled: true }],
  ])(
    'rejects stale or non-Activate field %s before calling Uber',
    async (_field, payload) => {
      const api = { provisionStore: jest.fn() };
      const mappings = {
        findMapping: jest.fn().mockResolvedValue({
          ...connection,
          uberStoreId: 'uber-store-1',
          posExternalStoreId: 'sanq-store-1',
        }),
        upsertMapping: jest.fn(),
      };
      const useCase = new ProvisionUberStoreUseCase(
        api as never,
        { findConnection: jest.fn().mockResolvedValue(connection) } as never,
        mappings as never,
      );

      await expect(
        useCase.provisionStore('uber-store-1', payload, 'merchant-1'),
      ).rejects.toMatchObject({ code: 'INVALID_REQUEST' });
      expect(api.provisionStore).not.toHaveBeenCalled();
    },
  );

  it('does not persist a provision mapping failure such as a missing store ID', async () => {
    const failure = {
      category: 'non-retryable-upstream',
      code: 'UBER_STORE_PROVISION_MAPPING_FAILED',
      retryable: false,
    };
    const mappings = {
      findMapping: jest.fn().mockResolvedValue({
        ...connection,
        uberStoreId: 'uber-store-1',
        posExternalStoreId: 'sanq-store-1',
      }),
      upsertMapping: jest.fn(),
    };
    const useCase = new ProvisionUberStoreUseCase(
      { provisionStore: jest.fn().mockRejectedValue(failure) },
      { findConnection: jest.fn().mockResolvedValue(connection) } as never,
      mappings as never,
    );

    await expect(
      useCase.provisionStore('uber-store-1', {}, 'merchant-1'),
    ).rejects.toBe(failure);
    expect(mappings.upsertMapping).not.toHaveBeenCalled();
  });

  it('retrieves integration config only for the mapped merchant connection', async () => {
    const config = {
      storeId: 'uber-store-1',
      integrationEnabled: true,
    };
    const api = {
      retrieveIntegrationConfig: jest.fn().mockResolvedValue(config),
    };
    const mappings = {
      findMapping: jest.fn().mockResolvedValue({
        connectionId: 'merchant-1',
        uberStoreId: 'uber-store-1',
      }),
    };
    const useCase = new RetrieveUberStoreIntegrationConfigUseCase(
      api as never,
      { findConnection: jest.fn().mockResolvedValue(connection) } as never,
      mappings as never,
    );

    await expect(
      useCase.retrieve(' uber-store-1 ', 'merchant-1'),
    ).resolves.toBe(config);
    expect(api.retrieveIntegrationConfig).toHaveBeenCalledWith('uber-store-1');
  });

  it('updates integration config while preserving required webhook and customer-request contracts', async () => {
    const api = {
      updateIntegrationConfig: jest.fn().mockResolvedValue(undefined),
    };
    const mappings = {
      findMapping: jest.fn().mockResolvedValue({
        connectionId: 'merchant-1',
        uberStoreId: 'uber-store-1',
        posExternalStoreId: 'sanq-store-1',
      }),
    };
    const useCase = new UpdateUberStoreIntegrationConfigUseCase(
      api as never,
      { findConnection: jest.fn().mockResolvedValue(connection) } as never,
      mappings as never,
    );

    await expect(
      useCase.update(
        'uber-store-1',
        {
          integration_enabled: false,
          is_order_manager: false,
          require_manual_acceptance: true,
          allowed_customer_requests: {
            allow_single_use_items_requests: false,
            allow_special_instruction_requests: false,
          },
          webhooks_config: {
            order_release_webhooks: { is_enabled: false },
            schedule_order_webhooks: { is_enabled: false },
            webhooks_version: '0.9.0',
          },
        },
        'merchant-1',
      ),
    ).resolves.toMatchObject({ ok: true, storeId: 'uber-store-1' });
    expect(api.updateIntegrationConfig).toHaveBeenCalledWith(
      'uber-store-1',
      {
        integrator_store_id: 'sanq-store-1',
        integration_enabled: false,
        is_order_manager: true,
        require_manual_acceptance: false,
        allowed_customer_requests: {
          allow_single_use_items_requests: true,
          allow_special_instruction_requests: true,
        },
        webhooks_config: {
          order_release_webhooks: { is_enabled: false },
          schedule_order_webhooks: { is_enabled: true },
          webhooks_version: '1.0.0',
        },
      },
      expect.stringMatching(/^sanqin-uber-/),
    );
  });

  it('requires a valid local Store ID mapping before Config sync', async () => {
    const api = { updateIntegrationConfig: jest.fn() };
    const mappings = {
      findMapping: jest.fn().mockResolvedValue({
        connectionId: 'merchant-1',
        uberStoreId: 'uber-store-1',
        posExternalStoreId: null,
      }),
    };
    const useCase = new UpdateUberStoreIntegrationConfigUseCase(
      api as never,
      { findConnection: jest.fn().mockResolvedValue(connection) } as never,
      mappings as never,
    );

    await expect(
      useCase.update('uber-store-1', {}, 'merchant-1'),
    ).rejects.toMatchObject({ code: 'INVALID_REQUEST' });
    expect(api.updateIntegrationConfig).not.toHaveBeenCalled();
  });

  it.each([
    ['read-only root field', { order_manager_client_id: 'read-only-client' }],
    [
      'client-managed store id',
      { integrator_store_id: 'client-managed-store' },
    ],
    [
      'unknown webhook field',
      { webhooks_config: { unsupported_webhooks: { is_enabled: true } } },
    ],
    [
      'unsupported order-release webhook',
      { webhooks_config: { order_release_webhooks: { is_enabled: true } } },
    ],
    [
      'unsupported delivery-status webhook',
      { webhooks_config: { delivery_status_webhooks: { is_enabled: true } } },
    ],
  ])('rejects %s before PATCH reaches Uber', async (_scenario, payload) => {
    const api = { updateIntegrationConfig: jest.fn() };
    const mappings = {
      findMapping: jest.fn().mockResolvedValue({
        connectionId: 'merchant-1',
        uberStoreId: 'uber-store-1',
        posExternalStoreId: 'sanq-store-1',
      }),
    };
    const useCase = new UpdateUberStoreIntegrationConfigUseCase(
      api as never,
      { findConnection: jest.fn().mockResolvedValue(connection) } as never,
      mappings as never,
    );

    await expect(
      useCase.update('uber-store-1', payload, 'merchant-1'),
    ).rejects.toMatchObject({ code: 'INVALID_REQUEST' });
    expect(api.updateIntegrationConfig).not.toHaveBeenCalled();
  });

  it('removes the upstream integration and marks the local mapping deprovisioned', async () => {
    const mapping = {
      connectionId: 'merchant-1',
      uberStoreId: 'uber-store-1',
      storeName: 'SanQ',
      locationSummary: 'Toronto',
      isProvisioned: true,
      provisionedAt: new Date('2026-08-22T00:00:00.000Z'),
      posExternalStoreId: 'sanq-pos',
    };
    const api = {
      removeIntegration: jest.fn().mockResolvedValue(undefined),
    };
    const mappings = {
      findMapping: jest.fn().mockResolvedValue(mapping),
      upsertMapping: jest
        .fn()
        .mockImplementation((value) => Promise.resolve(value)),
    };
    const useCase = new DeprovisionUberStoreUseCase(
      api as never,
      { findConnection: jest.fn().mockResolvedValue(connection) } as never,
      mappings as never,
    );

    await expect(
      useCase.revokeOrDeprovisionStore('uber-store-1', 'merchant-1'),
    ).resolves.toMatchObject({ isProvisioned: false });
    expect(api.removeIntegration).toHaveBeenCalledWith(
      connection,
      'uber-store-1',
      expect.stringMatching(/^sanqin-uber-/),
    );
    expect(mappings.upsertMapping).toHaveBeenCalledWith({
      ...mapping,
      isProvisioned: false,
      provisionedAt: null,
    });
  });

  it('does not mark the local mapping deprovisioned when Uber removal fails', async () => {
    const failure = new Error('remove failed');
    const mapping = {
      connectionId: 'merchant-1',
      uberStoreId: 'uber-store-1',
      storeName: 'SanQ',
      locationSummary: 'Toronto',
      isProvisioned: true,
      provisionedAt: new Date('2026-08-22T00:00:00.000Z'),
      posExternalStoreId: 'sanq-pos',
    };
    const mappings = {
      findMapping: jest.fn().mockResolvedValue(mapping),
      upsertMapping: jest.fn(),
    };
    const useCase = new DeprovisionUberStoreUseCase(
      { removeIntegration: jest.fn().mockRejectedValue(failure) } as never,
      { findConnection: jest.fn().mockResolvedValue(connection) } as never,
      mappings as never,
    );

    await expect(
      useCase.revokeOrDeprovisionStore('uber-store-1', 'merchant-1'),
    ).rejects.toBe(failure);
    expect(mappings.upsertMapping).not.toHaveBeenCalled();
  });

  it('retrieves store status only for the provisioned mapped merchant connection', async () => {
    const status = {
      storeId: 'uber-store-1',
      status: 'OFFLINE',
      offlineReason: 'PAUSED_BY_RESTAURANT',
      offlineReasonMetadata: null,
      isOfflineUntil: null,
    };
    const api = { retrieveStatus: jest.fn().mockResolvedValue(status) };
    const mappings = {
      findMapping: jest.fn().mockResolvedValue({
        connectionId: 'merchant-1',
        uberStoreId: 'uber-store-1',
        isProvisioned: true,
      }),
    };
    const useCase = new RetrieveUberStoreStatusUseCase(
      api as never,
      { findConnection: jest.fn().mockResolvedValue(connection) } as never,
      mappings as never,
    );

    await expect(
      useCase.retrieve(' uber-store-1 ', 'merchant-1'),
    ).resolves.toBe(status);
    expect(api.retrieveStatus).toHaveBeenCalledWith('uber-store-1');
  });

  it('rejects Store Management calls for a mapped store that is not provisioned', async () => {
    const api = { retrieveStatus: jest.fn() };
    const useCase = new RetrieveUberStoreStatusUseCase(
      api as never,
      { findConnection: jest.fn().mockResolvedValue(connection) } as never,
      {
        findMapping: jest.fn().mockResolvedValue({
          connectionId: 'merchant-1',
          uberStoreId: 'uber-store-1',
          isProvisioned: false,
        }),
      } as never,
    );

    await expect(
      useCase.retrieve('uber-store-1', 'merchant-1'),
    ).rejects.toMatchObject({ code: 'STORE_NOT_PROVISIONED' });
    expect(api.retrieveStatus).not.toHaveBeenCalled();
  });

  it('updates default store prep time with a stable semantic request', async () => {
    const prepTime = {
      storeId: 'uber-store-1',
      defaultPrepTimeSeconds: 900,
    };
    const api = { updatePrepTime: jest.fn().mockResolvedValue(prepTime) };
    const mappings = {
      findMapping: jest.fn().mockResolvedValue({
        connectionId: 'merchant-1',
        uberStoreId: 'uber-store-1',
        isProvisioned: true,
      }),
    };
    const useCase = new UpdateUberStorePrepTimeUseCase(
      api as never,
      { findConnection: jest.fn().mockResolvedValue(connection) } as never,
      mappings as never,
    );

    await expect(
      useCase.update('uber-store-1', 900, 'merchant-1'),
    ).resolves.toBe(prepTime);
    expect(api.updatePrepTime).toHaveBeenCalledWith(
      'uber-store-1',
      900,
      expect.stringMatching(/^sanqin-uber-/),
    );
  });

  it.each([0, 10_801, 1.5])('rejects invalid prep time %s', async (seconds) => {
    const api = { updatePrepTime: jest.fn() };
    const useCase = new UpdateUberStorePrepTimeUseCase(
      api as never,
      { findConnection: jest.fn().mockResolvedValue(connection) } as never,
      {
        findMapping: jest.fn().mockResolvedValue({
          connectionId: 'merchant-1',
          uberStoreId: 'uber-store-1',
          isProvisioned: true,
        }),
      } as never,
    );

    await expect(
      useCase.update('uber-store-1', seconds, 'merchant-1'),
    ).rejects.toMatchObject({ code: 'INVALID_PREP_TIME' });
    expect(api.updatePrepTime).not.toHaveBeenCalled();
  });

  it('translates a paused store target to the Store API Suite OFFLINE payload', async () => {
    const succeeded = {
      uberStoreId: 'uber-store-1',
      outcome: 'SUCCEEDED' as const,
      attempts: 1,
      duplicate: false,
    };
    const api = { writeStatus: jest.fn().mockResolvedValue(succeeded) };
    const alerts = {
      getStoreStatusSource: jest.fn().mockResolvedValue({
        isTemporarilyClosed: false,
        temporaryCloseReason: null,
      }),
      recordStoreStatusResult: jest.fn().mockResolvedValue(undefined),
      createStoreStatusAlert: jest.fn().mockResolvedValue(undefined),
    };
    const useCase = new SyncUberStoreStatusUseCase(
      api as never,
      {
        listMappings: jest
          .fn()
          .mockResolvedValue([
            { uberStoreId: 'uber-store-1', isProvisioned: true },
          ]),
      } as never,
      alerts as never,
    );

    await expect(
      useCase.syncStoreStatusToUber({
        uberStoreId: 'uber-store-1',
        targetStatus: 'PAUSED',
        reason: 'Kitchen maintenance',
        pauseUntil: '2026-08-23T03:00:00.000Z',
      }),
    ).resolves.toMatchObject({ outcome: 'SUCCEEDED', synchronizedStores: 1 });
    expect(api.writeStatus).toHaveBeenCalledWith(
      'uber-store-1',
      {
        status: 'OFFLINE',
        reason: 'Kitchen maintenance',
        is_offline_until: '2026-08-23T03:00:00.000Z',
      },
      expect.stringMatching(/^sanqin-uber-/),
    );
  });

  it('records a rejected semantic status result without interpreting HTTP', async () => {
    const rejected = {
      uberStoreId: 'uber-store-1',
      outcome: 'FAILED' as const,
      reason: 'UPSTREAM_REJECTED' as const,
      retryable: false,
      attempts: 1,
      error: 'rejected by Uber',
    };
    const alerts = {
      getStoreStatusSource: jest.fn().mockResolvedValue({
        isTemporarilyClosed: false,
        temporaryCloseReason: null,
      }),
      recordStoreStatusResult: jest.fn().mockResolvedValue(undefined),
      createStoreStatusAlert: jest.fn().mockResolvedValue(undefined),
    };
    const useCase = new SyncUberStoreStatusUseCase(
      { writeStatus: jest.fn().mockResolvedValue(rejected) },
      {
        listMappings: jest
          .fn()
          .mockResolvedValue([
            { uberStoreId: 'uber-store-1', isProvisioned: true },
          ]),
      } as never,
      alerts as never,
    );

    await expect(useCase.syncStoreStatusToUber()).resolves.toMatchObject({
      outcome: 'FAILED',
      failedStores: 1,
      error: { code: 'UPSTREAM_REJECTED', retryable: false },
    });
    expect(alerts.recordStoreStatusResult).toHaveBeenCalledWith(rejected, {
      status: 'ONLINE',
    });
    expect(alerts.createStoreStatusAlert).toHaveBeenCalledWith(
      'uber-store-1',
      'rejected by Uber',
      'UPSTREAM_REJECTED',
      false,
      { status: 'ONLINE' },
    );
  });
});
