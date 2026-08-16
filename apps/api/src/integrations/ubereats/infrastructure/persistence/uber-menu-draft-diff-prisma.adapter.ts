import { Injectable } from '@nestjs/common';
import { UberMenuPublishStatus } from '@prisma/client';
import { PrismaService } from '../../../../prisma/prisma.service';
import type { UberMenuDraftDiffPort } from '../../application/menu/uber-menu-draft.ports';
import { buildUberMenuDraftDiff } from '../../domain/menu/uber-menu-diff.service';
import { normalizeUberStoreId } from '../../domain/merchant/uber-store-id';
import { UberMenuDraftReadPrismaAdapter } from './uber-menu-draft-read-prisma.adapter';

@Injectable()
export class UberMenuDraftDiffPrismaAdapter implements UberMenuDraftDiffPort {
  constructor(
    private readonly prisma: PrismaService,
    private readonly drafts: UberMenuDraftReadPrismaAdapter,
  ) {}

  async getUberMenuDraftDiff(storeId?: string) {
    const requestedStoreId = normalizeUberStoreId(storeId);
    const mapping = await this.prisma.uberStoreMapping.findFirst({
      where: {
        isProvisioned: true,
        OR: [
          { posExternalStoreId: requestedStoreId },
          { uberStoreId: requestedStoreId },
        ],
      },
      select: { posExternalStoreId: true },
    });
    const canonicalStoreId =
      mapping?.posExternalStoreId?.trim() || requestedStoreId;
    const draft = await this.drafts.getUberMenuDraft(requestedStoreId);
    const lastSuccess = await this.prisma.uberMenuPublishVersion.findFirst({
      where: {
        storeId: canonicalStoreId,
        status: UberMenuPublishStatus.SUCCEEDED,
      },
      orderBy: { createdAt: 'desc' },
      select: { createdAt: true, requestPayload: true, payload: true },
    });
    const [categoryConfigs, itemConfigs, optionConfigs, groupConfigs] =
      await Promise.all([
        this.prisma.uberCategoryConfig.findMany({
          where: { storeId: canonicalStoreId, lastPublishedAt: { not: null } },
          select: { menuCategoryStableId: true },
        }),
        this.prisma.uberItemChannelConfig.findMany({
          where: { storeId: canonicalStoreId, lastPublishedAt: { not: null } },
          select: { menuItemStableId: true },
        }),
        this.prisma.uberOptionItemConfig.findMany({
          where: { storeId: canonicalStoreId, lastPublishedAt: { not: null } },
          select: { optionChoiceStableId: true },
        }),
        this.prisma.uberModifierGroupConfig.findMany({
          where: { storeId: canonicalStoreId, lastPublishedAt: { not: null } },
          select: { templateGroupStableId: true },
        }),
      ]);
    return buildUberMenuDraftDiff({
      storeId: requestedStoreId,
      draft,
      lastPublishedAt: lastSuccess?.createdAt ?? null,
      publishedPayload:
        lastSuccess?.requestPayload ?? lastSuccess?.payload ?? null,
      publishedCategoryIds: categoryConfigs.map(
        (category) => category.menuCategoryStableId,
      ),
      publishedMenuItemIds: itemConfigs.map((item) => item.menuItemStableId),
      publishedOptionItemIds: optionConfigs.map(
        (item) => item.optionChoiceStableId,
      ),
      publishedGroupIds: groupConfigs.map(
        (group) => group.templateGroupStableId,
      ),
    });
  }
}
