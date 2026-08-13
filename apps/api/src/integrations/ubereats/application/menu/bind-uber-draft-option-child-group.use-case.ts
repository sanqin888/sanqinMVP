import type { UberMenuDraftMutationPort } from './uber-menu-draft.ports';

/** Owns the atomic, idempotent child-group binding command. */
export class BindUberDraftOptionChildGroupUseCase {
  constructor(private readonly mutations: UberMenuDraftMutationPort) {}

  execute(
    ...args: Parameters<
      UberMenuDraftMutationPort['bindUberDraftOptionChildGroup']
    >
  ) {
    return this.mutations.bindUberDraftOptionChildGroup(...args);
  }
}
