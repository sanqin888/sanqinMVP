import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../../../prisma/prisma.service';
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
  constructor(private readonly prisma: PrismaService) {}

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

  async resolveProvisionedStore(storeId: string) {
    return await this.prisma.uberStoreMapping.findFirst({
      where: { uberStoreId: storeId, isProvisioned: true },
      select: { uberStoreId: true },
    });
  }

  async readBusinessSchedule() {
    const [config, hours] = await Promise.all([
      this.prisma.businessConfig.findUnique({
        where: { id: 1 },
        select: { timezone: true, salesTaxRate: true },
      }),
      this.prisma.businessHour.findMany({ orderBy: { weekday: 'asc' } }),
    ]);
    return config ? { ...config, hours } : null;
  }
}
