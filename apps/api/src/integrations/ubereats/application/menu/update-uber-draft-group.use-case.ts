import type {
  UberDraftGroupCommandPort,
  UberMenuWriteTransactionPort,
} from './uber-menu-draft.ports';

/** Owns the transaction that updates one draft group. */
export class UpdateUberDraftGroupUseCase {
  constructor(
    private readonly transaction: UberMenuWriteTransactionPort<UberDraftGroupCommandPort>,
  ) {}

  execute(
    ...args: Parameters<UberDraftGroupCommandPort['updateUberDraftGroup']>
  ) {
    return this.transaction.execute((commands) =>
      commands.updateUberDraftGroup(...args),
    );
  }
}
