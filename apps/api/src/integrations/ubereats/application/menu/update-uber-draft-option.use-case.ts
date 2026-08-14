import type {
  OptionChoiceExistenceQueryPort,
  UberDraftOptionCommandPort,
  UberMenuWriteTransactionPort,
} from './uber-menu-draft.ports';
import { ensureOptionChoiceExists } from './uber-menu-reference-validator.service';

/** Owns the transaction that updates one draft option. */
export class UpdateUberDraftOptionUseCase {
  constructor(
    private readonly transaction: UberMenuWriteTransactionPort<UberDraftOptionCommandPort>,
    private readonly optionChoices: OptionChoiceExistenceQueryPort,
  ) {}

  async execute(
    ...args: Parameters<UberDraftOptionCommandPort['updateUberDraftOption']>
  ) {
    await ensureOptionChoiceExists(this.optionChoices, args[0]);
    return this.transaction.execute((commands) =>
      commands.updateUberDraftOption(...args),
    );
  }
}
