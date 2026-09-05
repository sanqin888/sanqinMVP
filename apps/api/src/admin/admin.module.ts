// apps/api/src/admin/admin.module.ts
import { Module } from '@nestjs/common';
import { StaffBrandStoreController } from './business/staff-brand-store.controller';
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
import { AdminPromotionsModule } from './promotions/admin-promotions.module';
import { AdminMembersModule } from './members/admin-members.module';
import { AdminPosDevicesModule } from './pos-devices/admin-pos-devices.module';
import { UberEatsModule } from '../integrations/ubereats/ubereats.module';
import { HomepageContentModule } from '../homepage/homepage-content.module';
import { AdminHomepageController } from './homepage/admin-homepage.controller';
import { LoyaltyModule } from '../loyalty/public-api';
import { BrandStoreConfigModule } from '../store/public-api';
import { AdminLoyaltyPolicyController } from './benefits/admin-loyalty-policy.controller';

@Module({
  imports: [
    AuthModule,
    AdminMenuModule,
    AdminImageUploadModule,
    AdminCouponsModule,
    AdminPromotionsModule,
    AdminMembersModule,
    AdminPosDevicesModule,
    UberEatsModule,
    HomepageContentModule,
    LoyaltyModule,
    BrandStoreConfigModule,
  ],
  controllers: [
    StaffBrandStoreController,
    AdminImageUploadController,
    AdminStaffController,
    AdminHomepageController,
    AdminLoyaltyPolicyController,
  ],
  providers: [
    AdminBusinessService,
    AdminImageUploadService,
    SessionAuthGuard,
    RolesGuard,
  ],
})
export class AdminModule {}
