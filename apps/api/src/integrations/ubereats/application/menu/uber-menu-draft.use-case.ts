import type {
  UberMenuConfigQueryPort,
  UberMenuConfigWritePort,
  UberMenuDraftDiffPort,
  UberMenuDraftMutationPort,
  UberMenuDraftReadPort,
  UberMenuReferenceQueryPort,
} from '../ports/uber-menu-draft-workflow.ports';
import { UberValidationError } from '../errors/uber-application.error';

/** Draft read/write and diff use cases. Every write is committed by the port in one transaction. */
export class UberMenuDraftUseCase {
  constructor(
    private readonly configQueries: UberMenuConfigQueryPort,
    private readonly configWrites: UberMenuConfigWritePort,
    private readonly draftQueries: UberMenuDraftReadPort,
    private readonly draftMutations: UberMenuDraftMutationPort,
    private readonly draftDiffs: UberMenuDraftDiffPort,
    private readonly references: UberMenuReferenceQueryPort,
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
  async upsertUberItemChannelConfig(
    input: Parameters<
      UberMenuConfigWritePort['upsertUberItemChannelConfig']
    >[0],
  ) {
    await this.ensureMenuItemExists(input.menuItemStableId);
    return this.configWrites.upsertUberItemChannelConfig(input);
  }
  async upsertUberOptionItemConfig(
    input: Parameters<UberMenuConfigWritePort['upsertUberOptionItemConfig']>[0],
  ) {
    await this.ensureOptionChoiceExists(input.optionChoiceStableId);
    return this.configWrites.upsertUberOptionItemConfig(input);
  }
  getUberMenuDraft(storeId?: string) {
    return this.draftQueries.getUberMenuDraft(storeId);
  }
  async updateUberDraftItem(
    ...args: Parameters<UberMenuDraftMutationPort['updateUberDraftItem']>
  ) {
    await this.ensureMenuItemExists(args[0]);
    return this.draftMutations.updateUberDraftItem(...args);
  }
  updateUberDraftGroup(
    ...args: Parameters<UberMenuDraftMutationPort['updateUberDraftGroup']>
  ) {
    return this.draftMutations.updateUberDraftGroup(...args);
  }
  async updateUberDraftOption(
    ...args: Parameters<UberMenuDraftMutationPort['updateUberDraftOption']>
  ) {
    await this.ensureOptionChoiceExists(args[0]);
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

  async resolveUberStoreIdOrThrow(storeId: string): Promise<string> {
    const mapping = await this.references.findProvisionedStoreMapping(storeId);
    if (!mapping) {
      throw this.validation(
        `未找到已 provision 的 Uber store 映射，请先完成店铺映射。storeId=${storeId}`,
      );
    }
    return mapping.uberStoreId;
  }

  private async ensureMenuItemExists(stableId: string) {
    if (!(await this.references.findMenuItemByStableId(stableId))) {
      throw this.validation(`菜单项 ${stableId} 不存在`);
    }
  }

  private async ensureOptionChoiceExists(stableId: string) {
    if (!(await this.references.findOptionChoiceByStableId(stableId))) {
      throw this.validation(`选项 ${stableId} 不存在`);
    }
  }

  private validation(message: string) {
    return new UberValidationError({
      code: 'UBER_MENU_INPUT_INVALID',
      message,
      operation: 'menu.validate',
      upstreamStatus: null,
    });
  }
}
