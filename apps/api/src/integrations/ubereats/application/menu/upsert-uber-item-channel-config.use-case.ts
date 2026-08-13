import type { UberMenuConfigWritePort } from './uber-menu-draft.ports';
import { UberMenuReferenceValidator } from './uber-menu-reference-validator.service';

/** Owns the atomic, idempotent item channel configuration command. */
export class UpsertUberItemChannelConfigUseCase {
  constructor(
    private readonly writes: UberMenuConfigWritePort,
    private readonly references: UberMenuReferenceValidator,
  ) {}

  async execute(
    input: Parameters<
      UberMenuConfigWritePort['upsertUberItemChannelConfig']
    >[0],
  ) {
    await this.references.ensureMenuItemExists(input.menuItemStableId);
    return this.writes.upsertUberItemChannelConfig(input);
  }
}
