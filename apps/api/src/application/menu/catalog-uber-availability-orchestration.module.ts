import { Module } from '@nestjs/common';
import { UberEatsModule } from '../../integrations/ubereats/ubereats.module';
import {
  UBER_EATS_MENU_AVAILABILITY,
  type UberEatsMenuAvailabilityPort,
} from '../../integrations/ubereats/public-api';
import {
  CatalogAdminModule,
  CatalogAvailabilityModule,
} from '../../menu/public-api';
import {
  BrandStoreConfigModule,
  STORE_DIRECTORY_READER,
  STORE_TIMEZONE_READER,
  type StoreDirectoryReaderPort,
  type StoreTimezoneReaderPort,
} from '../../store/public-api';
import {
  CATALOG_EXTERNAL_AVAILABILITY_SYNC,
  type CatalogExternalAvailabilitySyncPort,
} from './catalog-external-availability-sync.port';
import { CatalogAvailabilityHistoryBootstrapService } from './catalog-availability-history-bootstrap.service';
import {
  CATALOG_HISTORY_STORE_DIRECTORY,
  CATALOG_STORE_TIMEZONE,
  type CatalogHistoryStoreDirectoryPort,
  type CatalogStoreTimezonePort,
} from './catalog-store-context.port';
import { CatalogUberAvailabilityOrchestrationService } from './catalog-uber-availability-orchestration.service';

@Module({
  imports: [
    CatalogAdminModule,
    CatalogAvailabilityModule,
    BrandStoreConfigModule,
    UberEatsModule,
  ],
  providers: [
    {
      provide: CATALOG_EXTERNAL_AVAILABILITY_SYNC,
      inject: [UBER_EATS_MENU_AVAILABILITY],
      useFactory: (
        uberAvailability: UberEatsMenuAvailabilityPort,
      ): CatalogExternalAvailabilitySyncPort => ({
        syncMenuItemAvailability: (input) =>
          uberAvailability.syncUberMenuItemAvailability(input),
        syncOptionAvailability: (input) =>
          uberAvailability.syncUberOptionItemAvailability(input),
      }),
    },
    {
      provide: CATALOG_STORE_TIMEZONE,
      inject: [STORE_TIMEZONE_READER],
      useFactory: (
        storeTimezone: StoreTimezoneReaderPort,
      ): CatalogStoreTimezonePort => ({
        getStoreTimezone: async (storeStableId) =>
          (await storeTimezone.getStoreTimezone(storeStableId)).timezone,
      }),
    },
    {
      provide: CATALOG_HISTORY_STORE_DIRECTORY,
      inject: [STORE_DIRECTORY_READER],
      useFactory: (
        stores: StoreDirectoryReaderPort,
      ): CatalogHistoryStoreDirectoryPort => ({
        listStoreStableIds: async () =>
          (await stores.listStores()).map((store) => store.storeStableId),
      }),
    },
    CatalogUberAvailabilityOrchestrationService,
    CatalogAvailabilityHistoryBootstrapService,
  ],
  exports: [CatalogUberAvailabilityOrchestrationService],
})
export class CatalogUberAvailabilityOrchestrationModule {}
