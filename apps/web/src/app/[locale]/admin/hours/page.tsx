// apps/web/src/app/[locale]/admin/hours/page.tsx
'use client';

import { useEffect, useMemo, useState } from 'react';
import { useParams } from 'next/navigation';
import type { Locale } from '@/lib/order/shared';
import { apiFetch } from '@/lib/api-client';

type BusinessConfigDto = {
  id: number;
  storeName: string | null;
  timezone: string;
  isTemporarilyClosed: boolean;
  temporaryCloseReason: string | null;
};

type BusinessHourDto = {
  weekday: number; // 0=Sunday ... 6=Saturday
  openMinutes: number | null;
  closeMinutes: number | null;
  isClosed: boolean;
};

type BusinessHoursResponse = {
  hours: BusinessHourDto[];
};

type SaveHoursPayload = {
  hours: {
    weekday: number;
    openMinutes: number;
    closeMinutes: number;
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

  if (
    !Number.isFinite(hh) ||
    !Number.isFinite(mm) ||
    hh < 0 ||
    hh > 23 ||
    mm < 0 ||
    mm > 59
  ) {
    return null;
  }

  return hh * 60 + mm;
}

export default function AdminHoursPage() {
  const { locale } = useParams<{ locale: Locale }>();
  const isZh = locale === 'zh';

  const [config, setConfig] = useState<BusinessConfigDto | null>(null);
  const [hours, setHours] = useState<BusinessHourDto[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  const weekdayLabels = useMemo(
    () => (isZh ? WEEKDAY_LABELS_ZH : WEEKDAY_LABELS_EN),
    [isZh],
  );

  // 初次加载配置+营业时间
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

// 按 weekday 排序，保证从周日到周六顺序
const sorted = [...hoursRes.hours].sort((a, b) => a.weekday - b.weekday);
setHours(sorted);
      } catch (e) {
        if (cancelled) return;
        console.error(e);
        setError(
          isZh
            ? '加载营业时间失败，请稍后重试。'
            : 'Failed to load business hours. Please try again.',
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

  const handleToggleClosed = (index: number, checked: boolean) => {
    setHours((prev) => {
      const next = [...prev];
      const h = { ...next[index], isClosed: checked };
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
    if (mins == null) {
      // 输入不合法就不更新，避免把数据写坏
      return;
    }

    setHours((prev) => {
      const next = [...prev];
      const h = { ...next[index], [field]: mins } as BusinessHourDto;
      next[index] = h;
      return next;
    });
  };

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

  const handleSave = async () => {
    if (!config) return;

    setSaving(true);
    setError(null);
    setSuccess(null);

    try {
      // 1. 保存营业时间
const hoursPayload: SaveHoursPayload = {
  hours: hours.map((h) => ({
    weekday: h.weekday,
    // 对于 isClosed 的天，这里的分钟数只是占位，后端会根据 isClosed 决定是否使用
    openMinutes: h.openMinutes ?? 0,
    closeMinutes: h.closeMinutes ?? 0,
    isClosed: h.isClosed,
  })),
};

      await apiFetch('/admin/business/hours', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(hoursPayload),
      });

      // 2. 保存门店状态配置
await apiFetch('/admin/business/config', {
  method: 'PATCH',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({
    isTemporarilyClosed: config.isTemporarilyClosed,
    // ✅ 和后端 updateTemporaryClose 保持一致，用 reason
    reason: config.temporaryCloseReason ?? null,
  }),
});

      setSuccess(isZh ? '保存成功。' : 'Saved successfully.');
    } catch (e) {
      console.error(e);
      setError(
        isZh
          ? '保存失败，请稍后重试。'
          : 'Failed to save settings. Please try again.',
      );
    } finally {
      setSaving(false);
    }
  };

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
    <div className="space-y-6">
      <h1 className="text-xl font-semibold">
        {isZh ? '营业时间与门店状态' : 'Business hours & store status'}
      </h1>

      {/* 门店状态（是否暂时关闭） */}
      <section className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm space-y-3">
        <h2 className="text-sm font-semibold text-slate-900">
          {isZh ? '门店当前状态' : 'Current store status'}
        </h2>
        <p className="text-xs text-slate-600">
          {isZh
            ? '这里的“暂停接单”会作用于网页下单和门店 POS。'
            : 'This temporary close toggle applies to both web ordering and in-store POS.'}
        </p>

        <div className="flex items-center gap-3 mt-2">
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
                isZh ? '例如：设备维护，预计晚上 8 点恢复。' : 'e.g. Maintenance, back at 8pm.'
              }
              className="mt-1 w-full rounded-2xl border border-slate-200 bg-white p-2 text-sm text-slate-700 focus:border-slate-400 focus:outline-none"
            />
          </label>
        </div>
      </section>

      {/* 每周营业时间 */}
      <section className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm space-y-3">
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
              className="flex items-center gap-3 rounded-xl border border-slate-100 bg-slate-50 px-3 py-2"
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
                    type="time"
                    value={minutesToTimeString(h.openMinutes)}
                    onChange={(e) =>
                      handleTimeChange(index, 'openMinutes', e.target.value)
                    }
                    className="border rounded px-2 py-1 text-sm text-slate-800 border-slate-300 bg-white focus:outline-none focus:border-slate-500"
                  />
                  <span> - </span>
                  <input
                    type="time"
                    value={minutesToTimeString(h.closeMinutes)}
                    onChange={(e) =>
                      handleTimeChange(index, 'closeMinutes', e.target.value)
                    }
                    className="border rounded px-2 py-1 text-sm text-slate-800 border-slate-300 bg-white focus:outline-none focus:border-slate-500"
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

      {/* 错误 / 成功提示 + 保存按钮 */}
      <div className="space-y-2">
        {error && (
          <div className="rounded-2xl border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-700">
            {error}
          </div>
        )}
        {success && (
          <div className="rounded-2xl border border-emerald-200 bg-emerald-50 px-3 py-2 text-xs text-emerald-700">
            {success}
          </div>
        )}

        <button
          type="button"
          onClick={handleSave}
          disabled={saving}
          className="inline-flex items-center rounded-full bg-emerald-600 px-5 py-2.5 text-sm font-semibold text-white shadow-sm transition hover:bg-emerald-500 disabled:cursor-not-allowed disabled:bg-emerald-200"
        >
          {saving
            ? isZh
              ? '保存中…'
              : 'Saving…'
            : isZh
              ? '保存设置'
              : 'Save settings'}
        </button>
      </div>
    </div>
  );
}
