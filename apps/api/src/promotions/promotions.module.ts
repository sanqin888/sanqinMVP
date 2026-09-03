// apps/api/src/promotions/promotions.module.ts
import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { CouponsModule } from '../coupons/coupons.module';
import { SessionAuthGuard } from '../auth/session-auth.guard';
import { PrismaService } from '../prisma/prisma.service';
import { PromotionsController } from './promotions.controller';
import { PromotionsService } from './promotions.service';
import { PROMOTION_CONTEXT_READER } from './promotion-context.contract';
import { BrandStoreConfigModule } from '../store/public-api';

@Module({
  imports: [AuthModule, CouponsModule, BrandStoreConfigModule],
  controllers: [PromotionsController],
  providers: [
    PromotionsService,
    {
      provide: PROMOTION_CONTEXT_READER,
      useExisting: PromotionsService,
    },
    PrismaService,
    SessionAuthGuard,
  ],
  exports: [PROMOTION_CONTEXT_READER],
})
export class PromotionsModule {}
