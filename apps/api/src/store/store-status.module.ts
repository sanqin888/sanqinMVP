// apps/api/src/store/store-status.module.ts
import { Module } from '@nestjs/common';
import { PrismaModule } from '../prisma/prisma.module';
import { StoreStatusService } from './store-status.service';
import { StoreStatusController } from './store-status.controller';

@Module({
  imports: [PrismaModule],
  providers: [StoreStatusService],
  controllers: [StoreStatusController],
})
export class StoreStatusModule {}
