import type { UberMenuDraftMutationPort } from './uber-menu-draft.ports';
import { UberMenuReferenceValidator } from './uber-menu-reference-validator.service';

/** Owns the transaction that updates one draft option. */
export class UpdateUberDraftOptionUseCase {
  constructor(
    private readonly mutations: UberMenuDraftMutationPort,
    private readonly references: UberMenuReferenceValidator,
  ) {}

  async execute(
    ...args: Parameters<UberMenuDraftMutationPort['updateUberDraftOption']>
  ) {
    await this.references.ensureOptionChoiceExists(args[0]);
    return this.mutations.updateUberDraftOption(...args);
  }
}
