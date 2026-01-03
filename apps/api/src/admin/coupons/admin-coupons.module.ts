// apps/api/src/admin/coupons/admin-coupons.module.ts
import { Module } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { AdminCouponsController } from './admin-coupons.controller';
import { AdminCouponsService } from './admin-coupons.service';

@Module({
  controllers: [AdminCouponsController],
  providers: [PrismaService, AdminCouponsService],
})
export class AdminCouponsModule {}
