import type {
  OptionChoiceExistenceQueryPort,
  UberDraftOptionCommandPort,
} from './uber-menu-draft.ports';
import { ensureOptionChoiceExists } from './uber-menu-reference-validator.service';

/** Owns the transaction that updates one draft option. */
export class UpdateUberDraftOptionUseCase {
  constructor(
    private readonly commands: UberDraftOptionCommandPort,
    private readonly optionChoices: OptionChoiceExistenceQueryPort,
  ) {}

  async execute(
    ...args: Parameters<UberDraftOptionCommandPort['updateUberDraftOption']>
  ) {
    await ensureOptionChoiceExists(this.optionChoices, args[0]);
    return this.commands.updateUberDraftOption(...args);
  }
}
