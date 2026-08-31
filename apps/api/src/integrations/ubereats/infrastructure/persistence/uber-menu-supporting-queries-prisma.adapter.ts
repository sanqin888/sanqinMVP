import { Inject, Injectable } from '@nestjs/common';
import { PrismaService } from '../../../../prisma/prisma.service';
import {
  UBER_STORE_CONFIG_QUERY,
  type UberStoreConfigQueryPort,
} from '../../application/shared/uber-store-config.port';
import type {
  MenuItemExistenceQueryPort,
  OptionChoiceExistenceQueryPort,
  ProvisionedUberStoreQueryPort,
  UberBusinessScheduleQueryPort,
} from '../../application/menu/uber-menu-draft.ports';

@Injectable()
export class UberMenuSupportingQueriesPrismaAdapter
  implements
    MenuItemExistenceQueryPort,
    OptionChoiceExistenceQueryPort,
    ProvisionedUberStoreQueryPort,
    UberBusinessScheduleQueryPort
{
  constructor(
    private readonly prisma: PrismaService,
    @Inject(UBER_STORE_CONFIG_QUERY)
    private readonly storeConfig: UberStoreConfigQueryPort,
  ) {}

  async menuItemExists(stableId: string): Promise<boolean> {
    const item = await this.prisma.menuItem.findUnique({
      where: { stableId },
      select: { stableId: true },
    });
    return item !== null;
  }

  async optionChoiceExists(stableId: string): Promise<boolean> {
    const choice = await this.prisma.menuOptionTemplateChoice.findUnique({
      where: { stableId },
      select: { stableId: true },
    });
    return choice !== null;
  }

  async resolveProvisionedUberStoreId(storeId: string) {
    const normalizedStoreId = storeId.trim();
    if (!normalizedStoreId) return null;
    const mapping = await this.prisma.uberStoreMapping.findFirst({
      where: {
        isProvisioned: true,
        OR: [
          { posExternalStoreId: normalizedStoreId },
          { uberStoreId: normalizedStoreId },
        ],
      },
      select: { uberStoreId: true, posExternalStoreId: true },
    });
    const posExternalStoreId = mapping?.posExternalStoreId?.trim();
    return mapping && posExternalStoreId
      ? { uberStoreId: mapping.uberStoreId, posExternalStoreId }
      : null;
  }

  async readBusinessSchedule() {
    const [config, hours] = await Promise.all([
      this.storeConfig.getStoreConfig(),
      this.prisma.businessHour.findMany({ orderBy: { weekday: 'asc' } }),
    ]);
    return { timezone: config.timezone, salesTaxRate: config.salesTaxRate, hours };
  }
}
