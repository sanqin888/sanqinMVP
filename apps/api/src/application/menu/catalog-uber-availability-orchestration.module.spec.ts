import { MODULE_METADATA } from '@nestjs/common/constants';
import { UBER_EATS_MENU_AVAILABILITY } from '../../integrations/ubereats/public-api';
import {
  STORE_DIRECTORY_READER,
  STORE_TIMEZONE_READER,
} from '../../store/public-api';
import { CATALOG_EXTERNAL_AVAILABILITY_SYNC } from './catalog-external-availability-sync.port';
import {
  CATALOG_HISTORY_STORE_DIRECTORY,
  CATALOG_STORE_TIMEZONE,
} from './catalog-store-context.port';
import { CatalogUberAvailabilityOrchestrationModule } from './catalog-uber-availability-orchestration.module';

const providers = (): unknown[] => {
  const value: unknown = Reflect.getMetadata(
    MODULE_METADATA.PROVIDERS,
    CatalogUberAvailabilityOrchestrationModule,
  );
  return Array.isArray(value) ? value : [];
};

describe('CatalogUberAvailabilityOrchestrationModule', () => {
  it('keeps Store timezone/directory adaptation confined to this composition root', () => {
    const storeTimezoneProvider = providers().find(
      (candidate) =>
        typeof candidate === 'object' &&
        candidate !== null &&
        'provide' in candidate &&
        candidate.provide === CATALOG_STORE_TIMEZONE,
    ) as { inject?: unknown[] } | undefined;
    const storeDirectoryProvider = providers().find(
      (candidate) =>
        typeof candidate === 'object' &&
        candidate !== null &&
        'provide' in candidate &&
        candidate.provide === CATALOG_HISTORY_STORE_DIRECTORY,
    ) as { inject?: unknown[] } | undefined;

    expect(storeTimezoneProvider?.inject).toEqual([STORE_TIMEZONE_READER]);
    expect(storeDirectoryProvider?.inject).toEqual([STORE_DIRECTORY_READER]);
  });

  it('adapts the Catalog outbound port to the Uber public availability capability', async () => {
    const provider = providers().find(
      (candidate) =>
        typeof candidate === 'object' &&
        candidate !== null &&
        'provide' in candidate &&
        candidate.provide === CATALOG_EXTERNAL_AVAILABILITY_SYNC,
    ) as
      | {
          inject?: unknown[];
          useFactory?: (uberAvailability: never) => {
            syncMenuItemAvailability(input: object): Promise<unknown>;
            syncOptionAvailability(input: object): Promise<unknown>;
          };
        }
      | undefined;

    expect(provider?.inject).toEqual([UBER_EATS_MENU_AVAILABILITY]);
    const syncUberMenuItemAvailability = jest
      .fn()
      .mockResolvedValue({ status: 'SYNCED', stores: [] });
    const syncUberOptionItemAvailability = jest
      .fn()
      .mockResolvedValue({ status: 'SYNCED', stores: [] });
    const adapter = provider!.useFactory!({
      syncUberMenuItemAvailability,
      syncUberOptionItemAvailability,
    } as never);
    const itemInput = {
      menuItemStableId: 'item-1',
      isAvailable: false,
      publishable: true,
      suspendUntil: '2090-01-02T03:04:05.000Z',
    };
    const optionInput = {
      optionChoiceStableId: 'option-1',
      isAvailable: true,
      suspendUntil: null,
    };

    await adapter.syncMenuItemAvailability(itemInput);
    await adapter.syncOptionAvailability(optionInput);

    expect(syncUberMenuItemAvailability).toHaveBeenCalledWith(itemInput);
    expect(syncUberOptionItemAvailability).toHaveBeenCalledWith(optionInput);
  });
});
