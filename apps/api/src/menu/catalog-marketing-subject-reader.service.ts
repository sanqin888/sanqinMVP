import { Injectable } from '@nestjs/common';

import type {
  CatalogMarketingItemSubjectV1,
  CatalogMarketingSubjectReaderPort,
} from './catalog-marketing-subject-reader.contract';
import { PrismaService } from '../prisma/prisma.service';

@Injectable()
export class CatalogMarketingSubjectReaderService
  implements CatalogMarketingSubjectReaderPort
{
  constructor(private readonly prisma: PrismaService) {}

  async readItemSubjects(query?: {
    storeStableId?: string;
  }): Promise<CatalogMarketingItemSubjectV1[]> {
    const storeStableId = query?.storeStableId?.trim() || undefined;
    const items = await this.prisma.menuItem.findMany({
      where: {
        deletedAt: null,
        category: {
          deletedAt: null,
          ...(storeStableId ? { storeStableId } : {}),
        },
      },
      select: {
        stableId: true,
        nameEn: true,
        nameZh: true,
        category: {
          select: {
            storeStableId: true,
          },
        },
      },
      orderBy: [{ category: { sortOrder: 'asc' } }, { sortOrder: 'asc' }],
    });

    return items.map((item) => ({
      itemStableId: item.stableId,
      storeStableId: item.category.storeStableId,
      nameEn: item.nameEn,
      nameZh: item.nameZh,
    }));
  }
}
