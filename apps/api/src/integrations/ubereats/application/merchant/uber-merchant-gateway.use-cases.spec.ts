import { DiscoverUberStoresUseCase } from './uber-merchant-store-mapping.service';
import {
  ProvisionUberStoreUseCase,
  SyncUberStoreStatusUseCase,
} from './uber-merchant-provisioning.service';

const connection = { merchantUberUserId: 'merchant-1' };

describe('Uber merchant gateway use-case boundaries', () => {
  it('persists and presents a validated discovery result', async () => {
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
      saveDiscovery: jest.fn().mockResolvedValue(undefined),
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
      merchantUberUserId: 'merchant-1',
      count: 1,
      stores: [
        expect.objectContaining({
          storeId: 'uber-store-1',
          isProvisioned: true,
        }),
      ],
    });
    expect(api.discoverStores).toHaveBeenCalledWith(connection);
    expect(mappings.saveDiscovery).toHaveBeenCalledWith(
      expect.objectContaining({
        merchantUberUserId: 'merchant-1',
        uberStoreId: 'uber-store-1',
        isProvisioned: true,
      }),
    );
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
      saveDiscovery: jest.fn(),
    };
    const useCase = new DiscoverUberStoresUseCase(
      { discoverStores: jest.fn().mockRejectedValue(failure) },
      { findConnection: jest.fn().mockResolvedValue(connection) } as never,
      mappings as never,
    );

    await expect(useCase.getMerchantStores('merchant-1')).rejects.toBe(failure);
    expect(mappings.findMappings).not.toHaveBeenCalled();
    expect(mappings.saveDiscovery).not.toHaveBeenCalled();
  });

  it('persists a validated provision response and excludes credential fields', async () => {
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
      useCase.provisionStore(' uber-store-1 ', { enabled: true }, 'merchant-1'),
    ).resolves.toMatchObject({
      ok: true,
      storeId: 'uber-store-1',
      response: { storeId: 'uber-store-1', status: 'ACTIVE' },
    });
    expect(api.provisionStore).toHaveBeenCalledWith(
      connection,
      'uber-store-1',
      { enabled: true },
      expect.stringMatching(/^sanqin-uber-/),
    );
    expect(mappings.upsertMapping).toHaveBeenCalledWith(
      expect.objectContaining({
        uberStoreId: 'uber-store-1',
        isProvisioned: true,
      }),
    );
  });

  it('does not persist a provision mapping failure such as a missing store ID', async () => {
    const failure = {
      category: 'non-retryable-upstream',
      code: 'UBER_STORE_PROVISION_MAPPING_FAILED',
      retryable: false,
    };
    const mappings = { upsertMapping: jest.fn() };
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
