import type {
  MenuItemExistenceQueryPort,
  UberDraftItemCommandPort,
} from './uber-menu-draft.ports';
import { ensureMenuItemExists } from './uber-menu-reference-validator.service';

/** Owns the transaction that updates one draft item. */
export class UpdateUberDraftItemUseCase {
  constructor(
    private readonly commands: UberDraftItemCommandPort,
    private readonly menuItems: MenuItemExistenceQueryPort,
  ) {}

  async execute(
    ...args: Parameters<UberDraftItemCommandPort['updateUberDraftItem']>
  ) {
    await ensureMenuItemExists(this.menuItems, args[0]);
    return this.commands.updateUberDraftItem(...args);
  }
}
