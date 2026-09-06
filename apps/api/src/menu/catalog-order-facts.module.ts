import { Module } from '@nestjs/common';
import { CatalogAdminService } from './catalog-admin.service';
import { CatalogAdminModule } from './catalog-admin.module';
import { CATALOG_ORDER_FACTS_READER } from './catalog-order-facts-reader.contract';

@Module({
  imports: [CatalogAdminModule],
  providers: [
    {
      provide: CATALOG_ORDER_FACTS_READER,
      useExisting: CatalogAdminService,
    },
  ],
  exports: [CATALOG_ORDER_FACTS_READER],
})
export class CatalogOrderFactsModule {}
