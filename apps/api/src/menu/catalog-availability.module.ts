import { Module } from '@nestjs/common';
import { PrismaModule } from '../prisma/prisma.module';
import { CATALOG_AVAILABILITY_READER } from './catalog-availability-reader.contract';
import { CatalogAvailabilityReaderService } from './catalog-availability-reader.service';

@Module({
  imports: [PrismaModule],
  providers: [
    CatalogAvailabilityReaderService,
    {
      provide: CATALOG_AVAILABILITY_READER,
      useExisting: CatalogAvailabilityReaderService,
    },
  ],
  exports: [CATALOG_AVAILABILITY_READER],
})
export class CatalogAvailabilityModule {}
