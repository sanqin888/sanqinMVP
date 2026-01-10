//apps/api/src/admin/pos-devices/admin-pos-devices.module.ts
import { Module } from '@nestjs/common';
import { AdminPosDevicesController } from './admin-pos-devices.controller';
import { AdminPosDevicesService } from './admin-pos-devices.service';
import { PrismaService } from '../../prisma/prisma.service';

@Module({
  controllers: [AdminPosDevicesController],
  providers: [AdminPosDevicesService, PrismaService],
})
export class AdminPosDevicesModule {}
