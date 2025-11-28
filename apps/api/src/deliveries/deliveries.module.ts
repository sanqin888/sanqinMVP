// apps/api/src/deliveries/deliveries.module.ts
import { Module } from '@nestjs/common';
import { HttpModule } from '@nestjs/axios';
import { UberDirectService } from './uber-direct.service';
import { DoorDashDriveService } from './doordash-drive.service';

@Module({
  imports: [HttpModule],
  providers: [UberDirectService, DoorDashDriveService],
  exports: [UberDirectService, DoorDashDriveService],
})
export class DeliveriesModule {}
