import type { UberDraftOptionCommandPort } from './uber-menu-draft.ports';
import { UberMenuReferenceValidator } from './uber-menu-reference-validator.service';

/** Owns the transaction that updates one draft option. */
export class UpdateUberDraftOptionUseCase {
  constructor(
    private readonly commands: UberDraftOptionCommandPort,
    private readonly references: UberMenuReferenceValidator,
  ) {}

  async execute(
    ...args: Parameters<UberDraftOptionCommandPort['updateUberDraftOption']>
  ) {
    await this.references.ensureOptionChoiceExists(args[0]);
    return this.commands.updateUberDraftOption(...args);
  }
}
