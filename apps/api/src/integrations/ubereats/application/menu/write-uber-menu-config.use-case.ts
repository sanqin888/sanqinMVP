import type { UberMenuConfigWritePort } from './uber-menu-draft.ports';
import { UberMenuReferenceValidator } from './uber-menu-reference-validator.service';

/** The write port owns one atomic, idempotent upsert for each command. */
export class WriteUberMenuConfigUseCase {
  constructor(
    private readonly writes: UberMenuConfigWritePort,
    private readonly references: UberMenuReferenceValidator,
  ) {}

  async upsertItemChannelConfig(
    input: Parameters<
      UberMenuConfigWritePort['upsertUberItemChannelConfig']
    >[0],
  ) {
    await this.references.ensureMenuItemExists(input.menuItemStableId);
    return this.writes.upsertUberItemChannelConfig(input);
  }

  async upsertOptionItemConfig(
    input: Parameters<UberMenuConfigWritePort['upsertUberOptionItemConfig']>[0],
  ) {
    await this.references.ensureOptionChoiceExists(input.optionChoiceStableId);
    return this.writes.upsertUberOptionItemConfig(input);
  }
}
