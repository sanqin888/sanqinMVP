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

export type StoreDirectoryEntryView = Pick<
  StoreConfigView,
  'storeStableId' | 'storeName' | 'isActive'
>;

export type CreateStoreView = {
  storeStableId: string;
  storeName: string;
};

export type StoreConfigUpdateView = Partial<
  Pick<
    StoreConfigView,
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

function staffStorePath(storeStableId: string, suffix: string): string {
  return `/staff/stores/${encodeURIComponent(storeStableId)}/${suffix}`;
}

export function fetchStaffStores(): Promise<StoreDirectoryEntryView[]> {
  return apiFetch<StoreDirectoryEntryView[]>('/staff/stores');
}

export function createAdminStore(input: CreateStoreView): Promise<StoreConfigView> {
  return apiFetch<StoreConfigView>('/staff/stores', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(input),
  });
}

export function fetchStaffStoreConfig(
  storeStableId: string,
): Promise<StoreConfigView> {
  return apiFetch<StoreConfigView>(staffStorePath(storeStableId, 'config'));
}

export function updateAdminStoreConfig(
  input: StoreConfigUpdateView,
  storeStableId: string,
): Promise<StoreConfigView> {
  return apiFetch<StoreConfigView>(staffStorePath(storeStableId, 'config'), {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(input),
  });
}

export function fetchStaffStoreHours(
  storeStableId: string,
): Promise<StoreHoursResponse> {
  return apiFetch<StoreHoursResponse>(staffStorePath(storeStableId, 'hours'));
}

export function updateAdminStoreHours(
  hours: StoreBusinessHourView[],
  storeStableId: string,
): Promise<StoreHoursResponse> {
  return apiFetch<StoreHoursResponse>(staffStorePath(storeStableId, 'hours'), {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ hours }),
  });
}

export function fetchStaffStoreHolidays(
  storeStableId: string,
): Promise<StoreHolidaysResponse> {
  return apiFetch<StoreHolidaysResponse>(staffStorePath(storeStableId, 'holidays'));
}

export function updateAdminStoreHolidays(
  holidays: StoreHolidayView[],
  storeStableId: string,
): Promise<StoreHolidaysResponse> {
  return apiFetch<StoreHolidaysResponse>(staffStorePath(storeStableId, 'holidays'), {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ holidays }),
  });
}
