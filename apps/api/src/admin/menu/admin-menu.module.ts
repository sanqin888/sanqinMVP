// apps/api/src/admin/menu/admin-menu.module.ts

import { Module } from '@nestjs/common';
import { AdminMenuController } from './admin-menu.controller';
import { AdminMenuAvailabilityOrchestrationService } from './admin-menu-availability-orchestration.service';
import { AuthModule } from '../../auth/auth.module';
import { UberEatsModule } from '../../integrations/ubereats/ubereats.module';
import { PublicMenuModule } from '../../menu/public-api';

@Module({
  imports: [AuthModule, UberEatsModule, PublicMenuModule],
  controllers: [AdminMenuController],
  providers: [AdminMenuAvailabilityOrchestrationService],
})
export class AdminMenuModule {}
