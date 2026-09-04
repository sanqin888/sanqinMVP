import { Module } from '@nestjs/common';
import { CatalogAdminService } from './catalog-admin.service';
import { CATALOG_AVAILABILITY_READER } from './catalog-availability-reader.contract';
import { PublicMenuModule } from './public-menu.module';

@Module({
  imports: [PublicMenuModule],
  providers: [
    {
      provide: CATALOG_AVAILABILITY_READER,
      useExisting: CatalogAdminService,
    },
  ],
  exports: [CATALOG_AVAILABILITY_READER],
})
export class CatalogAvailabilityModule {}
