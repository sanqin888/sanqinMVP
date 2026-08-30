// apps/api/src/store/store-status.module.ts
import { Module } from '@nestjs/common';
import { BrandStoreConfigModule } from './brand-store-config.module';
import { StoreStatusService } from './store-status.service';
import { StoreStatusController } from './store-status.controller';

@Module({
  imports: [BrandStoreConfigModule],
  providers: [StoreStatusService],
  controllers: [StoreStatusController],
  exports: [StoreStatusService],
})
export class StoreStatusModule {}
