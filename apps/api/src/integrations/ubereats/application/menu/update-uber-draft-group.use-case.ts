import type { UberDraftGroupCommandPort } from './uber-menu-draft.ports';

/** Owns the transaction that updates one draft group. */
export class UpdateUberDraftGroupUseCase {
  constructor(private readonly commands: UberDraftGroupCommandPort) {}

  execute(
    ...args: Parameters<UberDraftGroupCommandPort['updateUberDraftGroup']>
  ) {
    return this.commands.updateUberDraftGroup(...args);
  }
}
