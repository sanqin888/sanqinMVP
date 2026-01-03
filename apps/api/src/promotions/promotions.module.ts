// apps/api/src/promotions/promotions.module.ts
import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { PrismaService } from '../prisma/prisma.service';
import { PromotionsController } from './promotions.controller';
import { PromotionsService } from './promotions.service';

@Module({
  imports: [AuthModule],
  controllers: [PromotionsController],
  providers: [PromotionsService, PrismaService],
})
export class PromotionsModule {}
