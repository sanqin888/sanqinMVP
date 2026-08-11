import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../../../prisma/prisma.service';
import type {
  UberMenuDraftCommandPort,
  UberMenuDraftQueryPort,
  UberMenuItemDraft,
  UberMenuOptionDraft,
  UpdateUberMenuGroupDraft,
  UpdateUberMenuItemDraft,
  UpdateUberMenuOptionDraft,
} from '../../application/ports/uber-menu-draft.ports';

/** The only persistence boundary used by menu draft application services. */
@Injectable()
export class UberMenuRepository
  implements UberMenuDraftQueryPort, UberMenuDraftCommandPort
{
  constructor(private readonly prisma: PrismaService) {}
  async listItemConfigs(storeId: string): Promise<UberMenuItemDraft[]> {
    const rows = await this.prisma.uberItemChannelConfig.findMany({
      where: { storeId },
      orderBy: { updatedAt: 'desc' },
      take: 500,
      select: {
        storeId: true,
        menuItemStableId: true,
        priceCents: true,
        isAvailable: true,
        displayName: true,
        displayDescription: true,
      },
    });
    return rows.map((row) => ({
      storeId: row.storeId,
      stableId: row.menuItemStableId,
      priceCents: row.priceCents,
      isAvailable: row.isAvailable,
      displayName: row.displayName,
      displayDescription: row.displayDescription,
    }));
  }
  async listOptionConfigs(storeId: string): Promise<UberMenuOptionDraft[]> {
    const rows = await this.prisma.uberOptionItemConfig.findMany({
      where: { storeId },
      orderBy: { updatedAt: 'desc' },
      take: 1000,
      select: {
        storeId: true,
        optionChoiceStableId: true,
        priceDeltaCents: true,
        isAvailable: true,
        displayName: true,
        displayDescription: true,
      },
    });
    return rows.map((row) => ({
      storeId: row.storeId,
      stableId: row.optionChoiceStableId,
      priceDeltaCents: row.priceDeltaCents,
      isAvailable: row.isAvailable,
      displayName: row.displayName,
      displayDescription: row.displayDescription,
    }));
  }
  async updateItem(
    storeId: string,
    stableId: string,
    changes: UpdateUberMenuItemDraft,
  ): Promise<void> {
    await this.prisma.uberItemChannelConfig.update({
      where: {
        storeId_menuItemStableId: { storeId, menuItemStableId: stableId },
      },
      data: {
        priceCents: changes.priceCents,
        isAvailable: changes.isAvailable,
        displayName: changes.displayName,
        displayDescription: changes.displayDescription,
      },
    });
  }
  async updateGroup(
    storeId: string,
    stableId: string,
    changes: UpdateUberMenuGroupDraft,
  ): Promise<void> {
    await this.prisma.uberModifierGroupConfig.upsert({
      where: {
        storeId_templateGroupStableId: {
          storeId,
          templateGroupStableId: stableId,
        },
      },
      create: { storeId, templateGroupStableId: stableId, ...changes },
      update: changes,
    });
  }
  async updateOption(
    storeId: string,
    stableId: string,
    changes: UpdateUberMenuOptionDraft,
  ): Promise<void> {
    await this.prisma.uberOptionItemConfig.update({
      where: {
        storeId_optionChoiceStableId: {
          storeId,
          optionChoiceStableId: stableId,
        },
      },
      data: {
        priceDeltaCents: changes.priceDeltaCents,
        isAvailable: changes.isAvailable,
        displayName: changes.displayName,
        displayDescription: changes.displayDescription,
      },
    });
  }
}
