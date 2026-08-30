// apps/api/src/store/store-status.module.ts
import { Module } from '@nestjs/common';
import { PrismaModule } from '../prisma/prisma.module';
import { BrandStoreConfigModule } from './brand-store-config.module';
import { StoreStatusService } from './store-status.service';
import { StoreStatusController } from './store-status.controller';

@Module({
  imports: [PrismaModule, BrandStoreConfigModule],
  providers: [StoreStatusService],
  controllers: [StoreStatusController],
  exports: [StoreStatusService],
})
export class StoreStatusModule {}
