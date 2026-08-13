import type {
  OptionChoiceExistenceQueryPort,
  UberMenuWriteTransactionPort,
  UberOptionItemConfigCommandPort,
} from './uber-menu-draft.ports';
import { ensureOptionChoiceExists } from './uber-menu-reference-validator.service';

/** Owns the atomic, idempotent option item configuration command. */
export class UpsertUberOptionItemConfigUseCase {
  constructor(
    private readonly transaction: UberMenuWriteTransactionPort<UberOptionItemConfigCommandPort>,
    private readonly optionChoices: OptionChoiceExistenceQueryPort,
  ) {}

  async execute(
    input: Parameters<
      UberOptionItemConfigCommandPort['upsertUberOptionItemConfig']
    >[0],
  ) {
    await ensureOptionChoiceExists(
      this.optionChoices,
      input.optionChoiceStableId,
    );
    return this.transaction.execute((commands) =>
      commands.upsertUberOptionItemConfig(input),
    );
  }
}
