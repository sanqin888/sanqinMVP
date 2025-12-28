// apps/api/src/pos/pos.module.ts
import { Module, forwardRef } from '@nestjs/common';
import { PosSummaryController } from './pos-summary.controller';
import { OrdersModule } from '../orders/orders.module';
import { PosOrdersController } from './pos-orders.controller';
import { PosSummaryService } from './pos-summary.service';
import { PosDevicesController } from './pos-devices.controller';
import { PosDeviceService } from './pos-device.service';
import { PosDeviceGuard } from './pos-device.guard';
import { AuthModule } from '../auth/auth.module';
import { RolesGuard } from '../auth/roles.guard';

@Module({
  imports: [AuthModule, forwardRef(() => OrdersModule)],
  controllers: [
    PosSummaryController,
    PosDevicesController,
    PosOrdersController,
  ],
  providers: [PosSummaryService, PosDeviceService, PosDeviceGuard, RolesGuard],
  exports: [PosDeviceService, PosDeviceGuard],
})
export class PosModule {}
