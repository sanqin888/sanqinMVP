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

  async findProvisionedStores(storeId?: string) {
    const mappings = await this.prisma.uberStoreMapping.findMany({
      where: {
        isProvisioned: true,
        ...(storeId
          ? {
              OR: [{ posExternalStoreId: storeId }, { uberStoreId: storeId }],
            }
          : {}),
      },
      select: { posExternalStoreId: true, uberStoreId: true },
    });
    return mappings.map((mapping) => ({
      storeId: mapping.posExternalStoreId?.trim() || mapping.uberStoreId,
      uberStoreId: mapping.uberStoreId,
    }));
  }

  async setItemAvailability(
    storeId: string,
    uberStoreId: string,
    menuItemStableId: string,
    isAvailable: boolean,
  ) {
    const legacyRows = await this.prisma.uberItemChannelConfig.findMany({
      where: {
        menuItemStableId,
        storeId: { in: Array.from(new Set([uberStoreId, 'default'])) },
      },
      select: {
        storeId: true,
        priceCents: true,
        displayName: true,
        displayDescription: true,
      },
    });
    const inherited =
      legacyRows.find((row) => row.storeId === uberStoreId) ??
      legacyRows.find((row) => row.storeId === 'default') ??
      null;

    await this.prisma.uberItemChannelConfig.upsert({
      where: { storeId_menuItemStableId: { storeId, menuItemStableId } },
      create: {
        storeId,
        uberStoreId,
        menuItemStableId,
        priceCents: inherited?.priceCents ?? null,
        displayName: inherited?.displayName ?? null,
        displayDescription: inherited?.displayDescription ?? null,
        isAvailable,
      },
      update: { uberStoreId, isAvailable },
    });
  }

  async setOptionAvailability(
    storeId: string,
    uberStoreId: string,
    optionChoiceStableId: string,
    isAvailable: boolean,
  ) {
    const [legacyRows, sourceOption] = await Promise.all([
      this.prisma.uberOptionItemConfig.findMany({
        where: {
          optionChoiceStableId,
          storeId: { in: Array.from(new Set([uberStoreId, 'default'])) },
        },
        select: {
          storeId: true,
          priceDeltaCents: true,
          displayName: true,
          displayDescription: true,
        },
      }),
      this.prisma.menuOptionTemplateChoice.findUnique({
        where: { stableId: optionChoiceStableId },
        select: { priceDeltaCents: true },
      }),
    ]);
    const inherited =
      legacyRows.find((row) => row.storeId === uberStoreId) ??
      legacyRows.find((row) => row.storeId === 'default') ??
      null;

    await this.prisma.uberOptionItemConfig.upsert({
      where: {
        storeId_optionChoiceStableId: { storeId, optionChoiceStableId },
      },
      create: {
        storeId,
        uberStoreId,
        optionChoiceStableId,
        priceDeltaCents:
          inherited?.priceDeltaCents ?? sourceOption?.priceDeltaCents ?? 0,
        displayName: inherited?.displayName ?? null,
        displayDescription: inherited?.displayDescription ?? null,
        isAvailable,
      },
      update: { uberStoreId, isAvailable },
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
        description: '本地状态已保存；请重试 Uber 商品可售状态同步。',
        menuItemStableId: input.menuItemStableId,
        lastError: input.error,
        context: {
          availability: {
            storeId: input.storeId,
            uberStoreId: input.uberStoreId,
            menuItemStableId: input.menuItemStableId,
            isAvailable: input.isAvailable,
          },
        },
      },
    });
  }
}
