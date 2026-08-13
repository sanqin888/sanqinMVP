import type { UberOptionChildGroupBindingCommandPort } from './uber-menu-draft.ports';

/** Owns the atomic, idempotent child-group binding command. */
export class BindUberDraftOptionChildGroupUseCase {
  constructor(
    private readonly commands: UberOptionChildGroupBindingCommandPort,
  ) {}

  execute(
    ...args: Parameters<
      UberOptionChildGroupBindingCommandPort['bindUberDraftOptionChildGroup']
    >
  ) {
    return this.commands.bindUberDraftOptionChildGroup(...args);
  }
}
