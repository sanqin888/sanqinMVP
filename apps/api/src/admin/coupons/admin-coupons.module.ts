// apps/api/src/admin/coupons/admin-coupons.module.ts
import { Module } from '@nestjs/common';
import { AuthModule } from '../../auth/auth.module';
import { CouponsModule } from '../../coupons/public-api';
import { AdminCouponsController } from './admin-coupons.controller';
import { AdminCouponsService } from './admin-coupons.service';

@Module({
  imports: [AuthModule, CouponsModule],
  controllers: [AdminCouponsController],
  providers: [AdminCouponsService],
})
export class AdminCouponsModule {}
