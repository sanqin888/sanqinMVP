// apps/api/src/admin/menu/admin-menu.module.ts

import { Module } from '@nestjs/common';
import { AdminMenuController } from './admin-menu.controller';
import { AdminMenuService } from './admin-menu.service';
import { PrismaService } from '../../prisma/prisma.service';
import { AuthModule } from '../../auth/auth.module';
import { UberEatsCapabilitiesModule } from '../../integrations/ubereats/ubereats-capabilities.module';

@Module({
  imports: [AuthModule, UberEatsCapabilitiesModule],
  controllers: [AdminMenuController],
  providers: [AdminMenuService, PrismaService],
  exports: [AdminMenuService],
})
export class AdminMenuModule {}
