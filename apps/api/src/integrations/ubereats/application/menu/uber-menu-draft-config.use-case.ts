import {
  type UberMenuDraftCommandPort,
  type UberMenuDraftMutationResult,
  type UberMenuDraftQueryPort,
  type UpdateUberMenuGroupDraft,
  type UpdateUberMenuItemDraft,
  type UpdateUberMenuOptionDraft,
} from '../ports/uber-menu-draft.ports';

const compact = <T extends object>(changes: T): T =>
  Object.fromEntries(
    Object.entries(changes).filter(([, value]) => value !== undefined),
  ) as T;

const requireIdentity = (storeId: string, stableId?: string): void => {
  if (!storeId.trim() || (stableId !== undefined && !stableId.trim())) {
    throw new TypeError('storeId and stableId must not be empty');
  }
};

const requireChanges = (changes: object): void => {
  if (Object.keys(changes).length === 0) {
    throw new TypeError('at least one supported draft field is required');
  }
};

/** Public application boundary for editing the small, channel-specific draft configuration. */
export class UberMenuDraftConfigUseCase {
  constructor(
    private readonly queries: UberMenuDraftQueryPort,
    private readonly commands: UberMenuDraftCommandPort,
  ) {}

  listItems(storeId: string) {
    requireIdentity(storeId);
    return this.queries.listItemConfigs(storeId);
  }

  listOptions(storeId: string) {
    requireIdentity(storeId);
    return this.queries.listOptionConfigs(storeId);
  }

  async updateItem(
    storeId: string,
    stableId: string,
    input: UpdateUberMenuItemDraft,
  ) {
    const changes = compact(input);
    requireIdentity(storeId, stableId);
    requireChanges(changes);
    if (
      changes.priceCents !== undefined &&
      (!Number.isInteger(changes.priceCents) || changes.priceCents < 0)
    ) {
      throw new TypeError('priceCents must be a non-negative integer');
    }
    await this.commands.updateItem(storeId, stableId, changes);
    return this.result('item', storeId, stableId);
  }

  async updateGroup(
    storeId: string,
    stableId: string,
    input: UpdateUberMenuGroupDraft,
  ) {
    const changes = compact(input);
    requireIdentity(storeId, stableId);
    requireChanges(changes);
    if (
      (changes.minSelect !== undefined &&
        (!Number.isInteger(changes.minSelect) || changes.minSelect < 0)) ||
      (changes.maxSelect !== undefined &&
        (!Number.isInteger(changes.maxSelect) || changes.maxSelect < 0)) ||
      (changes.minSelect !== undefined &&
        changes.maxSelect !== undefined &&
        changes.minSelect > changes.maxSelect)
    ) {
      throw new TypeError(
        'selection limits must be non-negative integers with minSelect <= maxSelect',
      );
    }
    await this.commands.updateGroup(storeId, stableId, changes);
    return this.result('group', storeId, stableId);
  }

  async updateOption(
    storeId: string,
    stableId: string,
    input: UpdateUberMenuOptionDraft,
  ) {
    const changes = compact(input);
    requireIdentity(storeId, stableId);
    requireChanges(changes);
    if (
      changes.priceDeltaCents !== undefined &&
      !Number.isInteger(changes.priceDeltaCents)
    ) {
      throw new TypeError('priceDeltaCents must be an integer');
    }
    await this.commands.updateOption(storeId, stableId, changes);
    return this.result('option', storeId, stableId);
  }

  private result(
    entity: UberMenuDraftMutationResult['entity'],
    storeId: string,
    stableId: string,
  ): UberMenuDraftMutationResult {
    return { entity, storeId, stableId, updated: true };
  }
}
