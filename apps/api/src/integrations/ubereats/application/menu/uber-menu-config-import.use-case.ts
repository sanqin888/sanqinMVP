import type {
  UberMenuConfigImportMode,
  UberMenuConfigImportPort,
} from './uber-menu-config-import.ports';

export class UberMenuConfigImportUseCase {
  constructor(private readonly imports: UberMenuConfigImportPort) {}
  preview(
    sourceStoreId: string,
    targetStoreId: string,
    mode: UberMenuConfigImportMode = 'SKIP_EXISTING',
  ) {
    return this.imports.preview(sourceStoreId, targetStoreId, mode);
  }
  apply(
    sourceStoreId: string,
    targetStoreId: string,
    mode: UberMenuConfigImportMode,
    previewFingerprint: string,
    administratorStableId: string,
  ) {
    return this.imports.apply(
      sourceStoreId,
      targetStoreId,
      mode,
      previewFingerprint,
      administratorStableId,
    );
  }
  restoreItemPrice(
    storeId: string,
    menuItemStableId: string,
    administratorStableId: string,
  ) {
    return this.imports.restoreItemPrice(
      storeId,
      menuItemStableId,
      administratorStableId,
    );
  }
  restoreOptionPrice(
    storeId: string,
    optionChoiceStableId: string,
    administratorStableId: string,
  ) {
    return this.imports.restoreOptionPrice(
      storeId,
      optionChoiceStableId,
      administratorStableId,
    );
  }
}
