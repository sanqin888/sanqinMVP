import { Module } from '@nestjs/common';
import { PosSummaryController } from './pos-summary.controller';
import { PosSummaryService } from './pos-summary.service';
import { PosDevicesController } from './pos-devices.controller';
import { PosDeviceService } from './pos-device.service';
import { PosDeviceGuard } from './pos-device.guard';
import { AuthModule } from '../auth/auth.module';
import { RolesGuard } from '../auth/roles.guard';

@Module({
  imports: [AuthModule],
  controllers: [PosSummaryController, PosDevicesController],
  providers: [PosSummaryService, PosDeviceService, PosDeviceGuard, RolesGuard],
})
export class PosModule {}
