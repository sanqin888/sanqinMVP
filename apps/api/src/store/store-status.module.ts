// apps/api/src/store/store-status.module.ts

import { Module } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { StoreStatusService } from './store-status.service';
import { StoreStatusController } from './store-status.controller';

@Module({
  providers: [PrismaService, StoreStatusService],
  controllers: [StoreStatusController],
})
export class StoreStatusModule {}
