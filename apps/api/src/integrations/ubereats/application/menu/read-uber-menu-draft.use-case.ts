import type { UberMenuDraftReadPort } from './uber-menu-draft.ports';

export class ReadUberMenuDraftUseCase {
  constructor(private readonly drafts: UberMenuDraftReadPort) {}

  execute(storeId?: string) {
    return this.drafts.getUberMenuDraft(storeId);
  }
}
