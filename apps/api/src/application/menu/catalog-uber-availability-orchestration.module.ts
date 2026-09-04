import { Module } from '@nestjs/common';
import { UberEatsModule } from '../../integrations/ubereats/ubereats.module';
import {
  CatalogAvailabilityModule,
  PublicMenuModule,
} from '../../menu/public-api';
import { CatalogUberAvailabilityOrchestrationService } from './catalog-uber-availability-orchestration.service';

@Module({
  imports: [CatalogAvailabilityModule, PublicMenuModule, UberEatsModule],
  providers: [CatalogUberAvailabilityOrchestrationService],
  exports: [CatalogUberAvailabilityOrchestrationService],
})
export class CatalogUberAvailabilityOrchestrationModule {}
