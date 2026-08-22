// apps/api/src/promotions/promotions.module.ts
import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { CouponsModule } from '../coupons/coupons.module';
import { SessionAuthGuard } from '../auth/session-auth.guard';
import { PrismaService } from '../prisma/prisma.service';
import { PromotionsController } from './promotions.controller';
import { PromotionsService } from './promotions.service';

@Module({
  imports: [AuthModule, CouponsModule],
  controllers: [PromotionsController],
  providers: [PromotionsService, PrismaService, SessionAuthGuard],
  exports: [PromotionsService],
})
export class PromotionsModule {}
