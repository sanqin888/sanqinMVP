import type {
  UberMenuWriteTransactionPort,
  UberOptionChildGroupBindingCommandPort,
} from './uber-menu-draft.ports';

/** Owns the atomic, idempotent child-group unbinding command. */
export class UnbindUberDraftOptionChildGroupUseCase {
  constructor(
    private readonly transaction: UberMenuWriteTransactionPort<UberOptionChildGroupBindingCommandPort>,
  ) {}

  execute(
    ...args: Parameters<
      UberOptionChildGroupBindingCommandPort['unbindUberDraftOptionChildGroup']
    >
  ) {
    return this.transaction.execute((commands) =>
      commands.unbindUberDraftOptionChildGroup(...args),
    );
  }
}
