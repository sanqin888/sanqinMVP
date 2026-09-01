import { Module } from '@nestjs/common';
import { PrismaModule } from '../prisma/prisma.module';
import {
  PrismaBrandStoreConfigReader,
  PrismaBrandStoreConfigWriter,
  PrismaStoreScheduleAdapter,
} from './brand-store-config.reader';
import {
  BRAND_STORE_CONFIG_READER,
  BRAND_STORE_CONFIG_WRITER,
  STORE_DIRECTORY_READER,
  STORE_DIRECTORY_WRITER,
  STORE_LEGACY_DB_ID_RESOLVER,
} from './brand-store-config.contract';
import { StoreDirectoryService } from './store-directory.service';
import {
  STORE_SCHEDULE_READER,
  STORE_SCHEDULE_WRITER,
} from './store-schedule.contract';

@Module({
  imports: [PrismaModule],
  providers: [
    PrismaBrandStoreConfigReader,
    PrismaBrandStoreConfigWriter,
    PrismaStoreScheduleAdapter,
    StoreDirectoryService,
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
      provide: STORE_DIRECTORY_WRITER,
      useExisting: PrismaBrandStoreConfigWriter,
    },
    {
      provide: STORE_LEGACY_DB_ID_RESOLVER,
      useExisting: PrismaBrandStoreConfigReader,
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
    STORE_LEGACY_DB_ID_RESOLVER,
    StoreDirectoryService,
    STORE_SCHEDULE_READER,
    STORE_SCHEDULE_WRITER,
  ],
})
export class BrandStoreConfigModule {}
