import { Module } from '@nestjs/common';
import { AuthModule } from '../../auth/auth.module';
import { PromotionsModule } from '../../promotions/public-api';
import { AdminPromotionsController } from './admin-promotions.controller';

@Module({
  imports: [AuthModule, PromotionsModule],
  controllers: [AdminPromotionsController],
})
export class AdminPromotionsModule {}
