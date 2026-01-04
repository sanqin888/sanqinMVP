// apps/api/src/admin/admin.module.ts
import { Module } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { AdminBusinessController } from './business/admin-business.controller';
import { AdminBusinessService } from './business/admin-business.service';
import { AdminMenuModule } from './menu/admin-menu.module';
import { AdminImageUploadController } from './upload/image/admin-image-upload.controller';
import { AdminImageUploadService } from './upload/image/admin-image-upload.service';
import { AdminImageUploadModule } from './upload/image/admin-image-upload.module';
import { SessionAuthGuard } from '../auth/session-auth.guard';
import { RolesGuard } from '../auth/roles.guard';
import { AdminStaffController } from './staff/admin-staff.controller';
import { AuthModule } from '../auth/auth.module';
import { AdminCouponsModule } from './coupons/admin-coupons.module';
import { BusinessHoursModule } from './business-hours/business-hours.module';
import { PromotionsModule } from '../promotions/promotions.module';

@Module({
  imports: [
    AuthModule,
    BusinessHoursModule,
    AdminMenuModule,
    AdminImageUploadModule,
    AdminCouponsModule,
    PromotionsModule,
  ],
  controllers: [
    AdminBusinessController,
    AdminImageUploadController,
    AdminStaffController,
  ],
  providers: [
    PrismaService,
    AdminBusinessService,
    AdminImageUploadService,
    SessionAuthGuard,
    RolesGuard,
  ],
})
export class AdminModule {}
