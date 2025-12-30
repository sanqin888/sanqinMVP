// apps/api/src/admin/admin.module.ts
import { Module } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { AdminBusinessController } from './business/admin-business.controller';
import { AdminMenuController } from './menu/admin-menu.controller';
import { AdminBusinessService } from './business/admin-business.service';
import { AdminMenuService } from './menu/admin-menu.service';
import { AdminImageUploadController } from './upload/image/admin-image-upload.controller';
import { AdminImageUploadService } from './upload/image/admin-image-upload.service';
import { SessionAuthGuard } from '../auth/session-auth.guard';
import { RolesGuard } from '../auth/roles.guard';
import { AuthModule } from '../auth/auth.module';

@Module({
  imports: [AuthModule],
  controllers: [
    AdminBusinessController,
    AdminMenuController,
    AdminMenuController,
    AdminImageUploadController,
  ],
  providers: [
    PrismaService,
    AdminBusinessService,
    AdminMenuService,
    AdminImageUploadService,
    SessionAuthGuard,
    RolesGuard,
  ],
})
export class AdminModule {}
