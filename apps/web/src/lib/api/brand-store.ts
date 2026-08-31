import { apiFetch } from './client';

export type BrandConfigView = {
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

export type StoreConfigView = {
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

export type StoreBusinessHourView = {
  weekday: number;
  openMinutes: number | null;
  closeMinutes: number | null;
  isClosed: boolean;
};

export type StoreHolidayView = {
  date: string;
  name: string | null;
  isClosed: boolean;
  openMinutes: number | null;
  closeMinutes: number | null;
};

export type StoreHoursResponse = { hours: StoreBusinessHourView[] };
export type StoreHolidaysResponse = { holidays: StoreHolidayView[] };

/**
 * UI composition model for the existing settings screen while the second-step
 * Admin UI is replacing it. It is assembled from Brand- and Store-owned HTTP
 * contracts; there is no canonical BusinessConfig HTTP contract behind it.
 */
export type AdminBusinessSettingsView = {
  timezone: string;
  isTemporarilyClosed: boolean;
  temporaryCloseReason: string | null;
  deliveryBaseFeeCents: number;
  priorityPerKmCents: number;
  maxDeliveryRangeKm: number;
  priorityDefaultDistanceKm: number;
  storeLatitude: number | null;
  storeLongitude: number | null;
  storeAddressLine1: string | null;
  storeAddressLine2: string | null;
  storeCity: string | null;
  storeProvince: string | null;
  storePostalCode: string | null;
  supportPhone: string | null;
  supportEmail: string | null;
  brandNameZh: string | null;
  brandNameEn: string | null;
  siteUrl: string | null;
  emailFromNameZh: string | null;
  emailFromNameEn: string | null;
  emailFromAddress: string | null;
  smsSignature: string | null;
  salesTaxRate: number;
  wechatAlipayExchangeRate: number;
  enableUberDirect: boolean;
  allergyHandlingMode: 'RELAY_ALL' | 'DENY_LIST' | 'DENY_ALL';
  unsupportedAllergens: string[];
  holidays: StoreHolidayView[];
};

export function fetchAdminBrandConfig(): Promise<BrandConfigView> {
  return apiFetch<BrandConfigView>('/staff/brand/config');
}

export function updateAdminBrandConfig(
  input: Partial<BrandConfigView>,
): Promise<BrandConfigView> {
  return apiFetch<BrandConfigView>('/staff/brand/config', {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(input),
  });
}

export function fetchStaffStoreConfig(): Promise<StoreConfigView> {
  return apiFetch<StoreConfigView>('/staff/store/config');
}

export function updateAdminStoreConfig(
  input: Partial<StoreConfigView>,
): Promise<StoreConfigView> {
  return apiFetch<StoreConfigView>('/staff/store/config', {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(input),
  });
}

export function fetchStaffStoreHours(): Promise<StoreHoursResponse> {
  return apiFetch<StoreHoursResponse>('/staff/store/hours');
}

export function updateAdminStoreHours(
  hours: StoreBusinessHourView[],
): Promise<StoreHoursResponse> {
  return apiFetch<StoreHoursResponse>('/staff/store/hours', {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ hours }),
  });
}

export function fetchStaffStoreHolidays(): Promise<StoreHolidaysResponse> {
  return apiFetch<StoreHolidaysResponse>('/staff/store/holidays');
}

export function updateAdminStoreHolidays(
  holidays: StoreHolidayView[],
): Promise<StoreHolidaysResponse> {
  return apiFetch<StoreHolidaysResponse>('/staff/store/holidays', {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ holidays }),
  });
}

export async function fetchAdminBusinessSettingsView(): Promise<{
  config: AdminBusinessSettingsView;
  hours: StoreBusinessHourView[];
}> {
  const [brand, store, hoursResponse, holidaysResponse] = await Promise.all([
    fetchAdminBrandConfig(),
    fetchStaffStoreConfig(),
    fetchStaffStoreHours(),
    fetchStaffStoreHolidays(),
  ]);

  return {
    config: {
      timezone: store.timezone,
      isTemporarilyClosed: store.isTemporarilyClosed,
      temporaryCloseReason: store.temporaryCloseReason,
      deliveryBaseFeeCents: store.deliveryBaseFeeCents,
      priorityPerKmCents: store.priorityPerKmCents,
      maxDeliveryRangeKm: store.maxDeliveryRangeKm,
      priorityDefaultDistanceKm: store.priorityDefaultDistanceKm,
      storeLatitude: store.latitude,
      storeLongitude: store.longitude,
      storeAddressLine1: store.addressLine1,
      storeAddressLine2: store.addressLine2,
      storeCity: store.city,
      storeProvince: store.province,
      storePostalCode: store.postalCode,
      supportPhone: brand.supportPhone,
      supportEmail: brand.supportEmail,
      brandNameZh: brand.brandNameZh,
      brandNameEn: brand.brandNameEn,
      siteUrl: brand.siteUrl,
      emailFromNameZh: brand.emailFromNameZh,
      emailFromNameEn: brand.emailFromNameEn,
      emailFromAddress: brand.emailFromAddress,
      smsSignature: brand.smsSignature,
      salesTaxRate: store.salesTaxRate,
      wechatAlipayExchangeRate: brand.wechatAlipayExchangeRate,
      enableUberDirect: store.enableUberDirect,
      allergyHandlingMode: store.allergyHandlingMode,
      unsupportedAllergens: store.unsupportedAllergens,
      holidays: holidaysResponse.holidays,
    },
    hours: hoursResponse.hours,
  };
}

export async function updateAdminBusinessSettingsView(
  config: AdminBusinessSettingsView,
): Promise<void> {
  // Keep the transitional compatibility copy deterministic: each owner write
  // refreshes the full Brand/Store overlap, so these writes must not race.
  await updateAdminBrandConfig({
    brandNameZh: config.brandNameZh,
    brandNameEn: config.brandNameEn,
    siteUrl: config.siteUrl,
    emailFromNameZh: config.emailFromNameZh,
    emailFromNameEn: config.emailFromNameEn,
    emailFromAddress: config.emailFromAddress,
    smsSignature: config.smsSignature,
    supportPhone: config.supportPhone,
    supportEmail: config.supportEmail,
    wechatAlipayExchangeRate: config.wechatAlipayExchangeRate,
  });
  await updateAdminStoreConfig({
    timezone: config.timezone,
    isTemporarilyClosed: config.isTemporarilyClosed,
    temporaryCloseReason: config.temporaryCloseReason,
    deliveryBaseFeeCents: config.deliveryBaseFeeCents,
    priorityPerKmCents: config.priorityPerKmCents,
    maxDeliveryRangeKm: config.maxDeliveryRangeKm,
    priorityDefaultDistanceKm: config.priorityDefaultDistanceKm,
    latitude: config.storeLatitude,
    longitude: config.storeLongitude,
    addressLine1: config.storeAddressLine1,
    addressLine2: config.storeAddressLine2,
    city: config.storeCity,
    province: config.storeProvince,
    postalCode: config.storePostalCode,
    salesTaxRate: config.salesTaxRate,
    enableUberDirect: config.enableUberDirect,
    allergyHandlingMode: config.allergyHandlingMode,
    unsupportedAllergens: config.unsupportedAllergens,
  });
}
