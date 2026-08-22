import { Module } from '@nestjs/common';
import { AuthModule } from '../../auth/auth.module';
import { PrismaModule } from '../../prisma/prisma.module';
import { AdminPromotionsController } from './admin-promotions.controller';
import { AdminPromotionsService } from './admin-promotions.service';

@Module({
  imports: [AuthModule, PrismaModule],
  controllers: [AdminPromotionsController],
  providers: [AdminPromotionsService],
})
export class AdminPromotionsModule {}
