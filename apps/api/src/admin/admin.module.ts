// apps/api/src/admin/admin.module.ts
import { Module } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { AdminBusinessController } from './business/admin-business.controller';
import { AdminMenuController } from './menu/admin-menu.controller';
import { AdminBusinessService } from './business/admin-business.service';
import { AdminMenuService } from './menu/admin-menu.service';
import { AdminImageUploadController } from './upload/image/admin-image-upload.controller';
import { AdminImageUploadService } from './upload/image/admin-image-upload.service';
import { AdminAuthGuard } from '../auth/admin-auth.guard';

@Module({
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
    AdminAuthGuard,
  ],
})
export class AdminModule {}
