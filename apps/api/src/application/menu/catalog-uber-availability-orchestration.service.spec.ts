import type { CatalogExternalAvailabilitySyncPort } from './catalog-external-availability-sync.port';
import { CatalogUberAvailabilityOrchestrationService } from './catalog-uber-availability-orchestration.service';

describe('CatalogUberAvailabilityOrchestrationService', () => {
  const build = (syncResult: unknown = { status: 'SYNCED', stores: [] }) => {
    const catalog = {
      validateFixedComponentComposition: jest.fn().mockResolvedValue(undefined),
      updateItem: jest.fn().mockResolvedValue({
        ok: true,
        availability: {
          stableId: 'dish-1',
          isAvailable: true,
          tempUnavailableUntil: null,
          effectiveAvailability: true,
        },
      }),
      setItemAvailability: jest
        .fn()
        .mockImplementation(
          (_storeStableId: string, _stableId: string, mode: string) =>
            Promise.resolve({
              stableId: 'dish-1',
              isAvailable: mode !== 'PERMANENT_OFF',
              visibility: 'PUBLIC',
              isVisibleOnMainMenu: true,
              tempUnavailableUntil:
                mode === 'TEMP_TODAY_OFF' ? '2099-01-01T00:00:00.000Z' : null,
              effectiveAvailability: mode === 'ON',
            }),
        ),
      setTemplateOptionAvailability: jest.fn().mockResolvedValue({
        ok: true,
        availability: {
          stableId: 'option-1',
          isAvailable: false,
          tempUnavailableUntil: null,
          effectiveAvailability: false,
        },
      }),
    };
    const catalogAvailability = {
      getMenuItemAvailabilitySnapshot: jest.fn().mockResolvedValue({
        stableId: 'dish-1',
        visibility: 'PUBLIC',
        publishToUberEats: true,
        tempUnavailableUntil: null,
        hasFixedComponents: false,
      }),
      getOptionAvailabilitySnapshot: jest.fn(),
    };
    const syncMenuItemAvailability = jest.fn().mockResolvedValue(syncResult);
    const syncOptionAvailability = jest.fn().mockResolvedValue(syncResult);
    const storeTimezone = {
      getStoreTimezone: jest.fn().mockResolvedValue('America/Toronto'),
    };
    const externalAvailability: jest.Mocked<CatalogExternalAvailabilitySyncPort> =
      {
        syncMenuItemAvailability,
        syncOptionAvailability,
      };

    return {
      service: new CatalogUberAvailabilityOrchestrationService(
        catalog as never,
        catalogAvailability as never,
        externalAvailability,
        storeTimezone as never,
      ),
      catalog,
      storeTimezone,
      catalogAvailability,
      syncMenuItemAvailability,
      syncOptionAvailability,
    };
  };

  it('resolves TEMP_TODAY_OFF against the Store timezone rather than process TZ', async () => {
    jest.useFakeTimers();
    jest.setSystemTime(new Date('2026-07-15T03:30:00.000Z'));
    try {
      const { service, catalog, storeTimezone } = build();

      await service.setItemAvailability('store-1', 'dish-1', 'TEMP_TODAY_OFF');

      expect(storeTimezone.getStoreTimezone).toHaveBeenCalledWith('store-1');
      expect(catalog.setItemAvailability).toHaveBeenCalledWith(
        'store-1',
        'dish-1',
        'TEMP_TODAY_OFF',
        {
          effectiveAt: new Date('2026-07-15T03:30:00.000Z'),
          tempUnavailableUntil: new Date('2026-07-15T04:00:00.000Z'),
        },
      );
    } finally {
      jest.useRealTimers();
    }
  });

  it.each([
    ['TEMP_TODAY_OFF', false],
    ['PERMANENT_OFF', false],
    ['ON', true],
  ] as const)(
    '%s returns structured SYNCED status',
    async (mode, available) => {
      const { service, syncMenuItemAvailability } = build();
      const result = await service.setItemAvailability(
        'store-1',
        'dish-1',
        mode,
      );
      expect(result.uberSync.status).toBe('SYNCED');
      expect(syncMenuItemAvailability).toHaveBeenCalledWith({
        storeStableId: 'store-1',
        menuItemStableId: 'dish-1',
        isAvailable: available,
        publishable: true,
        suspendUntil:
          mode === 'TEMP_TODAY_OFF' ? '2099-01-01T00:00:00.000Z' : null,
      });
    },
  );

  it('preserves Admin HTTP storeId compatibility while Uber public port uses storeStableId', async () => {
    const { service } = build({
      status: 'SYNCED',
      stores: [{ storeStableId: '4750_Yonge_Street', status: 'SYNCED' }],
    });

    const result = await service.setItemAvailability('store-1', 'dish-1', 'ON');

    expect(result.uberSync.stores).toEqual([
      { storeId: '4750_Yonge_Street', status: 'SYNCED' },
    ]);
  });

  it('returns retryable FAILED status when the public Uber capability throws', async () => {
    const { service, syncMenuItemAvailability } = build();
    syncMenuItemAvailability.mockRejectedValue(new Error('upstream'));

    const result = await service.setItemAvailability(
      'store-1',
      'dish-1',
      'PERMANENT_OFF',
    );

    expect(result.uberSync).toEqual(
      expect.objectContaining({ status: 'FAILED' }),
    );
  });

  it('keeps generic item updates outside availability synchronization', async () => {
    const { service, catalog, syncMenuItemAvailability } = build();

    await expect(
      service.updateItem('store-1', 'dish-1', { nameEn: 'Updated' }),
    ).resolves.toEqual({ ok: true });
    expect(catalog.updateItem).toHaveBeenCalledWith('store-1', 'dish-1', {
      nameEn: 'Updated',
    });
    expect(syncMenuItemAvailability).not.toHaveBeenCalled();
  });

  it('syncs option availability through the Uber public capability', async () => {
    const { service, syncOptionAvailability } = build();

    await expect(
      service.setTemplateOptionAvailability(
        'store-1',
        'option-1',
        'PERMANENT_OFF',
      ),
    ).resolves.toEqual({ ok: true });
    expect(syncOptionAvailability).toHaveBeenCalledWith({
      storeStableId: 'store-1',
      optionChoiceStableId: 'option-1',
      isAvailable: false,
      suspendUntil: null,
    });
  });

  it('keeps the fixed-component Uber capability guard outside Catalog persistence', async () => {
    const { service, catalog, catalogAvailability } = build();
    catalogAvailability.getMenuItemAvailabilitySnapshot.mockResolvedValue({
      stableId: 'combo-1',
      visibility: 'PUBLIC',
      publishToUberEats: true,
      tempUnavailableUntil: null,
      hasFixedComponents: false,
    });

    await expect(
      service.updateItem('store-1', 'combo-1', {
        fixedComponents: [
          { componentItemStableId: 'component-1', quantity: 1 },
        ],
      }),
    ).rejects.toThrow('Fixed combo items cannot be published to Uber Eats');
    expect(catalog.validateFixedComponentComposition).toHaveBeenCalledWith(
      'store-1',
      'combo-1',
      [{ componentItemStableId: 'component-1', quantity: 1 }],
    );
    expect(catalog.updateItem).not.toHaveBeenCalled();
  });

  it('preserves Catalog validation errors before the Uber capability guard', async () => {
    const { service, catalog, catalogAvailability } = build();
    catalogAvailability.getMenuItemAvailabilitySnapshot.mockResolvedValue({
      stableId: 'combo-1',
      visibility: 'PUBLIC',
      publishToUberEats: true,
      tempUnavailableUntil: null,
      hasFixedComponents: false,
    });
    catalog.validateFixedComponentComposition.mockRejectedValue(
      new Error('fixed component validation failed'),
    );

    await expect(
      service.updateItem('store-1', 'combo-1', {
        fixedComponents: [
          { componentItemStableId: 'component-1', quantity: 0 },
        ],
      }),
    ).rejects.toThrow('fixed component validation failed');
    expect(catalog.updateItem).not.toHaveBeenCalled();
  });

  it('allows removing fixed components from an Uber-enabled item', async () => {
    const { service, catalog, catalogAvailability } = build();
    catalogAvailability.getMenuItemAvailabilitySnapshot.mockResolvedValue({
      stableId: 'combo-1',
      visibility: 'PUBLIC',
      publishToUberEats: true,
      tempUnavailableUntil: null,
      hasFixedComponents: true,
    });

    await expect(
      service.updateItem('store-1', 'combo-1', { fixedComponents: [] }),
    ).resolves.toEqual({ ok: true });
    expect(catalog.updateItem).toHaveBeenCalledWith('store-1', 'combo-1', {
      fixedComponents: [],
    });
  });
});
