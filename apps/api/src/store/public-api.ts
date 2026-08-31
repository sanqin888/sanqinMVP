/** Stable Brand / Store boundary for cross-context configuration and identity access. */
export {
  DEFAULT_STORE_STABLE_ID,
  resolveConfiguredStoreStableId,
} from './store-identity';
export {
  BRAND_STORE_CONFIG_READER,
  BRAND_STORE_CONFIG_WRITER,
  BrandStoreConfigUnavailableError,
  type BrandConfigSnapshot,
  type BrandConfigUpdateInput,
  type BrandStoreConfigReaderPort,
  type BrandStoreConfigSnapshot,
  type BrandStoreConfigUpdateInput,
  type BrandStoreConfigWriterPort,
  type StoreConfigSnapshot,
  type StoreConfigUpdateInput,
} from './brand-store-config.contract';
export {
  STORE_SCHEDULE_READER,
  STORE_SCHEDULE_WRITER,
  type StoreBusinessHour,
  type StoreHoliday,
  type StoreScheduleReaderPort,
  type StoreScheduleWriterPort,
  type StoreWeekday,
} from './store-schedule.contract';
export { BrandStoreConfigModule } from './brand-store-config.module';
