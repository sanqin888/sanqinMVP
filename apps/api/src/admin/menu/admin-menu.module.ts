// apps/api/src/admin/menu/admin-menu.module.ts

import { Module } from '@nestjs/common';
import { AdminMenuController } from './admin-menu.controller';
import { AdminMenuService } from './admin-menu.service';
import { PrismaService } from '../../prisma/prisma.service';
import { AuthModule } from '../../auth/auth.module';
import { PosModule } from '../../pos/pos.module';

@Module({
  imports: [AuthModule, PosModule],
  controllers: [AdminMenuController],
  providers: [AdminMenuService, PrismaService],
  exports: [AdminMenuService],
})
export class AdminMenuModule {}
