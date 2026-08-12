import type {
  UberMenuConfigQueryPort,
  UberMenuConfigWritePort,
  UberMenuDraftDiffPort,
  UberMenuDraftMutationPort,
  UberMenuDraftReadPort,
} from '../ports/uber-menu-draft-workflow.ports';

/** Draft read/write and diff use cases. Every write is committed by the port in one transaction. */
export class UberMenuDraftUseCase {
  constructor(
    private readonly configQueries: UberMenuConfigQueryPort,
    private readonly configWrites: UberMenuConfigWritePort,
    private readonly draftQueries: UberMenuDraftReadPort,
    private readonly draftMutations: UberMenuDraftMutationPort,
    private readonly draftDiffs: UberMenuDraftDiffPort,
  ) {}
  listUberItemChannelConfigs(storeId?: string) {
    return this.configQueries.listUberItemChannelConfigs(storeId);
  }
  listUberPublishedMenuItems(storeId?: string) {
    return this.configQueries.listUberPublishedMenuItems(storeId);
  }
  listUberOptionItemConfigs(storeId?: string) {
    return this.configQueries.listUberOptionItemConfigs(storeId);
  }
  upsertUberItemChannelConfig(
    input: Parameters<
      UberMenuConfigWritePort['upsertUberItemChannelConfig']
    >[0],
  ) {
    return this.configWrites.upsertUberItemChannelConfig(input);
  }
  upsertUberOptionItemConfig(
    input: Parameters<UberMenuConfigWritePort['upsertUberOptionItemConfig']>[0],
  ) {
    return this.configWrites.upsertUberOptionItemConfig(input);
  }
  getUberMenuDraft(storeId?: string) {
    return this.draftQueries.getUberMenuDraft(storeId);
  }
  updateUberDraftItem(
    ...args: Parameters<UberMenuDraftMutationPort['updateUberDraftItem']>
  ) {
    return this.draftMutations.updateUberDraftItem(...args);
  }
  updateUberDraftGroup(
    ...args: Parameters<UberMenuDraftMutationPort['updateUberDraftGroup']>
  ) {
    return this.draftMutations.updateUberDraftGroup(...args);
  }
  updateUberDraftOption(
    ...args: Parameters<UberMenuDraftMutationPort['updateUberDraftOption']>
  ) {
    return this.draftMutations.updateUberDraftOption(...args);
  }
  bindUberDraftOptionChildGroup(
    ...args: Parameters<
      UberMenuDraftMutationPort['bindUberDraftOptionChildGroup']
    >
  ) {
    return this.draftMutations.bindUberDraftOptionChildGroup(...args);
  }
  unbindUberDraftOptionChildGroup(
    ...args: Parameters<
      UberMenuDraftMutationPort['unbindUberDraftOptionChildGroup']
    >
  ) {
    return this.draftMutations.unbindUberDraftOptionChildGroup(...args);
  }
  getUberMenuDraftDiff(storeId?: string) {
    return this.draftDiffs.getUberMenuDraftDiff(storeId);
  }
}
