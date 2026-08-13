import type {
  MenuItemExistenceQueryPort,
  UberDraftItemCommandPort,
  UberMenuWriteTransactionPort,
} from './uber-menu-draft.ports';
import { ensureMenuItemExists } from './uber-menu-reference-validator.service';

/** Owns the transaction that updates one draft item. */
export class UpdateUberDraftItemUseCase {
  constructor(
    private readonly transaction: UberMenuWriteTransactionPort<UberDraftItemCommandPort>,
    private readonly menuItems: MenuItemExistenceQueryPort,
  ) {}

  async execute(
    ...args: Parameters<UberDraftItemCommandPort['updateUberDraftItem']>
  ) {
    await ensureMenuItemExists(this.menuItems, args[0]);
    return this.transaction.execute((commands) =>
      commands.updateUberDraftItem(...args),
    );
  }
}
