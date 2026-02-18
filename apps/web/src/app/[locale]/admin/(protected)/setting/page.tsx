//apps/web/src/app/[locale]/admin/(protected)/setting/page.tsx
'use client';

import { useEffect, useMemo, useState } from 'react';
import { useParams } from 'next/navigation';
import type { Locale } from '@/lib/i18n/locales';
import { apiFetch } from '@/lib/api/client';

/** ===== 类型定义 ===== */

type BusinessHourDto = {
  weekday: number; // 0=Sunday ... 6=Saturday
  openMinutes: number | null;
  closeMinutes: number | null;
  isClosed: boolean;
};

type BusinessHoursResponse = {
  hours: BusinessHourDto[];
};

// 后端 BusinessConfigResponse 中我们只用到这些字段
type HolidayApiDto = {
  date: string; // 'YYYY-MM-DD'
  name?: string;
  isClosed: boolean;
  openMinutes: number | null;
  closeMinutes: number | null;
};
type HolidayUiDto = HolidayApiDto & {
  clientKey: string;
};

type BusinessConfigDto = {
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
  earnPtPerDollar: number;
  redeemDollarPerPoint: number;
  referralPtPerDollar: number;
  tierMultiplierBronze: number;
  tierMultiplierSilver: number;
  tierMultiplierGold: number;
  tierMultiplierPlatinum: number;
  tierThresholdSilver: number;
  tierThresholdGold: number;
  tierThresholdPlatinum: number;
  enableUberDirect: boolean;
  holidays: HolidayApiDto[];
};

type SaveHoursPayload = {
  hours: {
    weekday: number;
    openMinutes: number | null;
    closeMinutes: number | null;
    isClosed: boolean;
  }[];
};

const WEEKDAY_LABELS_ZH = ['周日', '周一', '周二', '周三', '周四', '周五', '周六'];
const WEEKDAY_LABELS_EN = [
  'Sunday',
  'Monday',
  'Tuesday',
  'Wednesday',
  'Thursday',
  'Friday',
  'Saturday',
];

const COMMON_TIMEZONES = [
  "America/Toronto",
  "America/Vancouver",
  "America/Edmonton",
  "America/Winnipeg",
  "America/Halifax",
  "America/St_Johns",
  "UTC",
] as const;

/** ===== 时间换算工具 ===== */

function minutesToTimeString(mins: number | null | undefined): string {
  if (mins == null || Number.isNaN(mins)) return '';
  const hh = Math.floor(mins / 60);
  const mm = mins % 60;
  const hhStr = hh.toString().padStart(2, '0');
  const mmStr = mm.toString().padStart(2, '0');
  return `${hhStr}:${mmStr}`;
}

function timeStringToMinutes(value: string): number | null {
  const trimmed = value.trim();
  if (!trimmed) return null;
  const match = /^(\d{1,2}):(\d{2})$/.exec(trimmed);
  if (!match) return null;

  const hh = Number(match[1]);
  const mm = Number(match[2]);

  if (!Number.isFinite(hh) || !Number.isFinite(mm)) return null;

  // ✅ 允许 24:00 -> 1440（后端 normalizeMinutes 允许 1440）
  if (hh === 24 && mm === 0) return 24 * 60;

  if (hh < 0 || hh > 23 || mm < 0 || mm > 59) return null;

  return hh * 60 + mm;
}

function centsToDollarString(cents: number | null | undefined): string {
  if (cents == null || Number.isNaN(cents)) return '';
  return (cents / 100).toFixed(2);
}

function parseDollarToCents(value: string): number | null {
  const num = Number(value);
  if (!Number.isFinite(num) || num < 0) return null;
  return Math.round(num * 100);
}

function rateToPercentString(rate: number | null | undefined): string {
  if (rate == null || Number.isNaN(rate)) return '';
  return (rate * 100).toFixed(2);
}

function parsePercentToRate(value: string): number | null {
  const num = Number(value);
  if (!Number.isFinite(num) || num < 0) return null;
  const rate = num / 100;
  if (rate > 1) return null;
  return Number(rate.toFixed(4));
}

function parseOptionalNumber(value: string): number | null {
  const trimmed = value.trim();
  if (!trimmed) return null;
  const num = Number(trimmed);
  if (!Number.isFinite(num)) return null;
  return num;
}

function toHolidayUi(list: HolidayApiDto[]): HolidayUiDto[] {
  return (list ?? []).map((h, idx) => ({
    ...h,
    // 保证唯一；即使重复日期也不会冲突
    clientKey: `${h.date || 'empty'}:${idx}`,
  }));
}

/** ===== 页面组件 ===== */

export default function AdminHoursPage() {
  const { locale } = useParams<{ locale: Locale }>();
  const isZh = locale === 'zh';

  const [config, setConfig] = useState<BusinessConfigDto | null>(null);
  const [hours, setHours] = useState<BusinessHourDto[]>([]);
  const [holidays, setHolidays] = useState<HolidayUiDto[]>([]);

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  const weekdayLabels = useMemo(
    () => (isZh ? WEEKDAY_LABELS_ZH : WEEKDAY_LABELS_EN),
    [isZh],
  );

  // 初次加载配置 + 每周营业时间 + 节假日
  useEffect(() => {
    let cancelled = false;

    async function load() {
      setLoading(true);
      setError(null);
      setSuccess(null);

      try {
        const [configRes, hoursRes] = await Promise.all([
          apiFetch<BusinessConfigDto>('/admin/business/config'),
          apiFetch<BusinessHoursResponse>('/admin/business/hours'),
        ]);

        if (cancelled) return;

        setConfig(configRes);

        const sortedHours = [...hoursRes.hours].sort(
          (a, b) => a.weekday - b.weekday,
        );
        setHours(sortedHours);

const uiHolidays = toHolidayUi(configRes.holidays ?? []).slice().sort((a, b) => {
  // 空日期放到最后（新增未填日期更合理）
  if (!a.date && b.date) return 1;
  if (a.date && !b.date) return -1;

  if (a.date < b.date) return -1;
  if (a.date > b.date) return 1;
  return a.clientKey.localeCompare(b.clientKey);
});
setHolidays(uiHolidays);
      } catch (e) {
        if (cancelled) return;
        console.error(e);
        setError(
          isZh
            ? '加载营业时间或节假日失败，请稍后重试。'
            : 'Failed to load business hours or holidays. Please try again.',
        );
      } finally {
        if (!cancelled) {
          setLoading(false);
        }
      }
    }

    void load();

    return () => {
      cancelled = true;
    };
  }, [isZh]);

  /** ===== 每周营业时间相关 handler ===== */

const handleToggleClosed = (index: number, checked: boolean) => {
  setHours((prev) => {
    const next = [...prev];
    const cur = next[index];
    if (!cur) return prev;

    const h: BusinessHourDto = { ...cur, isClosed: checked };

    if (checked) {
      // 休息日：清空时间更语义化（后端会忽略）
      h.openMinutes = null;
      h.closeMinutes = null;
    } else {
      // ✅ 切回营业：给一个默认时间，避免 0-0 导致后端 open>=close 报错
      const defaultOpen = 11 * 60;
      const defaultClose = 21 * 60;

      const open = typeof h.openMinutes === 'number' ? h.openMinutes : null;
      const close = typeof h.closeMinutes === 'number' ? h.closeMinutes : null;

      if (open == null) h.openMinutes = defaultOpen;
      if (close == null || (h.openMinutes != null && close <= h.openMinutes)) {
        h.closeMinutes = defaultClose;
      }
    }

    next[index] = h;
    return next;
  });
};

const handleTimeChange = (
  index: number,
  field: 'openMinutes' | 'closeMinutes',
  value: string,
) => {
  const mins = timeStringToMinutes(value);
  if (mins == null) return;

  setHours((prev) => {
    const next = [...prev];
    const h = { ...next[index] };
    h[field] = mins;
    next[index] = h;
    return next;
  });
};

  /** ===== 门店状态（临时暂停接单） handler ===== */

  const handleConfigToggleClosed = (checked: boolean) => {
    setConfig((prev) =>
      prev ? { ...prev, isTemporarilyClosed: checked } : prev,
    );
  };

  const handleConfigReasonChange = (value: string) => {
    setConfig((prev) =>
      prev ? { ...prev, temporaryCloseReason: value } : prev,
    );
  };

  const handleBaseFeeChange = (value: string) => {
    const cents = parseDollarToCents(value);
    if (cents == null) return;
    setConfig((prev) =>
      prev ? { ...prev, deliveryBaseFeeCents: cents } : prev,
    );
  };

  const handlePerKmChange = (value: string) => {
    const cents = parseDollarToCents(value);
    if (cents == null) return;
    setConfig((prev) =>
      prev ? { ...prev, priorityPerKmCents: cents } : prev,
    );
  };

  const handleMaxRangeChange = (value: string) => {
    const num = parseOptionalNumber(value);
    if (num == null || num < 0) return;
    setConfig((prev) => (prev ? { ...prev, maxDeliveryRangeKm: num } : prev));
  };

  const handlePriorityDistanceChange = (value: string) => {
    const num = parseOptionalNumber(value);
    if (num == null || num < 0) return;
    setConfig((prev) =>
      prev ? { ...prev, priorityDefaultDistanceKm: num } : prev,
    );
  };

  const handleStoreLatitudeChange = (value: string) => {
    const num = parseOptionalNumber(value);
    if (num == null) {
      setConfig((prev) => (prev ? { ...prev, storeLatitude: null } : prev));
      return;
    }
    setConfig((prev) => (prev ? { ...prev, storeLatitude: num } : prev));
  };

  const handleStoreLongitudeChange = (value: string) => {
    const num = parseOptionalNumber(value);
    if (num == null) {
      setConfig((prev) => (prev ? { ...prev, storeLongitude: null } : prev));
      return;
    }
    setConfig((prev) => (prev ? { ...prev, storeLongitude: num } : prev));
  };

  const handleStoreAddressLine1Change = (value: string) => {
    setConfig((prev) =>
      prev ? { ...prev, storeAddressLine1: value } : prev,
    );
  };

  const handleStoreAddressLine2Change = (value: string) => {
    setConfig((prev) =>
      prev ? { ...prev, storeAddressLine2: value } : prev,
    );
  };

  const handleStoreCityChange = (value: string) => {
    setConfig((prev) => (prev ? { ...prev, storeCity: value } : prev));
  };

  const handleStoreProvinceChange = (value: string) => {
    setConfig((prev) => (prev ? { ...prev, storeProvince: value } : prev));
  };

  const handleStorePostalCodeChange = (value: string) => {
    setConfig((prev) =>
      prev ? { ...prev, storePostalCode: value } : prev,
    );
  };

  const handleSupportPhoneChange = (value: string) => {
    setConfig((prev) => (prev ? { ...prev, supportPhone: value } : prev));
  };

  const handleSupportEmailChange = (value: string) => {
    setConfig((prev) => (prev ? { ...prev, supportEmail: value } : prev));
  };

  const handleBrandNameZhChange = (value: string) => {
    setConfig((prev) => (prev ? { ...prev, brandNameZh: value } : prev));
  };

  const handleBrandNameEnChange = (value: string) => {
    setConfig((prev) => (prev ? { ...prev, brandNameEn: value } : prev));
  };

  const handleSiteUrlChange = (value: string) => {
    setConfig((prev) => (prev ? { ...prev, siteUrl: value } : prev));
  };

  const handleEmailFromNameZhChange = (value: string) => {
    setConfig((prev) => (prev ? { ...prev, emailFromNameZh: value } : prev));
  };

  const handleEmailFromNameEnChange = (value: string) => {
    setConfig((prev) => (prev ? { ...prev, emailFromNameEn: value } : prev));
  };

  const handleEmailFromAddressChange = (value: string) => {
    setConfig((prev) => (prev ? { ...prev, emailFromAddress: value } : prev));
  };

  const handleSmsSignatureChange = (value: string) => {
    setConfig((prev) => (prev ? { ...prev, smsSignature: value } : prev));
  };

  const handleTaxRateChange = (value: string) => {
    const rate = parsePercentToRate(value);
    if (rate == null) return;
    setConfig((prev) => (prev ? { ...prev, salesTaxRate: rate } : prev));
  };

  const handleWechatAlipayRateChange = (value: string) => {
    const num = parseOptionalNumber(value);
    if (num == null || num <= 0) return;
    setConfig((prev) =>
      prev ? { ...prev, wechatAlipayExchangeRate: num } : prev,
    );
  };

  const handleTimezoneChange = (value: string) => {
    setConfig((prev) => (prev ? { ...prev, timezone: value } : prev));
  };


  const handleUberToggle = (checked: boolean) => {
    setConfig((prev) => (prev ? { ...prev, enableUberDirect: checked } : prev));
  };

  /** ===== 节假日相关 handler ===== */

  const handleHolidayFieldChange = (
    index: number,
    field: 'date' | 'name',
    value: string,
  ) => {
    setHolidays((prev) => {
      const next = [...prev];
      const h = { ...next[index] };
      if (field === 'date') {
        h.date = value;
      } else {
        h.name = value;
      }
      next[index] = h;
      return next;
    });
  };

  const handleHolidayToggleClosed = (index: number, checked: boolean) => {
    setHolidays((prev) => {
      const next = [...prev];
      const h = { ...next[index], isClosed: checked };

      if (checked) {
        // 休息日：不需要营业时间
        h.openMinutes = null;
        h.closeMinutes = null;
      } else {
        // 特殊营业日：给一个默认时间（11:00-21:00），方便修改
        if (h.openMinutes == null) h.openMinutes = 11 * 60;
        if (h.closeMinutes == null || h.closeMinutes <= h.openMinutes) {
          h.closeMinutes = 21 * 60;
        }
      }

      next[index] = h;
      return next;
    });
  };

  const handleHolidayTimeChange = (
    index: number,
    field: 'openMinutes' | 'closeMinutes',
    value: string,
  ) => {
    const mins = timeStringToMinutes(value);
    if (mins == null) return;

    setHolidays((prev) => {
      const next = [...prev];
      const h = { ...next[index] };
      h[field] = mins;
      next[index] = h;
      return next;
    });
  };

const handleAddHoliday = () => {
  const clientKey =
    globalThis.crypto?.randomUUID?.() ?? `${Date.now()}-${Math.random()}`;

  setHolidays((prev) => [
    ...prev,
    {
      clientKey,
      date: '',
      name: '',
      isClosed: true,
      openMinutes: null,
      closeMinutes: null,
    },
  ]);
};

  const handleDeleteHoliday = (index: number) => {
    setHolidays((prev) => prev.filter((_, i) => i !== index));
  };

  /** ===== 保存按钮：统一提交三块配置 ===== */

  const handleSave = async () => {
    if (!config) return;

// ===== 保存前校验：避免后端直接 400 =====

// 1) hours：营业日必须有合法 open/close 且 open < close
const badHourIndex = hours.findIndex(
  (h) =>
    !h.isClosed &&
    (h.openMinutes == null ||
      h.closeMinutes == null ||
      h.openMinutes >= h.closeMinutes),
);
if (badHourIndex >= 0) {
  setError(
    isZh
      ? `每周营业时间第 ${badHourIndex + 1} 行时间不合法（开门必须早于打烊）。`
      : `Invalid weekly hours at row ${badHourIndex + 1} (open must be earlier than close).`,
  );
  return;
}

// 2) holidays：date 不能为空；特殊营业日必须 open/close 且 open < close
const badHolidayIndex = holidays.findIndex((h) => {
  const dateOk = typeof h.date === 'string' && h.date.trim().length > 0;
  if (!dateOk) return true;

  if (!h.isClosed) {
    return (
      h.openMinutes == null ||
      h.closeMinutes == null ||
      h.openMinutes >= h.closeMinutes
    );
  }
  return false;
});
if (badHolidayIndex >= 0) {
  setError(
    isZh
      ? `节假日第 ${badHolidayIndex + 1} 行未填写日期或时间不合法。`
      : `Invalid holidays at row ${badHolidayIndex + 1}: missing date or invalid hours.`,
  );
  return;
}

    setSaving(true);
    setError(null);
    setSuccess(null);

    try {
      // 1. 保存每周营业时间（/admin/business/hours）
const hoursPayload: SaveHoursPayload = {
  hours: hours.map((h) => ({
    weekday: h.weekday,
    openMinutes: h.isClosed ? null : (h.openMinutes ?? 0),
    closeMinutes: h.isClosed ? null : (h.closeMinutes ?? 0),
    isClosed: h.isClosed,
  })),
};

await apiFetch('/admin/business/hours', {
  method: 'PUT',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify(hoursPayload),
});

      // 2. 保存门店临时关闭状态（/admin/business/config）
      await apiFetch<BusinessConfigDto>('/admin/business/config', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          timezone: config.timezone,
          isTemporarilyClosed: config.isTemporarilyClosed,
          // 和后端 updateTemporaryClose 保持一致，用 reason
          reason: config.temporaryCloseReason ?? null,
          deliveryBaseFeeCents: config.deliveryBaseFeeCents,
          priorityPerKmCents: config.priorityPerKmCents,
          maxDeliveryRangeKm: config.maxDeliveryRangeKm,
          priorityDefaultDistanceKm: config.priorityDefaultDistanceKm,
          storeLatitude: config.storeLatitude,
          storeLongitude: config.storeLongitude,
          storeAddressLine1: config.storeAddressLine1 ?? null,
          storeAddressLine2: config.storeAddressLine2 ?? null,
          storeCity: config.storeCity ?? null,
          storeProvince: config.storeProvince ?? null,
          storePostalCode: config.storePostalCode ?? null,
          supportPhone: config.supportPhone ?? null,
          supportEmail: config.supportEmail ?? null,
          brandNameZh: config.brandNameZh ?? null,
          brandNameEn: config.brandNameEn ?? null,
          siteUrl: config.siteUrl ?? null,
          emailFromNameZh: config.emailFromNameZh ?? null,
          emailFromNameEn: config.emailFromNameEn ?? null,
          emailFromAddress: config.emailFromAddress ?? null,
          smsSignature: config.smsSignature ?? null,
          salesTaxRate: config.salesTaxRate,
          wechatAlipayExchangeRate: config.wechatAlipayExchangeRate,
          earnPtPerDollar: config.earnPtPerDollar,
          redeemDollarPerPoint: config.redeemDollarPerPoint,
          referralPtPerDollar: config.referralPtPerDollar,
          tierThresholdSilver: config.tierThresholdSilver,
          tierThresholdGold: config.tierThresholdGold,
          tierThresholdPlatinum: config.tierThresholdPlatinum,
          enableUberDirect: config.enableUberDirect,
        }),
      });

      // 3. 保存节假日（/admin/business/holidays，覆盖式）
const holidaysPayload = {
  holidays: holidays.map((h) => {
    // ✅ 明确剥离 clientKey，避免未来误带字段
    const { clientKey, ...rest } = h;
    void clientKey;

    const name =
      typeof rest.name === 'string' && rest.name.trim().length > 0
        ? rest.name.trim()
        : undefined;

    return {
      date: rest.date,
      ...(name ? { name } : {}),
      isClosed: rest.isClosed,
      // ✅ 闭店日也带字段（null）；避免后端校验“缺字段”
      openMinutes: rest.isClosed ? null : (rest.openMinutes ?? 0),
      closeMinutes: rest.isClosed ? null : (rest.closeMinutes ?? 0),
    };
  }),
};

const updatedConfig = await apiFetch<BusinessConfigDto>(
  '/admin/business/holidays',
  {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(holidaysPayload),
  },
);

      // 用后端返回的最新 holidays 覆盖本地
setConfig(updatedConfig);
setHolidays(
  toHolidayUi(updatedConfig.holidays ?? []).slice().sort((a, b) => {
    if (!a.date && b.date) return 1;
    if (a.date && !b.date) return -1;

    if (a.date < b.date) return -1;
    if (a.date > b.date) return 1;
    return a.clientKey.localeCompare(b.clientKey);
  }),
);

      setSuccess(isZh ? '保存成功。' : 'Saved successfully.');
    } catch (e) {
      console.error(e);
      setError(
        isZh
          ? '保存失败，请检查必填项是否完整，然后稍后重试。'
          : 'Failed to save settings. Please check required fields and try again.',
      );
    } finally {
      setSaving(false);
    }
  };

  /** ===== 渲染 ===== */

  if (loading) {
    return (
      <div className="p-4 text-sm text-slate-600">
        {isZh ? '加载中…' : 'Loading…'}
      </div>
    );
  }

  if (!config) {
    return (
      <div className="p-4 text-sm text-red-600">
        {isZh
          ? '无法加载门店配置，请检查后端接口。'
          : 'Failed to load store config. Please check the backend API.'}
      </div>
    );
  }

  return (
    <div className="space-y-6 pb-24">
      <h1 className="text-xl font-semibold">
        {isZh ? '门店信息设置' : 'Store settings'}
      </h1>

      {/* 门店状态（是否暂时关闭） */}
      <section className="space-y-3 rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
        <h2 className="text-sm font-semibold text-slate-900">
          {isZh ? '门店当前状态' : 'Current store status'}
        </h2>
        <p className="text-xs text-slate-600">
          {isZh
            ? '这里的“暂停接单”仅作用于顾客端点单，POS 端点餐不受影响。'
            : 'This temporary close toggle only affects customer ordering. POS ordering is not affected.'}
        </p>

        <div className="mt-2 flex items-center gap-3">
          <label className="inline-flex items-center gap-2 text-sm">
            <input
              type="checkbox"
              checked={config.isTemporarilyClosed}
              onChange={(e) => handleConfigToggleClosed(e.target.checked)}
              className="h-4 w-4 rounded border-slate-300 text-emerald-600"
            />
            <span className="font-medium text-slate-900">
              {isZh ? '暂时暂停接单' : 'Temporarily stop accepting orders'}
            </span>
          </label>
        </div>

        <div className="mt-2">
          <label className="block text-xs font-medium text-slate-600">
            {isZh ? '暂停原因（选填，展示给顾客）' : 'Reason (optional, shown to customers)'}
            <input
              type="text"
              value={config.temporaryCloseReason ?? ''}
              onChange={(e) => handleConfigReasonChange(e.target.value)}
              placeholder={
                isZh
                  ? '例如：设备维护，预计晚上 8 点恢复。'
                  : 'e.g. Maintenance, back at 8pm.'
              }
              className="mt-1 w-full rounded-2xl border border-slate-200 bg-white p-2 text-sm text-slate-700 focus:border-slate-400 focus:outline-none"
            />
          </label>
        </div>
      </section>

{/* 门店时区 */}
<section className="space-y-3 rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
  <h2 className="text-sm font-semibold text-slate-900">
    {isZh ? "门店时区" : "Store time zone"}
  </h2>
  <p className="text-xs text-slate-600">
    {isZh
      ? "用于“今日订单”、节假日、营业时间等与日期相关的计算与展示。请使用 IANA 时区名（例如 America/Toronto）。"
      : "Used for date-based logic (Today orders, holidays, hours). Please use an IANA time zone (e.g. America/Toronto)."}
  </p>

  <div className="grid gap-2 md:grid-cols-2">
    <label className="block text-xs font-medium text-slate-700">
      {isZh ? "IANA 时区名" : "IANA time zone"}
      <input
        value={config.timezone ?? ""}
        onChange={(e) => handleTimezoneChange(e.target.value)}
        list="tz-list"
        placeholder="America/Toronto"
        className="mt-1 w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-800 focus:border-slate-500 focus:outline-none"
      />
      <datalist id="tz-list">
        {COMMON_TIMEZONES.map((tz) => (
          <option key={tz} value={tz} />
        ))}
      </datalist>
    </label>

    <div className="text-xs text-slate-600">
      <div className="font-medium text-slate-700">
        {isZh ? "当前该时区时间预览" : "Preview (current time in this zone)"}
      </div>
      <div className="mt-2 rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-sm text-slate-800">
        {(() => {
          try {
            return new Intl.DateTimeFormat(isZh ? "zh-CN" : "en-US", {
              timeZone: config.timezone,
              dateStyle: "medium",
              timeStyle: "short",
            }).format(new Date());
          } catch {
            return isZh ? "时区无效（请检查拼写）" : "Invalid time zone (check spelling)";
          }
        })()}
      </div>
    </div>
  </div>
</section>

      {/* 配送费与税率配置 */}
      <section className="space-y-3 rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
        <h2 className="text-sm font-semibold text-slate-900">
          {isZh ? '配送计费与税率' : 'Delivery pricing & tax'}
        </h2>
        <p className="text-xs text-slate-600">
          {isZh
            ? '这里的基础配送费、每公里加价和税率会直接作用于下单计算，无需重新部署即可生效。'
            : 'Base delivery fee, per-km charge, and tax rate are applied to new orders immediately without redeploying.'}
        </p>

        <div className="grid grid-cols-1 gap-3 md:grid-cols-3">
          <label className="flex flex-col text-xs font-medium text-slate-700">
            <span>
              {isZh ? '基础配送费（加元）' : 'Base delivery fee (CAD)'}
            </span>
            <input
              type="number"
              min="0"
              step="0.01"
              value={centsToDollarString(config.deliveryBaseFeeCents)}
              onChange={(e) => handleBaseFeeChange(e.target.value)}
              className="mt-1 rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-800 focus:border-emerald-500 focus:outline-none"
            />
            <span className="mt-1 text-[11px] font-normal text-slate-500">
              {isZh ? '对应订单中的配送费起步价。' : 'Starting delivery fee charged to customers.'}
            </span>
          </label>

          <label className="flex flex-col text-xs font-medium text-slate-700">
            <span>
              {isZh ? '优先配送每公里加价（加元）' : 'Priority per‑km fee (CAD)'}
            </span>
            <input
              type="number"
              min="0"
              step="0.01"
              value={centsToDollarString(config.priorityPerKmCents)}
              onChange={(e) => handlePerKmChange(e.target.value)}
              className="mt-1 rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-800 focus:border-emerald-500 focus:outline-none"
            />
            <span className="mt-1 text-[11px] font-normal text-slate-500">
              {isZh
                ? '用于优先配送的动态计费（向上取整每公里）。'
                : 'Applied per charged kilometer for priority deliveries (ceil).'
              }
            </span>
          </label>

          <label className="flex flex-col text-xs font-medium text-slate-700">
            <span>
              {isZh ? '销售税率（百分比）' : 'Sales tax rate (%)'}
            </span>
            <input
              type="number"
              min="0"
              max="100"
              step="0.01"
              value={rateToPercentString(config.salesTaxRate)}
              onChange={(e) => handleTaxRateChange(e.target.value)}
              className="mt-1 rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-800 focus:border-emerald-500 focus:outline-none"
            />
            <span className="mt-1 text-[11px] font-normal text-slate-500">
              {isZh
                ? '如 13% 税率，输入 13.00。'
                : 'Enter 13.00 for a 13% tax rate.'}
            </span>
          </label>
        </div>
      </section>

      <section className="space-y-3 rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
        <h2 className="text-sm font-semibold text-slate-900">
          {isZh ? 'POS 支付汇率' : 'POS payment exchange rate'}
        </h2>
        <p className="text-xs text-slate-600">
          {isZh
            ? '用于 POS 端微信/支付宝结算的金额换算展示。'
            : 'Used for showing converted totals when POS payments use WeChat/Alipay.'}
        </p>
        <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
          <label className="flex flex-col text-xs font-medium text-slate-700">
            <span>
              {isZh ? '微信/支付宝汇率' : 'WeChat/Alipay exchange rate'}
            </span>
            <input
              type="number"
              min="0"
              step="0.0001"
              value={config.wechatAlipayExchangeRate}
              onChange={(e) => handleWechatAlipayRateChange(e.target.value)}
              className="mt-1 rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-800 focus:border-emerald-500 focus:outline-none"
            />
            <span className="mt-1 text-[11px] font-normal text-slate-500">
              {isZh
                ? '示例：1 CAD = 5.25 RMB，则填写 5.25。'
                : 'Example: 1 CAD = 5.25 RMB, enter 5.25.'}
            </span>
          </label>
        </div>
      </section>

      {/* 配送范围与门店坐标 */}
      <section className="space-y-3 rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
        <h2 className="text-sm font-semibold text-slate-900">
          {isZh ? '配送范围与门店坐标' : 'Delivery range & store location'}
        </h2>
        <p className="text-xs text-slate-600">
          {isZh
            ? '这些设置会影响动态运费与可配送范围，修改后立即生效。'
            : 'These settings drive dynamic delivery fees and service range. Changes take effect immediately.'}
        </p>

        <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
          <label className="flex flex-col text-xs font-medium text-slate-700">
            <span>{isZh ? '最大配送距离 (km)' : 'Max delivery distance (km)'}</span>
            <input
              type="number"
              min="0"
              step="0.1"
              value={config.maxDeliveryRangeKm ?? 0}
              onChange={(e) => handleMaxRangeChange(e.target.value)}
              className="mt-1 rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-800 focus:border-emerald-500 focus:outline-none"
            />
            <span className="mt-1 text-[11px] font-normal text-slate-500">
              {isZh
                ? '超过该距离的地址将无法下单。'
                : 'Orders beyond this distance will be rejected.'}
            </span>
          </label>

          <label className="flex flex-col text-xs font-medium text-slate-700">
            <span>
              {isZh ? '优先配送默认距离 (km)' : 'Priority default distance (km)'}
            </span>
            <input
              type="number"
              min="0"
              step="0.1"
              value={config.priorityDefaultDistanceKm ?? 0}
              onChange={(e) => handlePriorityDistanceChange(e.target.value)}
              className="mt-1 rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-800 focus:border-emerald-500 focus:outline-none"
            />
            <span className="mt-1 text-[11px] font-normal text-slate-500">
              {isZh
                ? '当无法计算距离时用于兜底计费。'
                : 'Fallback distance used when coords are missing.'}
            </span>
          </label>
        </div>

        <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
          <label className="flex flex-col text-xs font-medium text-slate-700">
            <span>{isZh ? '门店地址 Line 1' : 'Store address line 1'}</span>
            <input
              type="text"
              value={config.storeAddressLine1 ?? ''}
              onChange={(e) => handleStoreAddressLine1Change(e.target.value)}
              placeholder={
                isZh ? '例如：123 Main St.' : 'e.g. 123 Main St.'
              }
              className="mt-1 rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-800 focus:border-emerald-500 focus:outline-none"
            />
          </label>

          <label className="flex flex-col text-xs font-medium text-slate-700">
            <span>{isZh ? '门店地址 Line 2' : 'Store address line 2'}</span>
            <input
              type="text"
              value={config.storeAddressLine2 ?? ''}
              onChange={(e) => handleStoreAddressLine2Change(e.target.value)}
              placeholder={
                isZh ? '例如：Unit 2' : 'e.g. Unit 2'
              }
              className="mt-1 rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-800 focus:border-emerald-500 focus:outline-none"
            />
          </label>
        </div>

        <div className="grid grid-cols-1 gap-3 md:grid-cols-3">
          <label className="flex flex-col text-xs font-medium text-slate-700">
            <span>{isZh ? '门店城市' : 'Store city'}</span>
            <input
              type="text"
              value={config.storeCity ?? ''}
              onChange={(e) => handleStoreCityChange(e.target.value)}
              placeholder={isZh ? '例如：Toronto' : 'e.g. Toronto'}
              className="mt-1 rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-800 focus:border-emerald-500 focus:outline-none"
            />
          </label>

          <label className="flex flex-col text-xs font-medium text-slate-700">
            <span>{isZh ? '门店省/州' : 'Store province/state'}</span>
            <input
              type="text"
              value={config.storeProvince ?? ''}
              onChange={(e) => handleStoreProvinceChange(e.target.value)}
              placeholder={isZh ? '例如：ON' : 'e.g. ON'}
              className="mt-1 rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-800 focus:border-emerald-500 focus:outline-none"
            />
          </label>

          <label className="flex flex-col text-xs font-medium text-slate-700">
            <span>{isZh ? '门店邮编' : 'Store postal code'}</span>
            <input
              type="text"
              value={config.storePostalCode ?? ''}
              onChange={(e) => handleStorePostalCodeChange(e.target.value)}
              placeholder={isZh ? '例如：M1M 1M1' : 'e.g. M1M 1M1'}
              className="mt-1 rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-800 focus:border-emerald-500 focus:outline-none"
            />
          </label>
        </div>

        <div className="grid grid-cols-1 gap-3 md:grid-cols-3">
          <label className="flex flex-col text-xs font-medium text-slate-700">
            <span>{isZh ? '门店纬度' : 'Store latitude'}</span>
            <input
              type="number"
              step="0.000001"
              value={config.storeLatitude ?? ''}
              onChange={(e) => handleStoreLatitudeChange(e.target.value)}
              placeholder="43.6532"
              className="mt-1 rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-800 focus:border-emerald-500 focus:outline-none"
            />
          </label>

          <label className="flex flex-col text-xs font-medium text-slate-700">
            <span>{isZh ? '门店经度' : 'Store longitude'}</span>
            <input
              type="number"
              step="0.000001"
              value={config.storeLongitude ?? ''}
              onChange={(e) => handleStoreLongitudeChange(e.target.value)}
              placeholder="-79.3832"
              className="mt-1 rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-800 focus:border-emerald-500 focus:outline-none"
            />
          </label>

          <div className="flex flex-col text-xs text-slate-600">
            <span className="font-medium text-slate-700">
              {isZh ? '坐标用途' : 'Coordinate usage'}
            </span>
            <span className="mt-1 text-[11px] text-slate-500">
              {isZh
                ? '用于动态运费、配送范围与前端距离展示。'
                : 'Used for delivery fee calculation and distance display.'}
            </span>
          </div>
        </div>
      </section>

      {/* 服务开关 */}
      <section className="space-y-3 rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
        <h2 className="text-sm font-semibold text-slate-900">
          {isZh ? '第三方配送开关' : 'Delivery provider toggles'}
        </h2>
        <p className="text-xs text-slate-600">
          {isZh
            ? '关闭后该渠道将不再派单。'
            : 'Disable a provider to stop dispatching orders to it.'}
        </p>

        <label className="inline-flex items-center gap-2 text-sm">
          <input
            type="checkbox"
            checked={config.enableUberDirect}
            onChange={(e) => handleUberToggle(e.target.checked)}
            className="h-4 w-4 rounded border-slate-300 text-emerald-600"
          />
          <span className="text-slate-800">
            {isZh ? '启用 Uber Direct' : 'Enable Uber Direct'}
          </span>
        </label>
      </section>

      {/* 消息与品牌展示设置 */}
      <section className="space-y-3 rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
        <h2 className="text-sm font-semibold text-slate-900">
          {isZh ? '消息与品牌展示' : 'Messaging & brand display'}
        </h2>
        <p className="text-xs text-slate-600">
          {isZh
            ? '这些字段用于短信/邮件模板与站点展示，修改后将直接用于消息内容。'
            : 'These fields are used in SMS/email templates and site display.'}
        </p>

        <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
          <label className="flex flex-col text-xs font-medium text-slate-700">
            <span>{isZh ? '品牌名（中文）' : 'Brand name (ZH)'}</span>
            <input
              type="text"
              value={config.brandNameZh ?? ''}
              onChange={(e) => handleBrandNameZhChange(e.target.value)}
              placeholder={isZh ? '例如：三秦肉夹馍' : 'e.g. San Qin Roujiamo'}
              className="mt-1 rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-800 focus:border-emerald-500 focus:outline-none"
            />
          </label>

          <label className="flex flex-col text-xs font-medium text-slate-700">
            <span>{isZh ? '品牌名（英文）' : 'Brand name (EN)'}</span>
            <input
              type="text"
              value={config.brandNameEn ?? ''}
              onChange={(e) => handleBrandNameEnChange(e.target.value)}
              placeholder="e.g. San Qin Roujiamo"
              className="mt-1 rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-800 focus:border-emerald-500 focus:outline-none"
            />
          </label>
        </div>

        <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
          <label className="flex flex-col text-xs font-medium text-slate-700">
            <span>{isZh ? '站点网址' : 'Site URL'}</span>
            <input
              type="url"
              value={config.siteUrl ?? ''}
              onChange={(e) => handleSiteUrlChange(e.target.value)}
              placeholder="https://example.com"
              className="mt-1 rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-800 focus:border-emerald-500 focus:outline-none"
            />
          </label>

          <label className="flex flex-col text-xs font-medium text-slate-700">
            <span>{isZh ? '短信签名' : 'SMS signature'}</span>
            <input
              type="text"
              value={config.smsSignature ?? ''}
              onChange={(e) => handleSmsSignatureChange(e.target.value)}
              placeholder={isZh ? '例如：【三秦】' : 'e.g. [San Qin]'}
              className="mt-1 rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-800 focus:border-emerald-500 focus:outline-none"
            />
          </label>
        </div>

        <div className="grid grid-cols-1 gap-3 md:grid-cols-3">
          <label className="flex flex-col text-xs font-medium text-slate-700">
            <span>{isZh ? '邮件发件人名称（中文）' : 'Email from name (ZH)'}</span>
            <input
              type="text"
              value={config.emailFromNameZh ?? ''}
              onChange={(e) => handleEmailFromNameZhChange(e.target.value)}
              placeholder={isZh ? '例如：三秦肉夹馍' : 'e.g. San Qin Roujiamo'}
              className="mt-1 rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-800 focus:border-emerald-500 focus:outline-none"
            />
          </label>

          <label className="flex flex-col text-xs font-medium text-slate-700">
            <span>{isZh ? '邮件发件人名称（英文）' : 'Email from name (EN)'}</span>
            <input
              type="text"
              value={config.emailFromNameEn ?? ''}
              onChange={(e) => handleEmailFromNameEnChange(e.target.value)}
              placeholder="e.g. San Qin Roujiamo"
              className="mt-1 rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-800 focus:border-emerald-500 focus:outline-none"
            />
          </label>

          <label className="flex flex-col text-xs font-medium text-slate-700">
            <span>{isZh ? '邮件发件人地址' : 'Email from address'}</span>
            <input
              type="email"
              value={config.emailFromAddress ?? ''}
              onChange={(e) => handleEmailFromAddressChange(e.target.value)}
              placeholder="no-reply@example.com"
              className="mt-1 rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-800 focus:border-emerald-500 focus:outline-none"
            />
          </label>
        </div>
      </section>

      {/* 门店联系方式 */}
      <section className="space-y-3 rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
        <h2 className="text-sm font-semibold text-slate-900">
          {isZh ? '门店联系方式' : 'Store contact info'}
        </h2>
        <p className="text-xs text-slate-600">
          {isZh
            ? '用于小票、网站和客服渠道展示。'
            : 'Shown on receipts, website, and support channels.'}
        </p>

        <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
          <label className="flex flex-col text-xs font-medium text-slate-700">
            <span>{isZh ? '客服电话' : 'Support phone'}</span>
            <input
              type="tel"
              value={config.supportPhone ?? ''}
              onChange={(e) => handleSupportPhoneChange(e.target.value)}
              placeholder={isZh ? '例如：+1 416-000-0000' : 'e.g. +1 416-000-0000'}
              className="mt-1 rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-800 focus:border-emerald-500 focus:outline-none"
            />
          </label>

          <label className="flex flex-col text-xs font-medium text-slate-700">
            <span>{isZh ? '客服邮箱' : 'Support email'}</span>
            <input
              type="email"
              value={config.supportEmail ?? ''}
              onChange={(e) => handleSupportEmailChange(e.target.value)}
              placeholder="support@example.com"
              className="mt-1 rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-800 focus:border-emerald-500 focus:outline-none"
            />
          </label>
        </div>
      </section>

      {/* 每周营业时间 */}
      <section className="space-y-3 rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
        <h2 className="text-sm font-semibold text-slate-900">
          {isZh ? '每周营业时间' : 'Weekly business hours'}
        </h2>
        <p className="text-xs text-slate-600">
          {isZh
            ? '设置每一天的开门和打烊时间。勾选“休息”表示当天不营业。'
            : 'Configure opening and closing time for each day. Check "Closed" if the store does not open that day.'}
        </p>

        <div className="mt-3 space-y-2">
          {hours.map((h, index) => (
            <div
              key={h.weekday}
              className="flex flex-wrap items-center gap-3 rounded-xl border border-slate-100 bg-slate-50 px-3 py-2"
            >
              <div className="w-20 text-sm font-medium text-slate-800">
                {weekdayLabels[h.weekday] ?? h.weekday}
              </div>

              <div className="flex items-center gap-2">
                <label className="inline-flex items-center gap-2 text-xs">
                  <input
                    type="checkbox"
                    checked={h.isClosed}
                    onChange={(e) =>
                      handleToggleClosed(index, e.target.checked)
                    }
                    className="h-4 w-4 rounded border-slate-300 text-emerald-600"
                  />
                  <span className="text-slate-700">
                    {isZh ? '休息' : 'Closed'}
                  </span>
                </label>
              </div>

{!h.isClosed && (
  <div className="flex items-center gap-2 text-xs text-slate-700">
    <input
      type="text"
      inputMode="numeric"
      defaultValue={minutesToTimeString(h.openMinutes)}
      placeholder={isZh ? '如 11:00' : 'e.g. 11:00'}
      onBlur={(e) =>
        handleTimeChange(index, 'openMinutes', e.target.value)
      }
      className="rounded border border-slate-300 bg-white px-2 py-1 text-sm text-slate-800 focus:border-slate-500 focus:outline-none"
    />
    <span> - </span>
    <input
      type="text"
      inputMode="numeric"
      defaultValue={minutesToTimeString(h.closeMinutes)}
      placeholder={isZh ? '如 21:00' : 'e.g. 21:00'}
      onBlur={(e) =>
        handleTimeChange(index, 'closeMinutes', e.target.value)
      }
      className="rounded border border-slate-300 bg-white px-2 py-1 text-sm text-slate-800 focus:border-slate-500 focus:outline-none"
    />
  </div>
)}

              {h.isClosed && (
                <div className="text-xs text-slate-500">
                  {isZh ? '当天不营业' : 'Closed this day'}
                </div>
              )}
            </div>
          ))}
        </div>
      </section>

      {/* 节假日与特殊营业时间设置 */}
      <section className="space-y-3 rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div>
            <h2 className="text-sm font-semibold text-slate-900">
              {isZh ? '节假日与特殊营业时间' : 'Holidays & special hours'}
            </h2>
            <p className="text-xs text-slate-600">
              {isZh
                ? '用于设置法定节假日或临时调整的营业时间。保存后将覆盖所有节假日配置。'
                : 'Configure holidays or special opening hours. Saving will overwrite all existing holiday entries.'}
            </p>
          </div>
          <button
            type="button"
            onClick={handleAddHoliday}
            className="rounded-full bg-slate-900 px-3 py-1.5 text-xs font-medium text-white shadow-sm hover:bg-slate-800"
          >
            {isZh ? '新增节假日' : 'Add holiday'}
          </button>
        </div>

        {holidays.length === 0 ? (
          <p className="text-sm text-slate-500">
            {isZh ? '目前尚未配置任何节假日。' : 'No holidays configured yet.'}
          </p>
        ) : (
          <div className="space-y-2">
            {holidays.map((h, index) => (
              <div
                key={h.clientKey}
                className="flex flex-col gap-3 rounded-xl border border-slate-100 bg-slate-50 p-3 md:flex-row md:items-center"
              >
                {/* 日期 + 名称 */}
                <div className="flex flex-1 flex-col gap-2 md:flex-row md:items-center">
                  <div className="flex flex-col text-xs">
                    <span className="text-slate-500">
                      {isZh ? '日期' : 'Date'}
                    </span>
                    <input
                      type="date"
                      value={h.date}
                      onChange={(e) =>
                        handleHolidayFieldChange(index, 'date', e.target.value)
                      }
                      className="mt-1 rounded-md border border-slate-300 bg-white px-2 py-1 text-xs text-slate-800 focus:border-slate-500 focus:outline-none"
                    />
                  </div>

                  <div className="flex flex-1 flex-col text-xs md:ml-3">
                    <span className="text-slate-500">
                      {isZh ? '名称（选填）' : 'Name (optional)'}
                    </span>
                    <input
                      type="text"
                      value={h.name ?? ''}
                      onChange={(e) =>
                        handleHolidayFieldChange(index, 'name', e.target.value)
                      }
                      placeholder={
                        isZh ? '如：圣诞节 / 元旦' : 'e.g. Christmas / New Year'
                      }
                      className="mt-1 rounded-md border border-slate-300 bg-white px-2 py-1 text-xs text-slate-800 focus:border-slate-500 focus:outline-none"
                    />
                  </div>
                </div>

                {/* 状态 + 时间 */}
                <div className="flex flex-1 flex-col gap-2 md:flex-row md:items-center md:justify-end">
                  <label className="inline-flex items-center gap-2 text-xs">
                    <input
                      type="checkbox"
                      checked={h.isClosed}
                      onChange={(e) =>
                        handleHolidayToggleClosed(index, e.target.checked)
                      }
                      className="h-4 w-4 rounded border-slate-300 text-emerald-600"
                    />
                    <span className="text-slate-700">
                      {h.isClosed
                        ? isZh
                          ? '当天休息'
                          : 'Closed'
                        : isZh
                        ? '特殊营业时间'
                        : 'Special hours'}
                    </span>
                  </label>

                  {!h.isClosed && (
                    <div className="flex items-center gap-2 text-xs text-slate-700">
                      <input
                        type="time"
                        value={minutesToTimeString(h.openMinutes)}
                        onChange={(e) =>
                          handleHolidayTimeChange(
                            index,
                            'openMinutes',
                            e.target.value,
                          )
                        }
                        className="rounded border border-slate-300 bg-white px-2 py-1 text-xs text-slate-800 focus:border-slate-500 focus:outline-none"
                      />
                      <span> - </span>
                      <input
                        type="time"
                        value={minutesToTimeString(h.closeMinutes)}
                        onChange={(e) =>
                          handleHolidayTimeChange(
                            index,
                            'closeMinutes',
                            e.target.value,
                          )
                        }
                        className="rounded border border-slate-300 bg-white px-2 py-1 text-xs text-slate-800 focus:border-slate-500 focus:outline-none"
                      />
                    </div>
                  )}

                  <button
                    type="button"
                    onClick={() => handleDeleteHoliday(index)}
                    className="self-start rounded-full px-3 py-1 text-xs font-medium text-red-600 hover:bg-red-50"
                  >
                    {isZh ? '删除' : 'Delete'}
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </section>

      {/* 错误 / 成功提示 + 保存按钮 */}
      <div className="fixed bottom-0 right-0 z-20 w-full border-t border-slate-200 bg-white/90 p-4 shadow-[0_-4px_6px_-1px_rgba(0,0,0,0.05)] backdrop-blur-md md:pl-72">
        <div className="mx-auto flex max-w-5xl flex-col gap-3 md:flex-row md:items-center md:justify-end">
          {/* 错误提示 - 显示在左侧 */}
          {error && (
            <div className="rounded-lg bg-red-50 px-3 py-2 text-xs font-medium text-red-600 md:mr-auto">
              {error}
            </div>
          )}
          
          {/* 成功提示 - 显示在左侧 */}
          {success && (
            <div className="rounded-lg bg-emerald-50 px-3 py-2 text-xs font-medium text-emerald-600 md:mr-auto">
              {success}
            </div>
          )}

          <div className="flex items-center justify-end gap-4">
            {/* 取消/重置按钮 (可选，如果只是刷新页面) */}
            {/* <button type="button" onClick={() => window.location.reload()} className="...">取消</button> */}

            <button
              type="button"
              onClick={handleSave}
              disabled={saving}
              className={`inline-flex items-center justify-center rounded-full px-8 py-2.5 text-sm font-bold text-white shadow-lg transition-all focus:outline-none focus:ring-2 focus:ring-emerald-500 focus:ring-offset-2 ${
                saving
                  ? 'bg-emerald-400 cursor-not-allowed'
                  : 'bg-emerald-600 hover:bg-emerald-500 hover:shadow-emerald-200 active:scale-95'
              }`}
            >
              {saving ? (
                <span className="flex items-center gap-2">
                  <svg className="h-4 w-4 animate-spin" viewBox="0 0 24 24">
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" fill="none" />
                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
                  </svg>
                  {isZh ? '保存中…' : 'Saving…'}
                </span>
              ) : (
                isZh ? '保存全部设置' : 'Save All Settings'
              )}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
