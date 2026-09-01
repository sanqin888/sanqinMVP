export const BRAND_STORE_CONFIG_READER = Symbol('BRAND_STORE_CONFIG_READER');
export const BRAND_STORE_CONFIG_WRITER = Symbol('BRAND_STORE_CONFIG_WRITER');
export const STORE_DIRECTORY_READER = Symbol('STORE_DIRECTORY_READER');
export const STORE_DIRECTORY_WRITER = Symbol('STORE_DIRECTORY_WRITER');
export const STORE_LEGACY_DB_ID_RESOLVER = Symbol(
  'STORE_LEGACY_DB_ID_RESOLVER',
);

export type BrandConfigSnapshot = {
  brandNameZh: string | null;
  brandNameEn: string | null;
  siteUrl: string | null;
  emailFromNameZh: string | null;
  emailFromNameEn: string | null;
  emailFromAddress: string | null;
  smsSignature: string | null;
  supportPhone: string | null;
  supportEmail: string | null;
  wechatAlipayExchangeRate: number;
};

export type StoreConfigSnapshot = {
  storeStableId: string;
  storeName: string;
  isActive: boolean;
  timezone: string;
  isTemporarilyClosed: boolean;
  temporaryCloseReason: string | null;
  publicNotice: string | null;
  publicNoticeEn: string | null;
  deliveryBaseFeeCents: number;
  priorityPerKmCents: number;
  maxDeliveryRangeKm: number;
  priorityDefaultDistanceKm: number;
  latitude: number | null;
  longitude: number | null;
  addressLine1: string | null;
  addressLine2: string | null;
  city: string | null;
  province: string | null;
  postalCode: string | null;
  countryCode: string;
  phone: string | null;
  contactName: string | null;
  salesTaxRate: number;
  enableUberDirect: boolean;
  autoAcceptOnlineOrders: boolean;
  allergyHandlingMode: 'RELAY_ALL' | 'DENY_LIST' | 'DENY_ALL';
  unsupportedAllergens: string[];
};

export type BrandStoreConfigSnapshot = {
  brand: BrandConfigSnapshot;
  store: StoreConfigSnapshot;
};

export type BrandConfigUpdateInput = Partial<BrandConfigSnapshot>;

export type StoreConfigUpdateInput = Partial<
  Pick<
    StoreConfigSnapshot,
    | 'timezone'
    | 'isTemporarilyClosed'
    | 'temporaryCloseReason'
    | 'publicNotice'
    | 'publicNoticeEn'
    | 'deliveryBaseFeeCents'
    | 'priorityPerKmCents'
    | 'maxDeliveryRangeKm'
    | 'priorityDefaultDistanceKm'
    | 'latitude'
    | 'longitude'
    | 'addressLine1'
    | 'addressLine2'
    | 'city'
    | 'province'
    | 'postalCode'
    | 'countryCode'
    | 'phone'
    | 'contactName'
    | 'salesTaxRate'
    | 'enableUberDirect'
    | 'autoAcceptOnlineOrders'
    | 'allergyHandlingMode'
    | 'unsupportedAllergens'
  >
>;

export type BrandStoreConfigUpdateInput = {
  brand?: BrandConfigUpdateInput;
  store?: StoreConfigUpdateInput;
};

export type StoreDirectoryEntry = Pick<
  StoreConfigSnapshot,
  'storeStableId' | 'storeName' | 'isActive'
>;

export type CreateStoreInput = {
  storeStableId: string;
  storeName: string;
};

export interface BrandStoreConfigReaderPort {
  getBrandSnapshot(): Promise<BrandConfigSnapshot>;
  getStoreSnapshot(storeStableId?: string): Promise<StoreConfigSnapshot>;
  getSnapshot(): Promise<BrandStoreConfigSnapshot>;
}

export interface BrandStoreConfigWriterPort {
  updateConfig(
    input: BrandStoreConfigUpdateInput,
    storeStableId?: string,
  ): Promise<void>;
  resumeTemporaryClosureIfMatches(
    storeStableId: string,
    expectedReason: string,
  ): Promise<boolean>;
}

export interface StoreDirectoryReaderPort {
  listStores(): Promise<StoreDirectoryEntry[]>;
}

export interface StoreDirectoryWriterPort {
  createStore(input: CreateStoreInput): Promise<StoreConfigSnapshot>;
}

/** @compat pos-device.admin-db-id.v1 */
export interface StoreLegacyDbIdResolverPort {
  resolveStoreStableIdByDbId(storeDbId: string): Promise<string | null>;
}

export class StoreStableIdAlreadyExistsError extends Error {
  constructor(storeStableId: string) {
    super(`Store stable id already exists: ${storeStableId}`);
    this.name = 'StoreStableIdAlreadyExistsError';
  }
}

export class BrandStoreConfigUnavailableError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'BrandStoreConfigUnavailableError';
  }
}
