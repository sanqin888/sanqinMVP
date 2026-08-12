import { Injectable } from '@nestjs/common';
import { UberMenuPublishStatus } from '@prisma/client';
import { PrismaService } from '../../../../prisma/prisma.service';
import type { UberMenuConfigQueryPort } from '../../application/menu/uber-menu-draft.ports';
import { normalizeUberStoreId } from '../../domain/shared/uber-integration.utils';

@Injectable()
export class UberMenuConfigQueryPrismaAdapter implements UberMenuConfigQueryPort {
  constructor(private readonly prisma: PrismaService) {}

  async listUberItemChannelConfigs(storeId?: string) {
    const normalizedStoreId = normalizeUberStoreId(storeId);
    const items = await this.prisma.uberItemChannelConfig.findMany({
      where: { storeId: normalizedStoreId },
      orderBy: { updatedAt: 'desc' },
      take: 500,
      select: {
        menuItemStableId: true,
        priceCents: true,
        isAvailable: true,
        displayName: true,
        displayDescription: true,
        externalItemId: true,
        externalCategoryId: true,
        lastPublishedAt: true,
        lastPublishError: true,
        updatedAt: true,
      },
    });

    return {
      storeId: normalizedStoreId,
      count: items.length,
      items,
    };
  }

  async listUberPublishedMenuItems(storeId?: string) {
    const normalizedStoreId = normalizeUberStoreId(storeId);
    const items = await this.prisma.uberPublishedMenuItem.findMany({
      where: {
        storeId: normalizedStoreId,
        publishVersion: {
          status: {
            in: [
              UberMenuPublishStatus.SUBMITTED,
              UberMenuPublishStatus.SUCCEEDED,
            ],
          },
        },
      },
      orderBy: { publishedAt: 'desc' },
      take: 1000,
      select: {
        publishVersionId: true,
        uberStoreId: true,
        uberItemId: true,
        menuItemStableId: true,
        publishedPriceCents: true,
        publishedIsAvailable: true,
        publishedName: true,
        publishedAt: true,
        publishVersion: { select: { versionStableId: true, status: true } },
      },
    });

    return { storeId: normalizedStoreId, count: items.length, items };
  }

  async listUberOptionItemConfigs(storeId?: string) {
    const normalizedStoreId = normalizeUberStoreId(storeId);
    const items = await this.prisma.uberOptionItemConfig.findMany({
      where: { storeId: normalizedStoreId },
      orderBy: { updatedAt: 'desc' },
      take: 1000,
      select: {
        optionChoiceStableId: true,
        priceDeltaCents: true,
        isAvailable: true,
        displayName: true,
        displayDescription: true,
        externalItemId: true,
        lastPublishedAt: true,
        lastPublishError: true,
        updatedAt: true,
      },
    });

    return {
      storeId: normalizedStoreId,
      count: items.length,
      items,
    };
  }
}
