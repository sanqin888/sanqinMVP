// apps/api/src/admin/admin.module.ts
import { Module } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { AdminBusinessController } from './business/admin-business.controller';
import { AdminBusinessService } from './business/admin-business.service';
import { AdminMenuModule } from './menu/admin-menu.module';
import { AdminImageUploadController } from './upload/image/admin-image-upload.controller';
import { AdminImageUploadService } from './upload/image/admin-image-upload.service';
import { SessionAuthGuard } from '../auth/session-auth.guard';
import { RolesGuard } from '../auth/roles.guard';
import { AdminStaffController } from './staff/admin-staff.controller';
import { AuthModule } from '../auth/auth.module';

@Module({
  imports: [AuthModule, AdminMenuModule],
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
