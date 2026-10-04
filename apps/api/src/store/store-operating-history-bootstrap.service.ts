import { Injectable, Logger, OnApplicationBootstrap } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { initializeStoreOperatingHistory } from './store-operating-history.persistence';

@Injectable()
export class StoreOperatingHistoryBootstrapService
  implements OnApplicationBootstrap
{
  private readonly logger = new Logger(StoreOperatingHistoryBootstrapService.name);

  constructor(private readonly prisma: PrismaService) {}

  async onApplicationBootstrap(): Promise<void> {
    const stores = await this.prisma.store.findMany({
      select: { id: true, storeStableId: true },
      orderBy: { createdAt: 'asc' },
    });
    for (const store of stores) {
      const trackingStartedAt = new Date();
      const initialized = await this.prisma.$transaction((tx) =>
        initializeStoreOperatingHistory(tx, store.id, trackingStartedAt),
      );
      if (initialized) {
        this.logger.log(
          `Started forward-only Store operating history: storeStableId=${store.storeStableId} trackingStartedAt=${trackingStartedAt.toISOString()}`,
        );
      }
    }
  }
}
