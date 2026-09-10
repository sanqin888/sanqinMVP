import { Module } from '@nestjs/common';
import { CatalogExternalMenuFactsReaderService } from './catalog-external-menu-facts-reader.service';
import { CATALOG_EXTERNAL_MENU_FACTS_READER } from './catalog-external-menu-facts-reader.contract';

@Module({
  providers: [
    CatalogExternalMenuFactsReaderService,
    {
      provide: CATALOG_EXTERNAL_MENU_FACTS_READER,
      useExisting: CatalogExternalMenuFactsReaderService,
    },
  ],
  exports: [CATALOG_EXTERNAL_MENU_FACTS_READER],
})
export class CatalogExternalMenuFactsModule {}
