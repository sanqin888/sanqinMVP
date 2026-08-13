import type {
  UberMenuWriteTransactionPort,
  UberOptionChildGroupBindingCommandPort,
} from './uber-menu-draft.ports';
import { UBER_MENU_COMMAND_IDEMPOTENCY } from './uber-menu-draft.ports';
import { normalizeUberStoreId } from '../../domain/merchant/uber-store-id';

/** Owns the atomic, idempotent child-group binding command. */
export class BindUberDraftOptionChildGroupUseCase {
  constructor(
    private readonly transaction: UberMenuWriteTransactionPort<UberOptionChildGroupBindingCommandPort>,
  ) {}

  execute(optionId: string, childGroupId: string, storeId?: string) {
    const normalizedStoreId = normalizeUberStoreId(storeId);
    return this.transaction.execute((commands) =>
      commands.bindUberDraftOptionChildGroup({
        resourceKey: {
          storeId: normalizedStoreId,
          parentOptionChoiceStableId: optionId,
          childTemplateGroupStableId: childGroupId,
        },
        payload: { isBound: true },
        semantics: UBER_MENU_COMMAND_IDEMPOTENCY,
      }),
    );
  }
}
