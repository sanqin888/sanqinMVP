import { Module } from '@nestjs/common';
import { PrismaModule } from '../prisma/prisma.module';
import {
  PrismaBrandStoreConfigReader,
  PrismaBrandStoreConfigWriter,
  PrismaStoreScheduleReader,
} from './brand-store-config.reader';
import {
  BRAND_STORE_CONFIG_READER,
  BRAND_STORE_CONFIG_WRITER,
} from './brand-store-config.contract';

@Module({
  imports: [PrismaModule],
  providers: [
    PrismaBrandStoreConfigReader,
    PrismaBrandStoreConfigWriter,
    PrismaStoreScheduleReader,
    {
      provide: BRAND_STORE_CONFIG_READER,
      useExisting: PrismaBrandStoreConfigReader,
    },
    {
      provide: BRAND_STORE_CONFIG_WRITER,
      useExisting: PrismaBrandStoreConfigWriter,
    },
  ],
  exports: [
    BRAND_STORE_CONFIG_READER,
    BRAND_STORE_CONFIG_WRITER,
    PrismaStoreScheduleReader,
  ],
})
export class BrandStoreConfigModule {}
