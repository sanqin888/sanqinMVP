import { Module } from '@nestjs/common';
import { CatalogAdminService } from './catalog-admin.service';
import { CATALOG_MARKETING_SUBJECT_READER } from './catalog-marketing-subject-reader.contract';

@Module({
  providers: [
    CatalogAdminService,
    {
      provide: CATALOG_MARKETING_SUBJECT_READER,
      useExisting: CatalogAdminService,
    },
  ],
  exports: [CatalogAdminService, CATALOG_MARKETING_SUBJECT_READER],
})
export class CatalogAdminModule {}
