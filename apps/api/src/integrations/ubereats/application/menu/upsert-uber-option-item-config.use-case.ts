import type {
  OptionChoiceExistenceQueryPort,
  UberMenuWriteTransactionPort,
  UberOptionItemConfigCommandPort,
} from './uber-menu-draft.ports';
import { UBER_MENU_COMMAND_IDEMPOTENCY } from './uber-menu-draft.ports';
import { requireUberStoreId } from '../../domain/merchant/uber-store-id';
import type { UpsertOptionItemConfigInput } from '../../domain/menu/uber-menu.types';
import { ensureOptionChoiceExists } from './uber-menu-reference-validator.service';

/** Owns the atomic, idempotent option item configuration command. */
export class UpsertUberOptionItemConfigUseCase {
  constructor(
    private readonly transaction: UberMenuWriteTransactionPort<UberOptionItemConfigCommandPort>,
    private readonly optionChoices: OptionChoiceExistenceQueryPort,
  ) {}

  async execute(input: UpsertOptionItemConfigInput) {
    await ensureOptionChoiceExists(
      this.optionChoices,
      input.optionChoiceStableId,
    );
    const storeId = requireUberStoreId(input.storeId);
    return this.transaction.execute((commands) =>
      commands.upsertUberOptionItemConfig({
        resourceKey: {
          storeId,
          optionChoiceStableId: input.optionChoiceStableId,
        },
        payload: { ...input, storeId },
        semantics: UBER_MENU_COMMAND_IDEMPOTENCY,
      }),
    );
  }
}
