import { Module } from '@nestjs/common';
import { UberEatsModule } from '../../integrations/ubereats/ubereats.module';
import {
  CatalogAdminModule,
  CatalogAvailabilityModule,
} from '../../menu/public-api';
import { CatalogUberAvailabilityOrchestrationService } from './catalog-uber-availability-orchestration.service';

@Module({
  imports: [CatalogAdminModule, CatalogAvailabilityModule, UberEatsModule],
  providers: [CatalogUberAvailabilityOrchestrationService],
  exports: [CatalogUberAvailabilityOrchestrationService],
})
export class CatalogUberAvailabilityOrchestrationModule {}
