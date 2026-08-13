import type { UberMenuConfigQueryPort } from './uber-menu-draft.ports';

export class QueryUberMenuConfigUseCase {
  constructor(private readonly queries: UberMenuConfigQueryPort) {}

  listItemChannelConfigs(storeId?: string) {
    return this.queries.listUberItemChannelConfigs(storeId);
  }

  listPublishedMenuItems(storeId?: string) {
    return this.queries.listUberPublishedMenuItems(storeId);
  }

  listOptionItemConfigs(storeId?: string) {
    return this.queries.listUberOptionItemConfigs(storeId);
  }
}
