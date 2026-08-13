import type { UberMenuDraftDiffPort } from './uber-menu-draft.ports';

export class QueryUberMenuDraftDiffUseCase {
  constructor(private readonly diffs: UberMenuDraftDiffPort) {}

  execute(storeId?: string) {
    return this.diffs.getUberMenuDraftDiff(storeId);
  }
}
