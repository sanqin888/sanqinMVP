import { BadRequestException } from '@nestjs/common';

export type LocalBusinessHour = {
  weekday: number;
  openMinutes: number | null;
  closeMinutes: number | null;
  isClosed: boolean;
};

export type UberServiceAvailability = {
  day_of_week: string;
  time_periods: Array<{ start_time: string; end_time: string }>;
};

const UBER_WEEKDAYS = [
  'SUNDAY',
  'MONDAY',
  'TUESDAY',
  'WEDNESDAY',
  'THURSDAY',
  'FRIDAY',
  'SATURDAY',
] as const;

/** Convert recurring store-local hours without applying the server/UTC clock. */
export function toUberServiceAvailability(
  hours: LocalBusinessHour[],
  timezone: string,
): UberServiceAvailability[] {
  try {
    new Intl.DateTimeFormat('en-US', { timeZone: timezone }).format();
  } catch {
    throw new BadRequestException(`门店时区无效：${timezone}`);
  }

  const periods = Array.from(
    { length: 7 },
    () =>
      [] as Array<{
        start_time: string;
        end_time: string;
      }>,
  );
  const format = (minutes: number) =>
    `${String(Math.floor(minutes / 60)).padStart(2, '0')}:${String(minutes % 60).padStart(2, '0')}`;

  for (const hour of hours) {
    if (hour.isClosed) continue;
    if (
      !Number.isInteger(hour.weekday) ||
      hour.weekday < 0 ||
      hour.weekday > 6 ||
      hour.openMinutes === null ||
      hour.closeMinutes === null ||
      !Number.isInteger(hour.openMinutes) ||
      !Number.isInteger(hour.closeMinutes) ||
      hour.openMinutes < 0 ||
      hour.openMinutes > 1439 ||
      hour.closeMinutes < 0 ||
      hour.closeMinutes > 1440
    )
      continue;

    const start = hour.openMinutes;
    const end = hour.closeMinutes;
    // Uber uses 24:00 as the exclusive end of a local day. 23:59 would leave
    // a one-minute gap in split and full-day ranges.
    if (start === end || (start === 0 && end === 1440)) {
      periods[hour.weekday].push({ start_time: '00:00', end_time: '24:00' });
    } else if (start < end) {
      periods[hour.weekday].push({
        start_time: format(start),
        end_time: end === 1440 ? '24:00' : format(end),
      });
    } else {
      periods[hour.weekday].push({
        start_time: format(start),
        end_time: '24:00',
      });
      periods[(hour.weekday + 1) % 7].push({
        start_time: '00:00',
        end_time: format(end),
      });
    }
  }

  return periods.flatMap((time_periods, weekday) =>
    time_periods.length
      ? [{ day_of_week: UBER_WEEKDAYS[weekday].toLowerCase(), time_periods }]
      : [],
  );
}

type UberMenuGraphValidationIssue = {
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

export type UberMenuPayloadValidationIssue = {
  code: string;
  severity: 'ERROR' | 'WARNING';
  path: string;
  sourceStableId: string | null;
  message: string;
};

const UBER_IMAGE_URL_MAX_LENGTH = 2_000;
const UBER_IMAGE_MAX_BYTES = 10 * 1024 * 1024;
export const UBER_ITEM_DESCRIPTION_MAX_LENGTH = 300;
const EXPIRING_IMAGE_QUERY_KEYS = new Set([
  'expires',
  'x-amz-expires',
  'x-amz-signature',
  'signature',
  'token',
]);

function isPermanentPublicHttpsUrl(value: string): boolean {
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
export function resolveUberImageUrl(value: string | null): string | null {
  const imageUrl = value?.trim();
  if (!imageUrl) return null;
  if (!imageUrl.startsWith('/')) return imageUrl;

  const publicBaseUrl =
    process.env.PUBLIC_BASE_URL?.trim() ||
    process.env.WEB_BASE_URL?.trim() ||
    'https://sanq.ca';
  try {
    return new URL(imageUrl, publicBaseUrl).toString();
  } catch {
    // Keep the invalid value so payload validation blocks the publish instead
    // of silently dropping the image from the menu.
    return imageUrl;
  }
}

type SyncAvailabilityInput = {
  storeId?: string;
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
