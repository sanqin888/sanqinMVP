import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../../../prisma/prisma.service';

/** The only persistence boundary used by menu draft application services. */
@Injectable()
export class UberMenuRepository {
  constructor(private readonly prisma: PrismaService) {}
  listItemConfigs(storeId: string) {
    return this.prisma.uberItemChannelConfig.findMany({
      where: { storeId },
      orderBy: { updatedAt: 'desc' },
      take: 500,
    });
  }
  listOptionConfigs(storeId: string) {
    return this.prisma.uberOptionItemConfig.findMany({
      where: { storeId },
      orderBy: { updatedAt: 'desc' },
      take: 1000,
    });
  }
  updateItem(storeId: string, stableId: string, data: Record<string, unknown>) {
    return this.prisma.uberItemChannelConfig.update({
      where: {
        storeId_menuItemStableId: { storeId, menuItemStableId: stableId },
      },
      data,
    });
  }
  updateGroup(
    storeId: string,
    stableId: string,
    data: Record<string, unknown>,
  ) {
    return this.prisma.uberModifierGroupConfig.upsert({
      where: {
        storeId_templateGroupStableId: {
          storeId,
          templateGroupStableId: stableId,
        },
      },
      create: { storeId, templateGroupStableId: stableId, ...data },
      update: data,
    } as never);
  }
  updateOption(
    storeId: string,
    stableId: string,
    data: Record<string, unknown>,
  ) {
    return this.prisma.uberOptionItemConfig.update({
      where: {
        storeId_optionChoiceStableId: {
          storeId,
          optionChoiceStableId: stableId,
        },
      },
      data,
    });
  }
}
