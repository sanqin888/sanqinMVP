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
} from '../../application/ports/uber-menu-availability.ports';

@Injectable()
export class UberMenuAvailabilityPrismaAdapter
  implements UberMenuAvailabilityQueryPort, UberMenuAvailabilityCommandPort
{
  constructor(private readonly prisma: PrismaService) {}
  findItemConfigs(menuItemStableId: string, storeId?: string) {
    return this.prisma.uberItemChannelConfig.findMany({
      where: { menuItemStableId, ...(storeId ? { storeId } : {}) },
      select: { storeId: true, uberStoreId: true, externalItemId: true },
    });
  }
  findProvisionedStores(storeId?: string) {
    return this.prisma.uberStoreMapping.findMany({
      where: {
        isProvisioned: true,
        ...(storeId ? { uberStoreId: storeId } : {}),
      },
      select: { uberStoreId: true },
    });
  }
  async setItemAvailability(
    storeId: string,
    menuItemStableId: string,
    isAvailable: boolean,
  ) {
    await this.prisma.uberItemChannelConfig.update({
      where: { storeId_menuItemStableId: { storeId, menuItemStableId } },
      data: { isAvailable },
    });
  }
  async setOptionAvailability(
    storeId: string,
    optionChoiceStableId: string,
    isAvailable: boolean,
  ) {
    await this.prisma.uberOptionItemConfig.upsert({
      where: {
        storeId_optionChoiceStableId: { storeId, optionChoiceStableId },
      },
      create: {
        storeId,
        uberStoreId: storeId,
        optionChoiceStableId,
        isAvailable,
      },
      update: { uberStoreId: storeId, isAvailable },
    });
  }
  async createItemPublishFailure(
    input: Parameters<
      UberMenuAvailabilityCommandPort['createItemPublishFailure']
    >[0],
  ) {
    await this.prisma.uberOpsTicket.create({
      data: {
        storeId: input.storeId,
        type: UberOpsTicketType.MENU_PUBLISH,
        status: UberOpsTicketStatus.OPEN,
        priority: UberOpsTicketPriority.HIGH,
        title: `Uber 商品可售状态同步失败：${input.menuItemStableId}`,
        description: '本地状态已保存；请重试整份菜单发布。',
        menuItemStableId: input.menuItemStableId,
        lastError: input.error,
        context: {
          publish: {
            storeId: input.storeId,
            dryRun: false,
            taxRateConfirmed: true,
            timezoneConfirmed: true,
          },
          uberStoreId: input.uberStoreId,
          externalItemId: input.externalItemId,
          isAvailable: input.isAvailable,
        },
      },
    });
  }
}
