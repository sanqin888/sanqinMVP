// apps/api/src/store/store-status.module.ts
import { Module } from '@nestjs/common';
import { BrandStoreConfigModule } from './brand-store-config.module';
import { STORE_STATUS_READER } from './store-status.contract';
import { StoreStatusService } from './store-status.service';
import { StoreStatusController } from './store-status.controller';

@Module({
  imports: [BrandStoreConfigModule],
  providers: [
    StoreStatusService,
    {
      provide: STORE_STATUS_READER,
      useExisting: StoreStatusService,
    },
  ],
  controllers: [StoreStatusController],
  exports: [STORE_STATUS_READER],
})
export class StoreStatusModule {}
