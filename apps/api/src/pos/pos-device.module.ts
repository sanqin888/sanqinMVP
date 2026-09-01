// apps/api/src/pos/pos-device.module.ts
import { Module } from '@nestjs/common';
import { PrismaModule } from '../prisma/prisma.module';
import { PosDeviceService } from './pos-device.service';
import { PosDeviceGuard } from './pos-device.guard';
import { PosDevicesController } from './pos-devices.controller';
import { PosCardPaymentFeatureConfig } from './pos-card-payment-feature.config';
import { PosGateway } from './pos.gateway';
import { POS_DEVICE_CREDENTIAL_VERIFIER } from './pos-device-auth.contract';
import {
  POS_DEVICE_ADMIN_COMPATIBILITY,
  POS_DEVICE_MANAGEMENT,
} from './pos-device-management.contract';
import { BrandStoreConfigModule } from '../store/public-api';

@Module({
  imports: [PrismaModule, BrandStoreConfigModule],
  controllers: [PosDevicesController], // 把设备认领相关的 Controller 放这里
  providers: [
    PosDeviceService,
    {
      provide: POS_DEVICE_CREDENTIAL_VERIFIER,
      useExisting: PosDeviceService,
    },
    {
      provide: POS_DEVICE_MANAGEMENT,
      useExisting: PosDeviceService,
    },
    {
      provide: POS_DEVICE_ADMIN_COMPATIBILITY,
      useExisting: PosDeviceService,
    },
    PosDeviceGuard,
    PosGateway,
    PosCardPaymentFeatureConfig,
  ],
  exports: [
    POS_DEVICE_CREDENTIAL_VERIFIER,
    POS_DEVICE_MANAGEMENT,
    POS_DEVICE_ADMIN_COMPATIBILITY,
    PosDeviceService,
    PosDeviceGuard,
    PosGateway,
    PosCardPaymentFeatureConfig,
  ], // 导出给 OrdersModule、PosModule 和支付 orchestration 使用
})
export class PosDeviceModule {}
