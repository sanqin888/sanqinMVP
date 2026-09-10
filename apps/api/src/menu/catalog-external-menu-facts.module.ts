import { Module } from '@nestjs/common';
import { CatalogAdminModule } from './catalog-admin.module';
import { CatalogAdminService } from './catalog-admin.service';
import { CATALOG_EXTERNAL_MENU_FACTS_READER } from './catalog-external-menu-facts-reader.contract';

@Module({
  imports: [CatalogAdminModule],
  providers: [
    {
      provide: CATALOG_EXTERNAL_MENU_FACTS_READER,
      useExisting: CatalogAdminService,
    },
  ],
  exports: [CATALOG_EXTERNAL_MENU_FACTS_READER],
})
export class CatalogExternalMenuFactsModule {}
