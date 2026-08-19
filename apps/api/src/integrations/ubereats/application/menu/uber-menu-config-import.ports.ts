export type UberMenuConfigKind = 'items' | 'options' | 'groups' | 'categories';
export type UberMenuConfigImportMode = 'SKIP_EXISTING' | 'OVERWRITE';
export type UberMenuConfigImportCount = {
  create: number;
  update: number;
  unchanged: number;
  conflicts: number;
};
export type UberMenuConfigValue = string | number | boolean | null;
export type UberMenuConfigFields = Readonly<
  Record<string, UberMenuConfigValue>
>;
export type UberMenuConfigImportPreview = {
  fingerprint: string;
  sourceStoreId: string;
  targetStoreId: string;
  mode: UberMenuConfigImportMode;
  counts: Record<UberMenuConfigKind, UberMenuConfigImportCount>;
  conflicts: Array<{
    kind: UberMenuConfigKind;
    stableId: string;
    source: UberMenuConfigFields;
    target: UberMenuConfigFields;
  }>;
  warnings: string[];
};
export interface UberMenuConfigImportPort {
  preview(
    sourceStoreId: string,
    targetStoreId: string,
    mode: UberMenuConfigImportMode,
  ): Promise<UberMenuConfigImportPreview>;
  apply(
    sourceStoreId: string,
    targetStoreId: string,
    mode: UberMenuConfigImportMode,
    previewFingerprint: string,
    administratorId: string,
  ): Promise<UberMenuConfigImportPreview>;
  restoreItemPrice(
    storeId: string,
    menuItemStableId: string,
    administratorId: string,
  ): Promise<{ sourcePriceCents: number }>;
  restoreOptionPrice(
    storeId: string,
    optionChoiceStableId: string,
    administratorId: string,
  ): Promise<{ sourcePriceDeltaCents: number }>;
}
export const UBER_MENU_CONFIG_IMPORT_PORT = Symbol(
  'UBER_MENU_CONFIG_IMPORT_PORT',
);
