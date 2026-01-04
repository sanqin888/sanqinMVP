// apps/api/src/pos/pos-device.module.ts
import { Module } from '@nestjs/common';
import { PrismaModule } from '../prisma/prisma.module';
import { PosDeviceService } from './pos-device.service';
import { PosDeviceGuard } from './pos-device.guard';
import { PosDevicesController } from './pos-devices.controller';

@Module({
  imports: [PrismaModule],
  controllers: [PosDevicesController], // 把设备认领相关的 Controller 放这里
  providers: [PosDeviceService, PosDeviceGuard],
  exports: [PosDeviceService, PosDeviceGuard], // 导出给 OrdersModule 和 PosModule 使用
})
export class PosDeviceModule {}