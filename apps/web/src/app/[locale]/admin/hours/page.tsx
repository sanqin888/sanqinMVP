// apps/web/src/app/[locale]/admin/hours/page.tsx
'use client';

import { useEffect, useMemo, useState } from 'react';
import { useParams } from 'next/navigation';
import type { Locale } from '@/lib/order/shared';
import { apiFetch } from '@/lib/api-client';

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
type HolidayDto = {
  id: number;
  date: string; // 'YYYY-MM-DD'
  name?: string;
  isClosed: boolean;
  openMinutes: number | null;
  closeMinutes: number | null;
};

type BusinessConfigDto = {
  timezone: string;
  isTemporarilyClosed: boolean;
  temporaryCloseReason: string | null;
  holidays: HolidayDto[];
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

/** ===== 页面组件 ===== */

export default function AdminHoursPage() {
  const { locale } = useParams<{ locale: Locale }>();
  const isZh = locale === 'zh';

  const [config, setConfig] = useState<BusinessConfigDto | null>(null);
  const [hours, setHours] = useState<BusinessHourDto[]>([]);
  const [holidays, setHolidays] = useState<HolidayDto[]>([]);

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

        const sortedHolidays = (configRes.holidays ?? []).slice().sort((a, b) => {
          // 'YYYY-MM-DD' 字符串比较即可
          if (a.date < b.date) return -1;
          if (a.date > b.date) return 1;
          return a.id - b.id;
        });
        setHolidays(sortedHolidays);
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
    setHolidays((prev) => [
      ...prev,
      {
        // 前端临时 id，用时间戳避免 React key 冲突；真正保存时后端会生成新的 id
        id: Date.now(),
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

    setSaving(true);
    setError(null);
    setSuccess(null);

    try {
      // 1. 保存每周营业时间（/admin/business/hours）
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

      // 2. 保存门店临时关闭状态（/admin/business/config）
      await apiFetch<BusinessConfigDto>('/admin/business/config', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          isTemporarilyClosed: config.isTemporarilyClosed,
          // 和后端 updateTemporaryClose 保持一致，用 reason
          reason: config.temporaryCloseReason ?? null,
        }),
      });

      // 3. 保存节假日（/admin/business/holidays，覆盖式）
      const holidaysPayload = {
        holidays: holidays.map((h) => {
          const base: {
            date: string;
            name?: string;
            isClosed: boolean;
            openMinutes?: number | null;
            closeMinutes?: number | null;
          } = {
            date: h.date,
            name: h.name,
            isClosed: h.isClosed,
          };

          if (!h.isClosed) {
            base.openMinutes = h.openMinutes ?? 0;
            base.closeMinutes = h.closeMinutes ?? 0;
          }

          return base;
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
        (updatedConfig.holidays ?? []).slice().sort((a, b) => {
          if (a.date < b.date) return -1;
          if (a.date > b.date) return 1;
          return a.id - b.id;
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
    <div className="space-y-6">
      <h1 className="text-xl font-semibold">
        {isZh ? '营业时间与门店状态' : 'Business hours & store status'}
      </h1>

      {/* 门店状态（是否暂时关闭） */}
      <section className="space-y-3 rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
        <h2 className="text-sm font-semibold text-slate-900">
          {isZh ? '门店当前状态' : 'Current store status'}
        </h2>
        <p className="text-xs text-slate-600">
          {isZh
            ? '这里的“暂停接单”会作用于网页下单和门店 POS。'
            : 'This temporary close toggle applies to both web ordering and in-store POS.'}
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
                key={h.id}
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
