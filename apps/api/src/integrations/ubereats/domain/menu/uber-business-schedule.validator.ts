import { toUberServiceAvailability } from './uber-payload.utils';

type BusinessScheduleInput = {
  timezone: string | null;
  salesTaxRate: number | null;
  hours: Array<{
    weekday: number;
    openMinutes: number | null;
    closeMinutes: number | null;
    isClosed: boolean;
  }>;
};

export type UberBusinessScheduleValidation =
  | {
      valid: true;
      timezone: string;
      serviceAvailability: ReturnType<typeof toUberServiceAvailability>;
      taxRatePercentage: number;
    }
  | { valid: false; message: string };

/** Pure validation: callers decide which application error to expose. */
export function validateUberBusinessSchedule(
  schedule: BusinessScheduleInput | null,
): UberBusinessScheduleValidation {
  const timezone = schedule?.timezone?.trim();
  if (!timezone) {
    return { valid: false, message: '发布 Uber 菜单前必须配置门店时区。' };
  }
  if (/^(?:UTC|GMT)?[+-]\d{1,2}(?::?\d{2})?$/i.test(timezone)) {
    return {
      valid: false,
      message:
        '夏令时地区不得使用固定 UTC offset，请配置 IANA timezone（例如 America/Toronto）。',
    };
  }
  const taxRate = schedule?.salesTaxRate;
  if (
    typeof taxRate !== 'number' ||
    !Number.isFinite(taxRate) ||
    taxRate < 0 ||
    taxRate > 1
  ) {
    return {
      valid: false,
      message: 'salesTaxRate 必须使用 0～1 的比例格式，例如 13% 应保存为 0.13',
    };
  }
  const serviceAvailability = toUberServiceAvailability(
    schedule!.hours,
    timezone,
  );
  if (serviceAvailability.length === 0) {
    return {
      valid: false,
      message:
        '发布 Uber 菜单前必须至少配置一个合法可售营业时段；全天营业请明确配置 00:00–24:00。',
    };
  }
  return {
    valid: true,
    timezone,
    serviceAvailability,
    taxRatePercentage: Number((taxRate * 100).toFixed(4)),
  };
}

export function validateUberStoreTimezone(input: {
  businessTimezone: string;
  uberTimezone: string | null;
  timezoneConfirmed: boolean;
}): string | null {
  if (input.uberTimezone && input.uberTimezone !== input.businessTimezone) {
    return `BusinessConfig.timezone（${input.businessTimezone}）与 Uber 门店时区（${input.uberTimezone}）不一致，已阻止正式发布。`;
  }
  if (!input.uberTimezone && !input.timezoneConfirmed) {
    return `Uber API 未返回门店时区；请在管理页确认 Uber 门店使用 ${input.businessTimezone} 后再正式发布。`;
  }
  return null;
}
