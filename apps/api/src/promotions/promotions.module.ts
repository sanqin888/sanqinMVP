// apps/api/src/promotions/promotions.module.ts
import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { CouponsModule } from '../coupons/public-api';
import { SessionAuthGuard } from '../auth/session-auth.guard';
import { PromotionsController } from './promotions.controller';
import { PromotionsCoreModule } from './promotions-core.module';

@Module({
  imports: [AuthModule, CouponsModule, PromotionsCoreModule],
  controllers: [PromotionsController],
  providers: [SessionAuthGuard],
  exports: [PromotionsCoreModule],
})
export class PromotionsModule {}
