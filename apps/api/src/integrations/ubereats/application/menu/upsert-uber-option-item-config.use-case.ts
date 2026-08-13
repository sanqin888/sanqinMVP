import type { UberOptionItemConfigCommandPort } from './uber-menu-draft.ports';
import { UberMenuReferenceValidator } from './uber-menu-reference-validator.service';

/** Owns the atomic, idempotent option item configuration command. */
export class UpsertUberOptionItemConfigUseCase {
  constructor(
    private readonly commands: UberOptionItemConfigCommandPort,
    private readonly references: UberMenuReferenceValidator,
  ) {}

  async execute(
    input: Parameters<
      UberOptionItemConfigCommandPort['upsertUberOptionItemConfig']
    >[0],
  ) {
    await this.references.ensureOptionChoiceExists(input.optionChoiceStableId);
    return this.commands.upsertUberOptionItemConfig(input);
  }
}
