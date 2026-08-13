import type {
  UberDraftGroupCommandPort,
  UberMenuWriteTransactionPort,
} from './uber-menu-draft.ports';
import { UBER_MENU_COMMAND_IDEMPOTENCY } from './uber-menu-draft.ports';
import { normalizeUberStoreId } from '../../domain/merchant/uber-store-id';

/** Owns the transaction that updates one draft group. */
export class UpdateUberDraftGroupUseCase {
  constructor(
    private readonly transaction: UberMenuWriteTransactionPort<UberDraftGroupCommandPort>,
  ) {}

  execute(
    id: string,
    input: import('../../domain/menu/uber-menu.types').UpdateDraftGroupInput,
  ) {
    const storeId = normalizeUberStoreId(input.storeId);
    return this.transaction.execute((commands) =>
      commands.updateUberDraftGroup({
        resourceKey: { storeId, templateGroupStableId: id },
        payload: { ...input, storeId },
        semantics: UBER_MENU_COMMAND_IDEMPOTENCY,
      }),
    );
  }
}
