import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../../../prisma/prisma.service';
import type { UberMenuReferenceQueryPort } from '../../application/ports/uber-menu-draft.ports';

@Injectable()
export class UberMenuReferenceQueryPrismaAdapter implements UberMenuReferenceQueryPort {
  constructor(private readonly prisma: PrismaService) {}

  async findMenuItemByStableId(stableId: string) {
    return await this.prisma.menuItem.findUnique({
      where: { stableId },
      select: { stableId: true },
    });
  }

  async findOptionChoiceByStableId(stableId: string) {
    return await this.prisma.menuOptionTemplateChoice.findUnique({
      where: { stableId },
      select: { stableId: true },
    });
  }

  async findProvisionedStoreMapping(storeId: string) {
    return await this.prisma.uberStoreMapping.findFirst({
      where: { uberStoreId: storeId, isProvisioned: true },
      select: { uberStoreId: true, rawPayload: true },
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
