import { Inject, Injectable } from '@nestjs/common';
import { PrismaService } from '../../../../prisma/prisma.service';
import {
  UBER_CATALOG_MENU_FACTS_QUERY,
  type UberCatalogMenuFactsQueryPort,
} from '../../application/shared/uber-catalog-menu-facts.port';
import type {
  MenuItemExistenceQueryPort,
  OptionChoiceExistenceQueryPort,
  ProvisionedUberStoreQueryPort,
} from '../../application/menu/uber-menu-draft.ports';

@Injectable()
export class UberMenuSupportingQueriesPrismaAdapter
  implements
    MenuItemExistenceQueryPort,
    OptionChoiceExistenceQueryPort,
    ProvisionedUberStoreQueryPort
{
  constructor(
    private readonly prisma: PrismaService,
    @Inject(UBER_CATALOG_MENU_FACTS_QUERY)
    private readonly catalogFacts: UberCatalogMenuFactsQueryPort,
  ) {}

  async menuItemExists(stableId: string): Promise<boolean> {
    return (await this.catalogFacts.getMenuItemSource(stableId)) !== null;
  }

  async optionChoiceExists(stableId: string): Promise<boolean> {
    return (await this.catalogFacts.getOptionSource(stableId)) !== null;
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
}
