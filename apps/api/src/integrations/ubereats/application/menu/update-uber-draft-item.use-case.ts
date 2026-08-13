import type { UberMenuDraftMutationPort } from './uber-menu-draft.ports';
import { UberMenuReferenceValidator } from './uber-menu-reference-validator.service';

/** Owns the transaction that updates one draft item. */
export class UpdateUberDraftItemUseCase {
  constructor(
    private readonly mutations: UberMenuDraftMutationPort,
    private readonly references: UberMenuReferenceValidator,
  ) {}

  async execute(
    ...args: Parameters<UberMenuDraftMutationPort['updateUberDraftItem']>
  ) {
    await this.references.ensureMenuItemExists(args[0]);
    return this.mutations.updateUberDraftItem(...args);
  }
}
