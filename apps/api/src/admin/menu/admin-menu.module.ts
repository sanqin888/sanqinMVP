// apps/api/src/admin/menu/admin-menu.module.ts

import { Module } from '@nestjs/common';
import { AdminMenuController } from './admin-menu.controller';
import { AdminMenuService } from './admin-menu.service';
import { PrismaService } from '../../prisma/prisma.service';
import { AuthModule } from '../../auth/auth.module';
import { PosModule } from '../../pos/pos.module';
// 1. 引入新模块
import { PosDeviceModule } from '../../pos/pos-device.module';

@Module({
  imports: [
    AuthModule, 
    PosModule,
    // 2. 添加到 imports
    PosDeviceModule 
  ],
  controllers: [AdminMenuController],
  providers: [AdminMenuService, PrismaService],
  exports: [AdminMenuService],
})
export class AdminMenuModule {}