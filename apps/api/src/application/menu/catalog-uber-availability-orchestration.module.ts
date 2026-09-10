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
  CATALOG_EXTERNAL_AVAILABILITY_SYNC,
  type CatalogExternalAvailabilitySyncPort,
} from './catalog-external-availability-sync.port';
import { CatalogUberAvailabilityOrchestrationService } from './catalog-uber-availability-orchestration.service';

@Module({
  imports: [CatalogAdminModule, CatalogAvailabilityModule, UberEatsModule],
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
    CatalogUberAvailabilityOrchestrationService,
  ],
  exports: [CatalogUberAvailabilityOrchestrationService],
})
export class CatalogUberAvailabilityOrchestrationModule {}
