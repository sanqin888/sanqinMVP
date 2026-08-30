/** Stable Brand / Store boundary for cross-context configuration and identity reads. */
export {
  DEFAULT_STORE_STABLE_ID,
  resolveConfiguredStoreStableId,
} from './store-identity';
export {
  BRAND_STORE_CONFIG_READER,
  BrandStoreConfigUnavailableError,
  type BrandConfigSnapshot,
  type BrandStoreConfigReaderPort,
  type BrandStoreConfigSnapshot,
  type StoreConfigSnapshot,
} from './brand-store-config.contract';
export { BrandStoreConfigModule } from './brand-store-config.module';
