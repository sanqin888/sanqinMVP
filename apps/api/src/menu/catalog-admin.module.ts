import { Module } from '@nestjs/common';
import { CatalogAdminService } from './catalog-admin.service';

@Module({
  providers: [CatalogAdminService],
  exports: [CatalogAdminService],
})
export class CatalogAdminModule {}
