import { Module } from '@nestjs/common';
import { CatalogAdminModule } from '../../menu/public-api';
import { DailySpecialOffersModule } from '../../promotions/public-api';
import { CatalogOffersMenuOrchestrationService } from './catalog-offers-menu-orchestration.service';

@Module({
  imports: [CatalogAdminModule, DailySpecialOffersModule],
  providers: [CatalogOffersMenuOrchestrationService],
  exports: [CatalogOffersMenuOrchestrationService],
})
export class CatalogOffersMenuOrchestrationModule {}
