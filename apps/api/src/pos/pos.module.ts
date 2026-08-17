import { Module } from '@nestjs/common';
import { PosSummaryController } from './pos-summary.controller';
import { PosOrdersController } from './pos-orders.controller';
import { PosSummaryService } from './pos-summary.service';
import { AuthModule } from '../auth/auth.module';
import { RolesGuard } from '../auth/roles.guard';
import { PosDeviceModule } from './pos-device.module';
import { OrdersModule } from '../orders/orders.module';
import { PrismaModule } from '../prisma/prisma.module';
import { PosStoreStatusController } from './pos-store-status.controller';
import { PosStoreStatusService } from './pos-store-status.service';
import { UberEatsModule } from '../integrations/ubereats/ubereats.module';
import { PosOrdersService } from './pos-orders.service';
import { PosConnectivityWatchdogService } from './pos-connectivity-watchdog.service';

@Module({
  imports: [
    AuthModule,
    PosDeviceModule,
    OrdersModule,
    PrismaModule,
    UberEatsModule,
  ],
  controllers: [
    PosSummaryController,
    PosOrdersController,
    PosStoreStatusController,
  ],
  providers: [
    PosSummaryService,
    PosStoreStatusService,
    PosOrdersService,
    PosConnectivityWatchdogService,
    RolesGuard,
  ],
})
export class PosModule {}
