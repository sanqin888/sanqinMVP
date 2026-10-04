import { Module } from '@nestjs/common';
import { CatalogAdminModule } from './catalog-admin.module';
import { CatalogAdminService } from './catalog-admin.service';
import { CATALOG_REPORTING_ITEM_CLASSIFICATION_READER } from './catalog-reporting-item-classification-reader.contract';

@Module({
  imports: [CatalogAdminModule],
  providers: [
    {
      provide: CATALOG_REPORTING_ITEM_CLASSIFICATION_READER,
      useExisting: CatalogAdminService,
    },
  ],
  exports: [CATALOG_REPORTING_ITEM_CLASSIFICATION_READER],
})
export class CatalogReportingItemClassificationModule {}
