import type { UberServiceAvailability } from './uber-payload.utils';

export type UberMenuPublishError = {
  code: string;
  path: string | null;
  message: string;
  entityType?: 'item' | 'category' | 'modifier';
  localId?: string;
};

export type UberAuthenticationError = {
  upstreamStatus: number;
  code: string;
  message: string;
};

export type UberStoreScopedInput = {
  /** Uber store id. Used by Uber-scoped draft/configuration endpoints. */
  storeId?: string;
};

export type UberPreparationType = 'PREPARED' | 'PREPACKAGED';

export const readUberPreparationType = (
  value: unknown,
): UberPreparationType | null =>
  value === 'PREPARED' || value === 'PREPACKAGED' ? value : null;

export type UpsertPriceBookItemInput = UberStoreScopedInput & {
  menuItemStableId: string;
  priceCents: number;
  isAvailable?: boolean;
  displayName?: string;
  displayDescription?: string;
  preparationType?: UberPreparationType;
};

export type UpsertOptionItemConfigInput = UberStoreScopedInput & {
  optionChoiceStableId: string;
  priceDeltaCents?: number;
  isAvailable?: boolean;
  displayName?: string;
  displayDescription?: string;
  preparationType?: UberPreparationType;
};

export type UpdateDraftItemInput = UberStoreScopedInput & {
  displayName?: string;
  displayDescription?: string;
  priceCents?: number;
  isAvailable?: boolean;
  preparationType?: UberPreparationType;
  sortOrder?: number;
};

export type UpdateDraftGroupInput = UberStoreScopedInput & {
  name?: string;
  minSelect?: number;
  maxSelect?: number;
  required?: boolean;
  sortOrder?: number;
};

export type UpdateDraftOptionInput = UberStoreScopedInput & {
  displayName?: string;
  priceDeltaCents?: number;
  isAvailable?: boolean;
  preparationType?: UberPreparationType;
  sortOrder?: number;
};

export type PublishMenuInput = {
  /** Internal/POS store id (also the cloud print-task room id), not an Uber store id. */
  storeId?: string;
  dryRun?: boolean;
  timezoneConfirmed?: boolean;
  taxRateConfirmed?: boolean;
  /** Canonical payload fingerprint returned by the reviewed dry-run. */
  safetyFingerprint?: string;
  excludedCategoryIds?: string[];
  excludedGroupIds?: string[];
  excludedMenuItemStableIds?: string[];
  excludedOptionChoiceStableIds?: string[];
};

export type UberValueSource = 'UBER_OVERRIDE' | 'SANQ_SOURCE';

export type UberMenuPublishRisk = {
  severity: 'INFO' | 'WARNING' | 'CRITICAL';
  code:
    | 'PUBLISHED_OVERRIDE_FALLBACK'
    | 'RESOURCE_DELETED'
    | 'MASS_CONFIGURATION_LOSS';
  entityType: 'ITEM' | 'OPTION_ITEM' | 'CATEGORY' | 'MODIFIER_GROUP';
  entityId: string;
  field: string;
  previousValue: unknown;
  currentValue: unknown;
  sourceValue?: unknown;
  intentional?: boolean;
};

type UberCategoryEntityRef = {
  id: string;
  type: 'ITEM';
};

type UberModifierOptionRef = {
  id: string;
  type: 'ITEM';
};

export type UberMenuUploadPayload = {
  display_options: {
    /** Uber wire flag; SanQ validation requires false because item instructions are supported. */
    disable_item_instructions: boolean;
  };
  menus: Array<{
    id: string;
    title: { translations: { en_us: string } };
    category_ids: string[];
    service_availability: UberServiceAvailability[];
  }>;
  categories: Array<{
    id: string;
    title: { translations: { en_us: string } };
    entities: UberCategoryEntityRef[];
  }>;
  items: Array<{
    id: string;
    title: { translations: { en_us: string } };
    description?: { translations: { en_us: string } };
    price_info: { price: number; overrides: [] };
    tax_info: { tax_rate: number; vat_rate_percentage: null };
    dish_info: {
      classifications: { preparation_type: '' | 'PREPACKAGED' };
    };
    modifier_group_ids: { ids: string[] | null; overrides: [] };
    suspension_info: null | {
      suspension: { suspend_until: number; reason: string };
    };
    image_url?: string;
  }>;
  modifier_groups: Array<{
    id: string;
    title: { translations: { en_us: string } };
    quantity_info: {
      quantity: { min_permitted: number; max_permitted: number };
    };
    modifier_options: UberModifierOptionRef[];
  }>;
};

export type UberMenuGraphValidationIssue = {
  code: string;
  message: string;
  severity?: 'ERROR' | 'WARNING';
  path?: string;
  sourceStableId?: string;
  itemId?: string;
  itemStableId?: string;
  groupId?: string;
  groupStableId?: string;
  optionItemId?: string;
};

export const UBER_IMAGE_URL_MAX_LENGTH = 2_000;
export const UBER_IMAGE_MAX_BYTES = 10 * 1024 * 1024;
const EXPIRING_IMAGE_QUERY_KEYS = new Set([
  'expires',
  'x-amz-expires',
  'x-amz-signature',
  'signature',
  'token',
]);

export function isPermanentPublicHttpsUrl(value: string): boolean {
  if (!value || value.length > UBER_IMAGE_URL_MAX_LENGTH) return false;
  try {
    const url = new URL(value);
    if (url.protocol !== 'https:' || url.username || url.password) return false;
    const hostname = url.hostname.toLowerCase().replace(/^\[|\]$/g, '');
    if (
      hostname === 'localhost' ||
      hostname.endsWith('.localhost') ||
      hostname.endsWith('.local') ||
      hostname === '::1' ||
      hostname.startsWith('fc') ||
      hostname.startsWith('fd') ||
      hostname.startsWith('fe80:')
    )
      return false;
    const octets = hostname.split('.').map(Number);
    if (
      octets.length === 4 &&
      octets.every(
        (part) => Number.isInteger(part) && part >= 0 && part <= 255,
      ) &&
      (octets[0] === 10 ||
        octets[0] === 127 ||
        octets[0] === 0 ||
        (octets[0] === 169 && octets[1] === 254) ||
        (octets[0] === 172 && octets[1] >= 16 && octets[1] <= 31) ||
        (octets[0] === 192 && octets[1] === 168))
    )
      return false;
    return !Array.from(url.searchParams.keys()).some((key) =>
      EXPIRING_IMAGE_QUERY_KEYS.has(key.toLowerCase()),
    );
  } catch {
    return false;
  }
}

/** Convert the site's stored image path into the public URL Uber can fetch. */
export type SyncAvailabilityInput = UberStoreScopedInput & {
  menuItemStableId: string;
  isAvailable: boolean;
};

export type UberAvailabilitySyncStatus =
  | 'SYNCED'
  | 'PENDING'
  | 'SKIPPED_NOT_PUBLISHED'
  | 'FAILED';

export type UberAvailabilitySyncResult = {
  status: UberAvailabilitySyncStatus;
  stores: Array<{
    storeId: string;
    uberStoreId: string | null;
    status: UberAvailabilitySyncStatus;
    versionStableId?: string;
    error?: string;
  }>;
};

export type SyncOptionAvailabilityInput = UberStoreScopedInput & {
  optionChoiceStableId: string;
  isAvailable: boolean;
};
