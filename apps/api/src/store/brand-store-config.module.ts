import { Module } from '@nestjs/common';
import { PrismaModule } from '../prisma/prisma.module';
import {
  PrismaBrandStoreConfigReader,
  PrismaStoreScheduleReader,
} from './brand-store-config.reader';
import { BRAND_STORE_CONFIG_READER } from './public-api';

@Module({
  imports: [PrismaModule],
  providers: [
    PrismaBrandStoreConfigReader,
    PrismaStoreScheduleReader,
    {
      provide: BRAND_STORE_CONFIG_READER,
      useExisting: PrismaBrandStoreConfigReader,
    },
  ],
  exports: [BRAND_STORE_CONFIG_READER, PrismaStoreScheduleReader],
})
export class BrandStoreConfigModule {}
