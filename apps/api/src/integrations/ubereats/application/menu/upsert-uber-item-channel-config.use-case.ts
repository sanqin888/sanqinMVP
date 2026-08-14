import type {
  MenuItemExistenceQueryPort,
  UberItemChannelConfigCommandPort,
  UberMenuWriteTransactionPort,
} from './uber-menu-draft.ports';
import { UBER_MENU_COMMAND_IDEMPOTENCY } from './uber-menu-draft.ports';
import { normalizeUberStoreId } from '../../domain/merchant/uber-store-id';
import type { UpsertPriceBookItemInput } from '../../domain/menu/uber-menu.types';
import { ensureMenuItemExists } from './uber-menu-reference-validator.service';

/** Owns the atomic, idempotent item channel configuration command. */
export class UpsertUberItemChannelConfigUseCase {
  constructor(
    private readonly transaction: UberMenuWriteTransactionPort<UberItemChannelConfigCommandPort>,
    private readonly menuItems: MenuItemExistenceQueryPort,
  ) {}

  async execute(input: UpsertPriceBookItemInput) {
    await ensureMenuItemExists(this.menuItems, input.menuItemStableId);
    const storeId = normalizeUberStoreId(input.storeId);
    return this.transaction.execute((commands) =>
      commands.upsertUberItemChannelConfig({
        resourceKey: { storeId, menuItemStableId: input.menuItemStableId },
        payload: { ...input, storeId },
        semantics: UBER_MENU_COMMAND_IDEMPOTENCY,
      }),
    );
  }
}
