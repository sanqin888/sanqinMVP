import type { UberOptionChildGroupBindingCommandPort } from './uber-menu-draft.ports';

/** Owns the atomic, idempotent child-group unbinding command. */
export class UnbindUberDraftOptionChildGroupUseCase {
  constructor(
    private readonly commands: UberOptionChildGroupBindingCommandPort,
  ) {}

  execute(
    ...args: Parameters<
      UberOptionChildGroupBindingCommandPort['unbindUberDraftOptionChildGroup']
    >
  ) {
    return this.commands.unbindUberDraftOptionChildGroup(...args);
  }
}
