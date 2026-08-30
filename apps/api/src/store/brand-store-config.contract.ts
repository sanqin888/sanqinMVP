export const BRAND_STORE_CONFIG_READER = Symbol('BRAND_STORE_CONFIG_READER');

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

export interface BrandStoreConfigReaderPort {
  getBrandSnapshot(): Promise<BrandConfigSnapshot>;
  getStoreSnapshot(): Promise<StoreConfigSnapshot>;
  getSnapshot(): Promise<BrandStoreConfigSnapshot>;
}

export class BrandStoreConfigUnavailableError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'BrandStoreConfigUnavailableError';
  }
}
