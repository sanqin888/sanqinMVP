import { Module } from '@nestjs/common';
import {
  PosLoyaltyPolicyController,
  PosStoreContextController,
  PosSummaryController,
} from './pos-summary.controller';
import { PosOrdersController } from './pos-orders.controller';
import { PosSummaryService } from './pos-summary.service';
import { AuthModule } from '../auth/auth.module';
import { RolesGuard } from '../auth/roles.guard';
import { PosDeviceModule } from './pos-device.module';
import { OrdersModule } from '../orders/public-api';
import { PrismaModule } from '../prisma/prisma.module';
import { PosStoreStatusController } from './pos-store-status.controller';
import { PosStoreStatusService } from './pos-store-status.service';
import { UberEatsModule } from '../integrations/ubereats/ubereats.module';
import { PosOrdersService } from './pos-orders.service';
import { PosConnectivityWatchdogService } from './pos-connectivity-watchdog.service';
import { StoreStatusModule } from '../store/store-status.module';
import { PosExchangeRateModule } from './pos-exchange-rate.module';
import { PosExchangeRateController } from './pos-exchange-rate.controller';
import { LoyaltyModule } from '../loyalty/public-api';
import { BrandStoreConfigModule } from '../store/public-api';
import { PosPrintDispatchListener } from './pos-print-dispatch.listener';

@Module({
  imports: [
    AuthModule,
    PosDeviceModule,
    OrdersModule,
    PrismaModule,
    UberEatsModule,
    StoreStatusModule,
    PosExchangeRateModule,
    LoyaltyModule,
    BrandStoreConfigModule,
  ],
  controllers: [
    PosSummaryController,
    PosOrdersController,
    PosStoreContextController,
    PosStoreStatusController,
    PosExchangeRateController,
    PosLoyaltyPolicyController,
  ],
  providers: [
    PosSummaryService,
    PosStoreStatusService,
    PosOrdersService,
    PosPrintDispatchListener,
    PosConnectivityWatchdogService,
    RolesGuard,
  ],
  exports: [PosOrdersService],
})
export class PosModule {}
