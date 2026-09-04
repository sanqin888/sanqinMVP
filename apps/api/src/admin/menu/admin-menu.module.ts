// apps/api/src/admin/menu/admin-menu.module.ts

import { Module } from '@nestjs/common';
import { AdminMenuController } from './admin-menu.controller';
import {
  CatalogOffersMenuOrchestrationModule,
  CatalogUberAvailabilityOrchestrationModule,
} from '../../application/menu/public-api';
import { AuthModule } from '../../auth/auth.module';
import { CatalogAdminModule } from '../../menu/public-api';

@Module({
  imports: [
    AuthModule,
    CatalogOffersMenuOrchestrationModule,
    CatalogUberAvailabilityOrchestrationModule,
    CatalogAdminModule,
  ],
  controllers: [AdminMenuController],
})
export class AdminMenuModule {}
