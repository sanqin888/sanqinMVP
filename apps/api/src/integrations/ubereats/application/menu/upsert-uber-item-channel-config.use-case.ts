import type { UberItemChannelConfigCommandPort } from './uber-menu-draft.ports';
import { UberMenuReferenceValidator } from './uber-menu-reference-validator.service';

/** Owns the atomic, idempotent item channel configuration command. */
export class UpsertUberItemChannelConfigUseCase {
  constructor(
    private readonly commands: UberItemChannelConfigCommandPort,
    private readonly references: UberMenuReferenceValidator,
  ) {}

  async execute(
    input: Parameters<
      UberItemChannelConfigCommandPort['upsertUberItemChannelConfig']
    >[0],
  ) {
    await this.references.ensureMenuItemExists(input.menuItemStableId);
    return this.commands.upsertUberItemChannelConfig(input);
  }
}
