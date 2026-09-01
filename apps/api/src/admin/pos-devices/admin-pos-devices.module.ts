//apps/api/src/admin/pos-devices/admin-pos-devices.module.ts
import { Module } from '@nestjs/common';
import { AdminPosDevicesController } from './admin-pos-devices.controller';
import { PosDeviceModule } from '../../pos/public-api';

@Module({
  imports: [PosDeviceModule],
  controllers: [AdminPosDevicesController],
})
export class AdminPosDevicesModule {}
