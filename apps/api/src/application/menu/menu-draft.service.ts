import { Injectable } from '@nestjs/common';
import { UberMenuRepository } from '../../integrations/ubereats/infrastructure/persistence/uber-menu.repository';
/** Coordinates draft queries/commands; domain graph construction receives repository snapshots explicitly. */
@Injectable()
export class MenuDraftService {
  constructor(private readonly repository: UberMenuRepository) {}
  listItemConfigs(storeId: string) {
    return this.repository.listItemConfigs(storeId);
  }
  listOptionConfigs(storeId: string) {
    return this.repository.listOptionConfigs(storeId);
  }
  updateItem(storeId: string, stableId: string, data: Record<string, unknown>) {
    return this.repository.updateItem(storeId, stableId, data);
  }
  updateGroup(
    storeId: string,
    stableId: string,
    data: Record<string, unknown>,
  ) {
    return this.repository.updateGroup(storeId, stableId, data);
  }
  updateOption(
    storeId: string,
    stableId: string,
    data: Record<string, unknown>,
  ) {
    return this.repository.updateOption(storeId, stableId, data);
  }
}
