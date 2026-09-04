import { Module } from '@nestjs/common';
import { PromotionsCoreModule } from './promotions-core.module';

@Module({
  imports: [PromotionsCoreModule],
  exports: [PromotionsCoreModule],
})
export class DailySpecialOffersModule {}
