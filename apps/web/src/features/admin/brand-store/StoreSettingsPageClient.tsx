'use client';

import { useSearchParams } from 'next/navigation';
import { useEffect, useState } from 'react';
import {
  StaffFeedback,
  StaffPage,
  StaffPageHeader,
  StaffPanel,
} from '@/components/staff/StaffPrimitives';
import {
  fetchStaffStoreConfig,
  fetchStaffStoreHolidays,
  fetchStaffStoreHours,
  type StoreBusinessHourView,
  type StoreConfigView,
  type StoreHolidayView,
} from '@/lib/api/brand-store';
import type { Locale } from '@/lib/i18n/locales';
import { StoreConfigEditor } from './StoreConfigEditor';
import { StoreHolidaysEditor } from './StoreHolidaysEditor';
import { StoreHoursEditor } from './StoreHoursEditor';

type StoreSettingsData = {
  config: StoreConfigView;
  hours: StoreBusinessHourView[];
  holidays: StoreHolidayView[];
};

export function StoreSettingsPageClient({ locale }: { locale: Locale }) {
  const isZh = locale === 'zh';
  const searchParams = useSearchParams();
  const requestedStoreStableId = searchParams.get('store')?.trim() || undefined;
  const [data, setData] = useState<StoreSettingsData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);

    void Promise.all([
      fetchStaffStoreConfig(requestedStoreStableId),
      fetchStaffStoreHours(requestedStoreStableId),
      fetchStaffStoreHolidays(requestedStoreStableId),
    ])
      .then(([config, hours, holidays]) => {
        if (cancelled) return;
        setData({
          config,
          hours: hours.hours,
          holidays: holidays.holidays,
        });
      })
      .catch((loadError) => {
        if (cancelled) return;
        console.error(loadError);
        setError(
          isZh
            ? '门店配置加载失败，请稍后重试。'
            : 'Failed to load store configuration. Please try again.',
        );
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [isZh, requestedStoreStableId]);

  return (
    <StaffPage>
      <StaffPageHeader
        eyebrow={isZh ? '门店管理' : 'Store management'}
        title={isZh ? '门店配置' : 'Store configuration'}
        description={
          isZh
            ? '管理当前门店的资料、营业状态、公告、时区、税率、配送参数、在线接单策略、营业时间与节假日。门店身份保持只读，所有可编辑字段通过 Store owner contract 保存。'
            : 'Manage the current store profile, ordering status, notices, time zone, tax, delivery settings, online-order policy, business hours, and holidays. Store identity remains read-only and all editable fields save through the Store owner contract.'
        }
      />

      {error ? <StaffFeedback tone="danger">{error}</StaffFeedback> : null}

      {loading ? (
        <StaffPanel className="p-6 text-sm text-slate-500">
          {isZh ? '正在加载门店配置…' : 'Loading store configuration…'}
        </StaffPanel>
      ) : !data ? (
        <StaffFeedback tone="danger">
          {isZh
            ? '当前无法读取 StoreConfig。'
            : 'StoreConfig is currently unavailable.'}
        </StaffFeedback>
      ) : (
        <div className="space-y-8">
          <StoreConfigEditor
            key={`config:${data.config.storeStableId}`}
            locale={locale}
            storeStableId={data.config.storeStableId}
            initialConfig={data.config}
          />
          <StoreHoursEditor
            key={`hours:${data.config.storeStableId}`}
            locale={locale}
            storeStableId={data.config.storeStableId}
            initialHours={data.hours}
          />
          <StoreHolidaysEditor
            key={`holidays:${data.config.storeStableId}`}
            locale={locale}
            storeStableId={data.config.storeStableId}
            initialHolidays={data.holidays}
          />
        </div>
      )}
    </StaffPage>
  );
}
