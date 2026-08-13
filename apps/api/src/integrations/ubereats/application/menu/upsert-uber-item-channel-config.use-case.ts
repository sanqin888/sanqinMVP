import type {
  MenuItemExistenceQueryPort,
  UberItemChannelConfigCommandPort,
  UberMenuWriteTransactionPort,
} from './uber-menu-draft.ports';
import { ensureMenuItemExists } from './uber-menu-reference-validator.service';

/** Owns the atomic, idempotent item channel configuration command. */
export class UpsertUberItemChannelConfigUseCase {
  constructor(
    private readonly transaction: UberMenuWriteTransactionPort<UberItemChannelConfigCommandPort>,
    private readonly menuItems: MenuItemExistenceQueryPort,
  ) {}

  async execute(
    input: Parameters<
      UberItemChannelConfigCommandPort['upsertUberItemChannelConfig']
    >[0],
  ) {
    await ensureMenuItemExists(this.menuItems, input.menuItemStableId);
    return this.transaction.execute((commands) =>
      commands.upsertUberItemChannelConfig(input),
    );
  }
}
