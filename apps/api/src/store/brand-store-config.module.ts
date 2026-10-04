import { Module } from '@nestjs/common';
import { PrismaModule } from '../prisma/prisma.module';
import {
  PrismaBrandStoreConfigReader,
  PrismaBrandStoreConfigWriter,
  PrismaStoreScheduleAdapter,
  StoreOperatingHistoryBootstrapService,
} from './brand-store-config.reader';
import {
  BRAND_STORE_CONFIG_READER,
  BRAND_STORE_CONFIG_WRITER,
  STORE_DIRECTORY_READER,
  STORE_DIRECTORY_WRITER,
  STORE_TIMEZONE_READER,
} from './brand-store-config.contract';
import { StoreDirectoryService } from './store-directory.service';
import {
  STORE_SCHEDULE_READER,
  STORE_SCHEDULE_WRITER,
} from './store-schedule.contract';
import { STORE_OPERATING_HISTORY_READER } from './store-operating-history.contract';

@Module({
  imports: [PrismaModule],
  providers: [
    PrismaBrandStoreConfigReader,
    PrismaBrandStoreConfigWriter,
    PrismaStoreScheduleAdapter,
    StoreDirectoryService,
    StoreOperatingHistoryBootstrapService,
    {
      provide: BRAND_STORE_CONFIG_READER,
      useExisting: PrismaBrandStoreConfigReader,
    },
    {
      provide: BRAND_STORE_CONFIG_WRITER,
      useExisting: PrismaBrandStoreConfigWriter,
    },
    {
      provide: STORE_DIRECTORY_READER,
      useExisting: PrismaBrandStoreConfigReader,
    },
    {
      provide: STORE_OPERATING_HISTORY_READER,
      useExisting: PrismaBrandStoreConfigReader,
    },
    {
      provide: STORE_TIMEZONE_READER,
      useExisting: PrismaBrandStoreConfigReader,
    },
    {
      provide: STORE_DIRECTORY_WRITER,
      useExisting: PrismaBrandStoreConfigWriter,
    },
    {
      provide: STORE_SCHEDULE_READER,
      useExisting: PrismaStoreScheduleAdapter,
    },
    {
      provide: STORE_SCHEDULE_WRITER,
      useExisting: PrismaStoreScheduleAdapter,
    },
  ],
  exports: [
    BRAND_STORE_CONFIG_READER,
    BRAND_STORE_CONFIG_WRITER,
    STORE_DIRECTORY_READER,
    STORE_DIRECTORY_WRITER,
    STORE_OPERATING_HISTORY_READER,
    STORE_TIMEZONE_READER,
    StoreDirectoryService,
    STORE_SCHEDULE_READER,
    STORE_SCHEDULE_WRITER,
  ],
})
export class BrandStoreConfigModule {}
