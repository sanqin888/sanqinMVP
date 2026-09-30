import { Module } from '@nestjs/common';

import { PrismaModule } from '../prisma/prisma.module';
import { CATALOG_MARKETING_SUBJECT_READER } from './catalog-marketing-subject-reader.contract';
import { CatalogMarketingSubjectReaderService } from './catalog-marketing-subject-reader.service';

@Module({
  imports: [PrismaModule],
  providers: [
    CatalogMarketingSubjectReaderService,
    {
      provide: CATALOG_MARKETING_SUBJECT_READER,
      useExisting: CatalogMarketingSubjectReaderService,
    },
  ],
  exports: [CATALOG_MARKETING_SUBJECT_READER],
})
export class CatalogMarketingSubjectModule {}
