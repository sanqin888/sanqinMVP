import { Injectable } from '@nestjs/common';
import { UberMenuPublishStatus } from '@prisma/client';
import { PrismaService } from '../../../../prisma/prisma.service';
import type { UberMenuDraftDiffPort } from '../../application/ports/uber-menu-draft.ports';
import { buildUberMenuDraftDiff } from '../../domain/menu/uber-menu-diff.service';
import { normalizeUberStoreId } from '../../domain/shared/uber-integration.utils';
import { UberMenuDraftReadPrismaAdapter } from './uber-menu-draft-read-prisma.adapter';

@Injectable()
export class UberMenuDraftDiffPrismaAdapter implements UberMenuDraftDiffPort {
  constructor(
    private readonly prisma: PrismaService,
    private readonly drafts: UberMenuDraftReadPrismaAdapter,
  ) {}

  async getUberMenuDraftDiff(storeId?: string) {
    const normalizedStoreId = normalizeUberStoreId(storeId);
    const draft = await this.drafts.getUberMenuDraft(normalizedStoreId);
    const lastSuccess = await this.prisma.uberMenuPublishVersion.findFirst({
      where: {
        storeId: normalizedStoreId,
        status: UberMenuPublishStatus.SUCCEEDED,
      },
      orderBy: { createdAt: 'desc' },
      select: { createdAt: true, requestPayload: true, payload: true },
    });
    const [itemConfigs, optionConfigs] = await Promise.all([
      this.prisma.uberItemChannelConfig.findMany({
        where: { storeId: normalizedStoreId, lastPublishedAt: { not: null } },
        select: { menuItemStableId: true },
      }),
      this.prisma.uberOptionItemConfig.findMany({
        where: { storeId: normalizedStoreId, lastPublishedAt: { not: null } },
        select: { optionChoiceStableId: true },
      }),
    ]);
    return buildUberMenuDraftDiff({
      storeId: normalizedStoreId,
      draft,
      lastPublishedAt: lastSuccess?.createdAt ?? null,
      publishedPayload:
        lastSuccess?.requestPayload ?? lastSuccess?.payload ?? null,
      publishedMenuItemIds: itemConfigs.map((item) => item.menuItemStableId),
      publishedOptionItemIds: optionConfigs.map(
        (item) => item.optionChoiceStableId,
      ),
    });
  }
}
