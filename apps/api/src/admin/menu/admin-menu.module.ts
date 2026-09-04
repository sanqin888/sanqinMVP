// apps/api/src/admin/menu/admin-menu.module.ts

import { Module } from '@nestjs/common';
import { AdminMenuController } from './admin-menu.controller';
import { CatalogUberAvailabilityOrchestrationModule } from '../../application/menu/public-api';
import { AuthModule } from '../../auth/auth.module';
import { PublicMenuModule } from '../../menu/public-api';

@Module({
  imports: [
    AuthModule,
    CatalogUberAvailabilityOrchestrationModule,
    PublicMenuModule,
  ],
  controllers: [AdminMenuController],
})
export class AdminMenuModule {}
