// apps/api/src/pos/pos.module.ts
import { Module } from '@nestjs/common';
import { PosSummaryController } from './pos-summary.controller';
import { PosOrdersController } from './pos-orders.controller';
import { PosSummaryService } from './pos-summary.service';
import { AuthModule } from '../auth/auth.module';
import { RolesGuard } from '../auth/roles.guard';
import { PosDeviceModule } from './pos-device.module'; // 引入新模块

@Module({
  imports: [
    AuthModule,
    PosDeviceModule, // 引入基础设备模块
  ],
  controllers: [
    PosSummaryController,
    // PosDevicesController 已经移走
    PosOrdersController,
  ],
  providers: [
    PosSummaryService,
    // PosDeviceService, PosDeviceGuard 已经移走
    RolesGuard,
  ],
})
export class PosModule {}
