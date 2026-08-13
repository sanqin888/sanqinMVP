import type { UberMenuDraftMutationPort } from './uber-menu-draft.ports';

/** Owns the atomic, idempotent child-group unbinding command. */
export class UnbindUberDraftOptionChildGroupUseCase {
  constructor(private readonly mutations: UberMenuDraftMutationPort) {}

  execute(
    ...args: Parameters<
      UberMenuDraftMutationPort['unbindUberDraftOptionChildGroup']
    >
  ) {
    return this.mutations.unbindUberDraftOptionChildGroup(...args);
  }
}
