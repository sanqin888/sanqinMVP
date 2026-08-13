import type { UberMenuDraftMutationPort } from './uber-menu-draft.ports';

/** Binding commands are atomic and idempotent at the mutation port boundary. */
export class BindUberMenuOptionChildGroupUseCase {
  constructor(private readonly mutations: UberMenuDraftMutationPort) {}

  bind(
    ...args: Parameters<
      UberMenuDraftMutationPort['bindUberDraftOptionChildGroup']
    >
  ) {
    return this.mutations.bindUberDraftOptionChildGroup(...args);
  }

  unbind(
    ...args: Parameters<
      UberMenuDraftMutationPort['unbindUberDraftOptionChildGroup']
    >
  ) {
    return this.mutations.unbindUberDraftOptionChildGroup(...args);
  }
}
