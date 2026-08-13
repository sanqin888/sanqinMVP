import type { UberMenuDraftMutationPort } from './uber-menu-draft.ports';
import { UberMenuReferenceValidator } from './uber-menu-reference-validator.service';

/** Each method is one transaction; the mutation port commits or rolls it back atomically. */
export class UpdateUberMenuDraftItemUseCase {
  constructor(
    private readonly mutations: UberMenuDraftMutationPort,
    private readonly references: UberMenuReferenceValidator,
  ) {}

  async updateItem(
    ...args: Parameters<UberMenuDraftMutationPort['updateUberDraftItem']>
  ) {
    await this.references.ensureMenuItemExists(args[0]);
    return this.mutations.updateUberDraftItem(...args);
  }

  updateGroup(
    ...args: Parameters<UberMenuDraftMutationPort['updateUberDraftGroup']>
  ) {
    return this.mutations.updateUberDraftGroup(...args);
  }

  async updateOption(
    ...args: Parameters<UberMenuDraftMutationPort['updateUberDraftOption']>
  ) {
    await this.references.ensureOptionChoiceExists(args[0]);
    return this.mutations.updateUberDraftOption(...args);
  }
}
