// apps/api/src/admin/admin.module.ts
import { Module } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { AdminBusinessController } from './business/admin-business.controller';
import { AdminMenuController } from './menu/admin-menu.controller';
import { AdminBusinessService } from './business/admin-business.service';
import { AdminMenuService } from './menu/admin-menu.service';

@Module({
  controllers: [AdminBusinessController, AdminMenuController],
  providers: [PrismaService, AdminBusinessService, AdminMenuService],
})
export class AdminModule {}
