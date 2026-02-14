// apps/api/src/pos/pos.module.ts
import { Module } from '@nestjs/common';
import { PosSummaryController } from './pos-summary.controller';
import { PosOrdersController } from './pos-orders.controller';
import { PosSummaryService } from './pos-summary.service';
import { AuthModule } from '../auth/auth.module';
import { RolesGuard } from '../auth/roles.guard';
import { PosDeviceModule } from './pos-device.module'; // 引入新模块
import { OrdersModule } from '../orders/orders.module';
import { PrismaModule } from '../prisma/prisma.module';
import { PosStoreStatusController } from './pos-store-status.controller';
import { PosStoreStatusService } from './pos-store-status.service';

@Module({
  imports: [
    AuthModule,
    PosDeviceModule, // 引入基础设备模块
    OrdersModule,
    PrismaModule,
  ],
  controllers: [
    PosSummaryController,
    // PosDevicesController 已经移走
    PosOrdersController,
    PosStoreStatusController,
  ],
  providers: [
    PosSummaryService,
    PosStoreStatusService,
    // PosDeviceService, PosDeviceGuard 已经移走
    RolesGuard,
  ],
})
export class PosModule {}
