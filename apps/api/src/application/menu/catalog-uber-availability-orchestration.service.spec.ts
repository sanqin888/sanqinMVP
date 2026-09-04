import type { UberEatsMenuAvailabilityPort } from '../../integrations/ubereats/public-api';
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
        .mockImplementation((_stableId: string, mode: string) =>
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
    const syncUberMenuItemAvailability = jest
      .fn()
      .mockResolvedValue(syncResult);
    const syncUberOptionItemAvailability = jest
      .fn()
      .mockResolvedValue(syncResult);
    const uberProvider: jest.Mocked<UberEatsMenuAvailabilityPort> = {
      syncUberMenuItemAvailability,
      syncUberOptionItemAvailability,
    };

    return {
      service: new CatalogUberAvailabilityOrchestrationService(
        catalog as never,
        catalogAvailability as never,
        uberProvider,
      ),
      catalog,
      catalogAvailability,
      syncUberMenuItemAvailability,
      syncUberOptionItemAvailability,
    };
  };

  it.each([
    ['TEMP_TODAY_OFF', false],
    ['PERMANENT_OFF', false],
    ['ON', true],
  ] as const)(
    '%s returns structured SYNCED status',
    async (mode, available) => {
      const { service, syncUberMenuItemAvailability } = build();
      const result = await service.setItemAvailability('dish-1', mode);
      expect(result.uberSync.status).toBe('SYNCED');
      expect(syncUberMenuItemAvailability).toHaveBeenCalledWith({
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

    const result = await service.setItemAvailability('dish-1', 'ON');

    expect(result.uberSync.stores).toEqual([
      { storeId: '4750_Yonge_Street', status: 'SYNCED' },
    ]);
  });

  it('returns retryable FAILED status when the public Uber capability throws', async () => {
    const { service, syncUberMenuItemAvailability } = build();
    syncUberMenuItemAvailability.mockRejectedValue(new Error('upstream'));

    const result = await service.setItemAvailability('dish-1', 'PERMANENT_OFF');

    expect(result.uberSync).toEqual(
      expect.objectContaining({ status: 'FAILED' }),
    );
  });

  it('syncs Uber only when updateItem changes availability fields', async () => {
    const { service, catalog, syncUberMenuItemAvailability } = build();

    await expect(
      service.updateItem('dish-1', { isAvailable: true }),
    ).resolves.toEqual({ ok: true });
    expect(catalog.updateItem).toHaveBeenCalledWith('dish-1', {
      isAvailable: true,
    });
    expect(syncUberMenuItemAvailability).toHaveBeenCalledWith({
      menuItemStableId: 'dish-1',
      isAvailable: true,
      publishable: true,
      suspendUntil: null,
    });

    syncUberMenuItemAvailability.mockClear();
    await service.updateItem('dish-1', { nameEn: 'Updated' });
    expect(syncUberMenuItemAvailability).not.toHaveBeenCalled();
  });

  it('syncs option availability through the Uber public capability', async () => {
    const { service, syncUberOptionItemAvailability } = build();

    await expect(
      service.setTemplateOptionAvailability('option-1', 'PERMANENT_OFF'),
    ).resolves.toEqual({ ok: true });
    expect(syncUberOptionItemAvailability).toHaveBeenCalledWith({
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
      service.updateItem('combo-1', {
        fixedComponents: [
          { componentItemStableId: 'component-1', quantity: 1 },
        ],
      }),
    ).rejects.toThrow('Fixed combo items cannot be published to Uber Eats');
    expect(catalog.validateFixedComponentComposition).toHaveBeenCalledWith(
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
      service.updateItem('combo-1', {
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
      service.updateItem('combo-1', { fixedComponents: [] }),
    ).resolves.toEqual({ ok: true });
    expect(catalog.updateItem).toHaveBeenCalledWith('combo-1', {
      fixedComponents: [],
    });
  });
});
