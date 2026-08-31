import { Module } from '@nestjs/common';
import { PrismaModule } from '../prisma/prisma.module';
import {
  PrismaBrandStoreConfigReader,
  PrismaBrandStoreConfigWriter,
} from './brand-store-config.reader';
import {
  BRAND_STORE_CONFIG_READER,
  BRAND_STORE_CONFIG_WRITER,
} from './brand-store-config.contract';
import {
  STORE_SCHEDULE_READER,
  STORE_SCHEDULE_WRITER,
} from './store-schedule.contract';
import { PrismaStoreScheduleAdapter } from './store-schedule.prisma';

@Module({
  imports: [PrismaModule],
  providers: [
    PrismaBrandStoreConfigReader,
    PrismaBrandStoreConfigWriter,
    PrismaStoreScheduleAdapter,
    {
      provide: BRAND_STORE_CONFIG_READER,
      useExisting: PrismaBrandStoreConfigReader,
    },
    {
      provide: BRAND_STORE_CONFIG_WRITER,
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
    STORE_SCHEDULE_READER,
    STORE_SCHEDULE_WRITER,
  ],
})
export class BrandStoreConfigModule {}
