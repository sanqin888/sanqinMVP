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
    administratorId: string,
  ) {
    return this.imports.apply(
      sourceStoreId,
      targetStoreId,
      mode,
      previewFingerprint,
      administratorId,
    );
  }
  restoreItemPrice(
    storeId: string,
    menuItemStableId: string,
    administratorId: string,
  ) {
    return this.imports.restoreItemPrice(
      storeId,
      menuItemStableId,
      administratorId,
    );
  }
  restoreOptionPrice(
    storeId: string,
    optionChoiceStableId: string,
    administratorId: string,
  ) {
    return this.imports.restoreOptionPrice(
      storeId,
      optionChoiceStableId,
      administratorId,
    );
  }
}
