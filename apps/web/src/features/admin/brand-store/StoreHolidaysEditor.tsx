'use client';

import { Plus, Trash2 } from 'lucide-react';
import { useMemo, useState } from 'react';
import {
  StaffEmptyState,
  StaffFeedback,
  StaffPanel,
  StaffSection,
} from '@/components/staff/StaffPrimitives';
import {
  updateAdminStoreHolidays,
  type StoreHolidayView,
} from '@/lib/api/brand-store';
import type { Locale } from '@/lib/i18n/locales';
import {
  SettingsSaveButton,
  SettingsToggle,
  settingsInputClass,
} from './SettingsControls';
import { minutesToTime, nullableText, timeToMinutes } from './settings-utils';

type HolidayDraft = {
  clientKey: string;
  date: string;
  name: string;
  isClosed: boolean;
  openTime: string;
  closeTime: string;
};

function toDraft(holidays: StoreHolidayView[]): HolidayDraft[] {
  return [...holidays]
    .sort((a, b) => a.date.localeCompare(b.date))
    .map((holiday, index) => ({
      clientKey: `${holiday.date}:${index}`,
      date: holiday.date,
      name: holiday.name ?? '',
      isClosed: holiday.isClosed,
      openTime: minutesToTime(holiday.openMinutes),
      closeTime: minutesToTime(holiday.closeMinutes),
    }));
}

function comparable(holidays: HolidayDraft[]) {
  return JSON.stringify(
    holidays.map((holiday) => ({
      date: holiday.date,
      name: holiday.name,
      isClosed: holiday.isClosed,
      openTime: holiday.openTime,
      closeTime: holiday.closeTime,
    })),
  );
}

export function StoreHolidaysEditor({
  locale,
  storeStableId,
  initialHolidays,
}: {
  locale: Locale;
  storeStableId: string;
  initialHolidays: StoreHolidayView[];
}) {
  const isZh = locale === 'zh';
  const initialDraft = useMemo(() => toDraft(initialHolidays), [initialHolidays]);
  const [holidays, setHolidays] = useState(initialDraft);
  const [baseline, setBaseline] = useState(comparable(initialDraft));
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const dirty = comparable(holidays) !== baseline;

  const updateHoliday = (index: number, patch: Partial<HolidayDraft>) => {
    setHolidays((current) =>
      current.map((holiday, holidayIndex) =>
        holidayIndex === index ? { ...holiday, ...patch } : holiday,
      ),
    );
    setSuccess(null);
  };

  const addHoliday = () => {
    const clientKey =
      globalThis.crypto?.randomUUID?.() ?? `${Date.now()}-${Math.random()}`;
    setHolidays((current) => [
      ...current,
      {
        clientKey,
        date: '',
        name: '',
        isClosed: true,
        openTime: '',
        closeTime: '',
      },
    ]);
    setSuccess(null);
  };

  const removeHoliday = (index: number) => {
    setHolidays((current) => current.filter((_, itemIndex) => itemIndex !== index));
    setSuccess(null);
  };

  const toggleClosed = (index: number, checked: boolean) => {
    const holiday = holidays[index];
    if (!holiday) return;
    updateHoliday(index, {
      isClosed: checked,
      openTime: checked ? '' : holiday.openTime || '11:00',
      closeTime: checked ? '' : holiday.closeTime || '21:00',
    });
  };

  const handleSubmit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();

    const payload: StoreHolidayView[] = [];
    for (const [index, holiday] of holidays.entries()) {
      if (!/^\d{4}-\d{2}-\d{2}$/.test(holiday.date)) {
        setError(
          isZh
            ? `第 ${index + 1} 条节假日需要填写有效日期。`
            : `Holiday row ${index + 1} needs a valid date.`,
        );
        return;
      }

      if (holiday.isClosed) {
        payload.push({
          date: holiday.date,
          name: nullableText(holiday.name),
          isClosed: true,
          openMinutes: null,
          closeMinutes: null,
        });
        continue;
      }

      const openMinutes = timeToMinutes(holiday.openTime);
      const closeMinutes = timeToMinutes(holiday.closeTime);
      if (
        openMinutes == null ||
        closeMinutes == null ||
        openMinutes >= closeMinutes
      ) {
        setError(
          isZh
            ? `第 ${index + 1} 条特殊营业时间不合法，开门时间必须早于打烊时间。`
            : `Holiday row ${index + 1} has invalid special hours; opening must be earlier than closing.`,
        );
        return;
      }

      payload.push({
        date: holiday.date,
        name: nullableText(holiday.name),
        isClosed: false,
        openMinutes,
        closeMinutes,
      });
    }

    setSaving(true);
    setError(null);
    setSuccess(null);
    try {
      const saved = await updateAdminStoreHolidays(payload, storeStableId);
      const next = toDraft(saved.holidays);
      setHolidays(next);
      setBaseline(comparable(next));
      setSuccess(
        isZh
          ? '节假日与特殊营业时间已保存。'
          : 'Holidays and special hours saved.',
      );
    } catch (saveError) {
      console.error(saveError);
      setError(
        isZh
          ? '节假日保存失败，请检查日期和时间后重试。'
          : 'Failed to save holidays. Check the dates and times and try again.',
      );
    } finally {
      setSaving(false);
    }
  };

  return (
    <StaffSection
      title={isZh ? '节假日与特殊营业时间' : 'Holidays & special hours'}
      description={
        isZh
          ? '列表按当前门店独立保存；保存会用当前列表覆盖该门店现有节假日配置。'
          : 'Saved per store. Saving replaces the current holiday list for this store.'
      }
      actions={
        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            onClick={addHoliday}
            className="inline-flex min-h-10 items-center gap-2 rounded-xl border border-slate-300 bg-white px-3 py-2 text-sm font-semibold text-slate-700 outline-none transition hover:bg-slate-50 focus-visible:ring-2 focus-visible:ring-slate-300"
          >
            <Plus className="size-4" aria-hidden="true" />
            {isZh ? '新增日期' : 'Add date'}
          </button>
          <SettingsSaveButton
            form="store-holidays-form"
            saving={saving}
            disabled={!dirty}
          >
            {saving
              ? isZh
                ? '保存中…'
                : 'Saving…'
              : isZh
                ? '保存节假日'
                : 'Save holidays'}
          </SettingsSaveButton>
        </div>
      }
    >
      {error ? <StaffFeedback tone="danger">{error}</StaffFeedback> : null}
      {success ? <StaffFeedback tone="success">{success}</StaffFeedback> : null}
      <form id="store-holidays-form" onSubmit={handleSubmit}>
        {holidays.length === 0 ? (
          <StaffEmptyState
            title={isZh ? '还没有节假日配置' : 'No holiday overrides'}
            description={
              isZh
                ? '只有需要关闭或调整营业时间的日期才需要添加。'
                : 'Add only dates that need a closure or special opening hours.'
            }
            actions={
              <button
                type="button"
                onClick={addHoliday}
                className="rounded-xl bg-slate-900 px-4 py-2 text-sm font-semibold text-white"
              >
                {isZh ? '添加第一个日期' : 'Add first date'}
              </button>
            }
          />
        ) : (
          <StaffPanel className="overflow-hidden">
            <div className="divide-y divide-slate-100">
              {holidays.map((holiday, index) => (
                <div
                  key={holiday.clientKey}
                  className="grid gap-4 p-4 lg:grid-cols-[150px_minmax(180px,1fr)_220px_minmax(260px,1fr)_44px] lg:items-end lg:p-5"
                >
                  <label className="block text-xs font-medium text-slate-600">
                    {isZh ? '日期' : 'Date'}
                    <input
                      type="date"
                      value={holiday.date}
                      onChange={(event) =>
                        updateHoliday(index, { date: event.target.value })
                      }
                      className={settingsInputClass}
                    />
                  </label>
                  <label className="block text-xs font-medium text-slate-600">
                    {isZh ? '名称（选填）' : 'Name (optional)'}
                    <input
                      value={holiday.name}
                      onChange={(event) =>
                        updateHoliday(index, { name: event.target.value })
                      }
                      className={settingsInputClass}
                    />
                  </label>
                  <SettingsToggle
                    checked={holiday.isClosed}
                    onChange={(checked) => toggleClosed(index, checked)}
                    label={holiday.isClosed ? (isZh ? '当天休息' : 'Closed') : isZh ? '特殊营业' : 'Special hours'}
                  />
                  {holiday.isClosed ? (
                    <div className="pb-2 text-sm text-slate-500">
                      {isZh ? '全天不营业' : 'Closed all day'}
                    </div>
                  ) : (
                    <div className="grid grid-cols-[1fr_auto_1fr] items-center gap-2">
                      <input
                        type="time"
                        value={holiday.openTime}
                        onChange={(event) =>
                          updateHoliday(index, { openTime: event.target.value })
                        }
                        aria-label={`${holiday.date || index + 1} ${isZh ? '开门时间' : 'opening time'}`}
                        className={settingsInputClass}
                      />
                      <span className="pt-1 text-slate-400">—</span>
                      <input
                        type="time"
                        value={holiday.closeTime}
                        onChange={(event) =>
                          updateHoliday(index, { closeTime: event.target.value })
                        }
                        aria-label={`${holiday.date || index + 1} ${isZh ? '打烊时间' : 'closing time'}`}
                        className={settingsInputClass}
                      />
                    </div>
                  )}
                  <button
                    type="button"
                    onClick={() => removeHoliday(index)}
                    aria-label={isZh ? `删除第 ${index + 1} 条节假日` : `Delete holiday row ${index + 1}`}
                    className="flex size-10 items-center justify-center rounded-xl text-red-600 outline-none transition hover:bg-red-50 focus-visible:ring-2 focus-visible:ring-red-200"
                  >
                    <Trash2 className="size-4" aria-hidden="true" />
                  </button>
                </div>
              ))}
            </div>
          </StaffPanel>
        )}
      </form>
    </StaffSection>
  );
}
