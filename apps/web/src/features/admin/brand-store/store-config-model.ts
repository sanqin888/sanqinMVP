import type { StoreConfigView } from '@/lib/api/brand-store';
import { centsToCad, rateToPercent } from './settings-utils';

export const COMMON_TIMEZONES = [
  'America/Toronto',
  'America/Vancouver',
  'America/Edmonton',
  'America/Winnipeg',
  'America/Halifax',
  'America/St_Johns',
  'UTC',
] as const;

export const ALLERGY_OPTIONS = [
  { code: 'GLUTEN', zh: '小麦（及含麸质谷物）', en: 'Wheat / gluten' },
  { code: 'PEANUTS', zh: '花生', en: 'Peanuts' },
  { code: 'TREENUTS', zh: '坚果类', en: 'Tree nuts' },
  { code: 'SESAME', zh: '芝麻', en: 'Sesame' },
  { code: 'EGGS', zh: '鸡蛋', en: 'Eggs' },
  { code: 'DAIRY', zh: '牛奶 / 乳制品', en: 'Milk / dairy' },
  { code: 'SOY', zh: '大豆', en: 'Soy' },
  { code: 'SULPHITES', zh: '亚硫酸盐', en: 'Sulphites' },
  { code: 'SHELLFISH', zh: '甲壳类（例如虾）', en: 'Crustaceans / shellfish' },
] as const;

export type StoreDraft = {
  timezone: string;
  isTemporarilyClosed: boolean;
  temporaryCloseReason: string;
  publicNotice: string;
  publicNoticeEn: string;
  deliveryBaseFeeCad: string;
  priorityPerKmCad: string;
  maxDeliveryRangeKm: string;
  priorityDefaultDistanceKm: string;
  latitude: string;
  longitude: string;
  addressLine1: string;
  addressLine2: string;
  city: string;
  province: string;
  postalCode: string;
  countryCode: string;
  phone: string;
  contactName: string;
  salesTaxPercent: string;
  enableUberDirect: boolean;
  autoAcceptOnlineOrders: boolean;
  allergyHandlingMode: StoreConfigView['allergyHandlingMode'];
  unsupportedAllergens: string[];
};

export type StoreDraftUpdate = <K extends keyof StoreDraft>(
  key: K,
  value: StoreDraft[K],
) => void;

export function toStoreDraft(config: StoreConfigView): StoreDraft {
  return {
    timezone: config.timezone,
    isTemporarilyClosed: config.isTemporarilyClosed,
    temporaryCloseReason: config.temporaryCloseReason ?? '',
    publicNotice: config.publicNotice ?? '',
    publicNoticeEn: config.publicNoticeEn ?? '',
    deliveryBaseFeeCad: centsToCad(config.deliveryBaseFeeCents),
    priorityPerKmCad: centsToCad(config.priorityPerKmCents),
    maxDeliveryRangeKm: String(config.maxDeliveryRangeKm),
    priorityDefaultDistanceKm: String(config.priorityDefaultDistanceKm),
    latitude: config.latitude == null ? '' : String(config.latitude),
    longitude: config.longitude == null ? '' : String(config.longitude),
    addressLine1: config.addressLine1 ?? '',
    addressLine2: config.addressLine2 ?? '',
    city: config.city ?? '',
    province: config.province ?? '',
    postalCode: config.postalCode ?? '',
    countryCode: config.countryCode,
    phone: config.phone ?? '',
    contactName: config.contactName ?? '',
    salesTaxPercent: rateToPercent(config.salesTaxRate),
    enableUberDirect: config.enableUberDirect,
    autoAcceptOnlineOrders: config.autoAcceptOnlineOrders,
    allergyHandlingMode: config.allergyHandlingMode,
    unsupportedAllergens: [...config.unsupportedAllergens],
  };
}
