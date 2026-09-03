import { Injectable } from '@nestjs/common';
import {
  UberOpsTicketPriority,
  UberOpsTicketStatus,
  UberOpsTicketType,
} from '@prisma/client';
import { PrismaService } from '../../../../prisma/prisma.service';
import type {
  UberMenuAvailabilityCommandPort,
  UberMenuAvailabilityQueryPort,
} from '../../application/menu/uber-menu-availability.ports';

@Injectable()
export class UberMenuAvailabilityPrismaAdapter
  implements UberMenuAvailabilityQueryPort, UberMenuAvailabilityCommandPort
{
  constructor(private readonly prisma: PrismaService) {}

  async isMenuItemPublishable(menuItemStableId: string) {
    const item = await this.prisma.menuItem.findFirst({
      where: {
        stableId: menuItemStableId,
        deletedAt: null,
        visibility: 'PUBLIC',
        publishToUberEats: true,
      },
      select: { stableId: true },
    });
    return item !== null;
  }

  async findMenuItemSuspendUntil(menuItemStableId: string) {
    const item = await this.prisma.menuItem.findFirst({
      where: { stableId: menuItemStableId, deletedAt: null },
      select: { tempUnavailableUntil: true },
    });
    return item?.tempUnavailableUntil ?? null;
  }

  async findOptionSuspendUntil(optionChoiceStableId: string) {
    const option = await this.prisma.menuOptionTemplateChoice.findFirst({
      where: { stableId: optionChoiceStableId, deletedAt: null },
      select: { tempUnavailableUntil: true },
    });
    return option?.tempUnavailableUntil ?? null;
  }

  async findProvisionedStores(storeStableId?: string) {
    const mappings = await this.prisma.uberStoreMapping.findMany({
      where: {
        isProvisioned: true,
        ...(storeStableId
          ? {
              // Legacy transport compatibility: the existing HTTP storeId may
              // still carry an Uber store id.
              OR: [
                { posExternalStoreId: storeStableId },
                { uberStoreId: storeStableId },
              ],
            }
          : {}),
      },
      select: { posExternalStoreId: true, uberStoreId: true },
    });
    return mappings.map((mapping) => ({
      storeStableId: mapping.posExternalStoreId?.trim() || mapping.uberStoreId,
      uberStoreId: mapping.uberStoreId,
    }));
  }

  async createItemPublishFailure(
    input: Parameters<
      UberMenuAvailabilityCommandPort['createItemPublishFailure']
    >[0],
  ) {
    await this.prisma.uberOpsTicket.create({
      data: {
        storeId: input.storeStableId,
        type: UberOpsTicketType.MENU_ITEM_AVAILABILITY,
        status: UberOpsTicketStatus.OPEN,
        priority: UberOpsTicketPriority.HIGH,
        title: `Uber 商品可售状态同步失败：${input.menuItemStableId}`,
        description: '本地状态已保存；请重试 Uber 商品可售状态同步。',
        menuItemStableId: input.menuItemStableId,
        lastError: input.error,
        context: {
          isAvailable: input.isAvailable,
        },
      },
    });
  }
}
