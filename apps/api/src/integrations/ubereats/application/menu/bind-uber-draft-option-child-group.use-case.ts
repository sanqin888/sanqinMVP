import type {
  UberMenuWriteTransactionPort,
  UberOptionChildGroupBindingCommandPort,
} from './uber-menu-draft.ports';

/** Owns the atomic, idempotent child-group binding command. */
export class BindUberDraftOptionChildGroupUseCase {
  constructor(
    private readonly transaction: UberMenuWriteTransactionPort<UberOptionChildGroupBindingCommandPort>,
  ) {}

  execute(
    ...args: Parameters<
      UberOptionChildGroupBindingCommandPort['bindUberDraftOptionChildGroup']
    >
  ) {
    return this.transaction.execute((commands) =>
      commands.bindUberDraftOptionChildGroup(...args),
    );
  }
}
