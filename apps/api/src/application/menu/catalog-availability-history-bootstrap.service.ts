import {
  Inject,
  Injectable,
  Logger,
  OnApplicationBootstrap,
} from '@nestjs/common';
import { CatalogAdminService } from '../../menu/public-api';
import {
  CATALOG_HISTORY_STORE_DIRECTORY,
  type CatalogHistoryStoreDirectoryPort,
} from './catalog-store-context.port';

@Injectable()
export class CatalogAvailabilityHistoryBootstrapService implements OnApplicationBootstrap {
  private readonly logger = new Logger(
    CatalogAvailabilityHistoryBootstrapService.name,
  );

  constructor(
    private readonly catalog: CatalogAdminService,
    @Inject(CATALOG_HISTORY_STORE_DIRECTORY)
    private readonly stores: CatalogHistoryStoreDirectoryPort,
  ) {}

  async onApplicationBootstrap(): Promise<void> {
    const storeStableIds = await this.stores.listStoreStableIds();
    for (const storeStableId of storeStableIds) {
      const trackingStartedAt = new Date();
      const initialized =
        await this.catalog.initializeAvailabilityHistoryForStore(
          storeStableId,
          trackingStartedAt,
        );
      if (initialized) {
        this.logger.log(
          `Started forward-only Catalog availability history: storeStableId=${storeStableId} trackingStartedAt=${trackingStartedAt.toISOString()}`,
        );
      }
    }
  }
}
