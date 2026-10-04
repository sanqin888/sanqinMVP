import { Module } from '@nestjs/common';
import { CatalogAdminService } from './catalog-admin.service';
import { CATALOG_AVAILABILITY_READER } from './catalog-availability-reader.contract';
import { CATALOG_AVAILABILITY_HISTORY_READER } from './catalog-availability-history-reader.contract';
import { CatalogAdminModule } from './catalog-admin.module';

@Module({
  imports: [CatalogAdminModule],
  providers: [
    {
      provide: CATALOG_AVAILABILITY_READER,
      useExisting: CatalogAdminService,
    },
    {
      provide: CATALOG_AVAILABILITY_HISTORY_READER,
      useExisting: CatalogAdminService,
    },
  ],
  exports: [CATALOG_AVAILABILITY_READER, CATALOG_AVAILABILITY_HISTORY_READER],
})
export class CatalogAvailabilityModule {}
