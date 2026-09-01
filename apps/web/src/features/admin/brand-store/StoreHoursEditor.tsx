'use client';

import { useMemo, useState } from 'react';
import {
  StaffFeedback,
  StaffPanel,
  StaffSection,
} from '@/components/staff/StaffPrimitives';
import {
  updateAdminStoreHours,
  type StoreBusinessHourView,
} from '@/lib/api/brand-store';
import type { Locale } from '@/lib/i18n/locales';
import {
  SettingsSaveButton,
  SettingsToggle,
  settingsInputClass,
} from './SettingsControls';
import { minutesToTime, timeToMinutes } from './settings-utils';

const WEEKDAYS_ZH = ['周日', '周一', '周二', '周三', '周四', '周五', '周六'];
const WEEKDAYS_EN = [
  'Sunday',
  'Monday',
  'Tuesday',
  'Wednesday',
  'Thursday',
  'Friday',
  'Saturday',
];

type HourDraft = {
  weekday: number;
  isClosed: boolean;
  openTime: string;
  closeTime: string;
};

function toDraft(hours: StoreBusinessHourView[]): HourDraft[] {
  return [...hours]
    .sort((a, b) => a.weekday - b.weekday)
    .map((hour) => ({
      weekday: hour.weekday,
      isClosed: hour.isClosed,
      openTime: minutesToTime(hour.openMinutes),
      closeTime: minutesToTime(hour.closeMinutes),
    }));
}

export function StoreHoursEditor({
  locale,
  storeStableId,
  initialHours,
}: {
  locale: Locale;
  storeStableId: string;
  initialHours: StoreBusinessHourView[];
}) {
  const isZh = locale === 'zh';
  const labels = isZh ? WEEKDAYS_ZH : WEEKDAYS_EN;
  const initialDraft = useMemo(() => toDraft(initialHours), [initialHours]);
  const [hours, setHours] = useState(initialDraft);
  const [baseline, setBaseline] = useState(JSON.stringify(initialDraft));
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const dirty = JSON.stringify(hours) !== baseline;

  const updateHour = (index: number, patch: Partial<HourDraft>) => {
    setHours((current) =>
      current.map((hour, hourIndex) =>
        hourIndex === index ? { ...hour, ...patch } : hour,
      ),
    );
    setSuccess(null);
  };

  const toggleClosed = (index: number, checked: boolean) => {
    const current = hours[index];
    if (!current) return;
    updateHour(index, {
      isClosed: checked,
      openTime: checked ? '' : current.openTime || '11:00',
      closeTime: checked ? '' : current.closeTime || '21:00',
    });
  };

  const handleSubmit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();

    const payload: StoreBusinessHourView[] = [];
    for (const hour of hours) {
      if (hour.isClosed) {
        payload.push({
          weekday: hour.weekday,
          isClosed: true,
          openMinutes: null,
          closeMinutes: null,
        });
        continue;
      }

      const openMinutes = timeToMinutes(hour.openTime);
      const closeMinutes = timeToMinutes(hour.closeTime);
      if (
        openMinutes == null ||
        closeMinutes == null ||
        openMinutes >= closeMinutes
      ) {
        setError(
          isZh
            ? `${labels[hour.weekday] ?? hour.weekday} 的开门时间必须早于打烊时间。`
            : `Opening time must be earlier than closing time for ${labels[hour.weekday] ?? hour.weekday}.`,
        );
        return;
      }
      payload.push({
        weekday: hour.weekday,
        isClosed: false,
        openMinutes,
        closeMinutes,
      });
    }

    setSaving(true);
    setError(null);
    setSuccess(null);
    try {
      const saved = await updateAdminStoreHours(payload, storeStableId);
      const next = toDraft(saved.hours);
      setHours(next);
      setBaseline(JSON.stringify(next));
      setSuccess(isZh ? '每周营业时间已保存。' : 'Weekly business hours saved.');
    } catch (saveError) {
      console.error(saveError);
      setError(
        isZh
          ? '营业时间保存失败，请检查时间后重试。'
          : 'Failed to save business hours. Check the times and try again.',
      );
    } finally {
      setSaving(false);
    }
  };

  return (
    <StaffSection
      title={isZh ? '每周营业时间' : 'Weekly business hours'}
      description={
        isZh
          ? '按门店独立保存。勾选“休息”表示当天不营业。'
          : 'Saved per store. Mark a day closed when the store does not operate.'
      }
      actions={
        <SettingsSaveButton
          form="store-hours-form"
          saving={saving}
          disabled={!dirty}
        >
          {saving
            ? isZh
              ? '保存中…'
              : 'Saving…'
            : isZh
              ? '保存营业时间'
              : 'Save hours'}
        </SettingsSaveButton>
      }
    >
      {error ? <StaffFeedback tone="danger">{error}</StaffFeedback> : null}
      {success ? <StaffFeedback tone="success">{success}</StaffFeedback> : null}
      <form id="store-hours-form" onSubmit={handleSubmit}>
        <StaffPanel className="overflow-hidden">
          <div className="hidden grid-cols-[150px_160px_minmax(0,1fr)] gap-4 border-b border-slate-200 bg-slate-50 px-5 py-3 text-xs font-semibold uppercase tracking-[0.1em] text-slate-500 md:grid">
            <span>{isZh ? '星期' : 'Day'}</span>
            <span>{isZh ? '状态' : 'Status'}</span>
            <span>{isZh ? '营业时间' : 'Hours'}</span>
          </div>
          <div className="divide-y divide-slate-100">
            {hours.map((hour, index) => (
              <div
                key={hour.weekday}
                className="grid gap-3 px-4 py-4 md:grid-cols-[150px_160px_minmax(0,1fr)] md:items-center md:px-5"
              >
                <div className="text-sm font-semibold text-slate-900">
                  {labels[hour.weekday] ?? hour.weekday}
                </div>
                <SettingsToggle
                  checked={hour.isClosed}
                  onChange={(checked) => toggleClosed(index, checked)}
                  label={isZh ? '休息' : 'Closed'}
                />
                {hour.isClosed ? (
                  <p className="text-sm text-slate-500">
                    {isZh ? '当天不营业' : 'Closed all day'}
                  </p>
                ) : (
                  <div className="grid max-w-md grid-cols-[1fr_auto_1fr] items-center gap-2">
                    <input
                      type="time"
                      value={hour.openTime}
                      onChange={(event) =>
                        updateHour(index, { openTime: event.target.value })
                      }
                      aria-label={`${labels[hour.weekday] ?? hour.weekday} ${isZh ? '开门时间' : 'opening time'}`}
                      className={settingsInputClass}
                    />
                    <span className="pt-1 text-slate-400">—</span>
                    <input
                      type="time"
                      value={hour.closeTime}
                      onChange={(event) =>
                        updateHour(index, { closeTime: event.target.value })
                      }
                      aria-label={`${labels[hour.weekday] ?? hour.weekday} ${isZh ? '打烊时间' : 'closing time'}`}
                      className={settingsInputClass}
                    />
                  </div>
                )}
              </div>
            ))}
          </div>
        </StaffPanel>
      </form>
    </StaffSection>
  );
}
