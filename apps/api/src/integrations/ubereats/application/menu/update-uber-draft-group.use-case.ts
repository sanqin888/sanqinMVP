import type { UberMenuDraftMutationPort } from './uber-menu-draft.ports';

/** Owns the transaction that updates one draft group. */
export class UpdateUberDraftGroupUseCase {
  constructor(private readonly mutations: UberMenuDraftMutationPort) {}

  execute(
    ...args: Parameters<UberMenuDraftMutationPort['updateUberDraftGroup']>
  ) {
    return this.mutations.updateUberDraftGroup(...args);
  }
}
