'use client';

import {
  StaffPanel,
  StaffSection,
} from '@/components/staff/StaffPrimitives';
import type { StoreConfigView } from '@/lib/api/brand-store';
import type { Locale } from '@/lib/i18n/locales';
import {
  ReadonlyValue,
  SettingsField,
  SettingsToggle,
  settingsInputClass,
  settingsTextareaClass,
} from './SettingsControls';
import type { StoreDraft, StoreDraftUpdate } from './store-config-model';

export function StoreIdentitySummary({
  locale,
  config,
}: {
  locale: Locale;
  config: StoreConfigView;
}) {
  const isZh = locale === 'zh';
  return (
    <div className="grid flex-1 gap-3 sm:grid-cols-3">
      <ReadonlyValue label={isZh ? '门店' : 'Store'} value={config.storeName} />
      <ReadonlyValue
        label="storeStableId"
        value={<span className="font-mono text-xs">{config.storeStableId}</span>}
      />
      <ReadonlyValue
        label={isZh ? '系统状态' : 'System status'}
        value={
          config.isActive
            ? isZh
              ? '已启用'
              : 'Active'
            : isZh
              ? '已停用'
              : 'Inactive'
        }
      />
    </div>
  );
}

export function StoreAddressSection({
  locale,
  draft,
  update,
}: {
  locale: Locale;
  draft: StoreDraft;
  update: StoreDraftUpdate;
}) {
  const isZh = locale === 'zh';
  return (
    <StaffSection
      title={isZh ? '门店地址与联系方式' : 'Store address & contacts'}
      description={
        isZh
          ? 'StoreConfig 的门店级地址、联系电话与现场联系人。品牌客服联系方式请在“品牌管理”中维护。'
          : 'Store-level address, phone, and on-site contact from StoreConfig. Brand support contacts stay under Brand management.'
      }
    >
      <StaffPanel className="grid gap-4 p-5 md:grid-cols-2">
        <SettingsField label={isZh ? '地址 Line 1' : 'Address line 1'}>
          <input
            value={draft.addressLine1}
            onChange={(event) => update('addressLine1', event.target.value)}
            className={settingsInputClass}
            autoComplete="street-address"
          />
        </SettingsField>
        <SettingsField label={isZh ? '地址 Line 2' : 'Address line 2'}>
          <input
            value={draft.addressLine2}
            onChange={(event) => update('addressLine2', event.target.value)}
            className={settingsInputClass}
          />
        </SettingsField>
        <SettingsField label={isZh ? '城市' : 'City'}>
          <input
            value={draft.city}
            onChange={(event) => update('city', event.target.value)}
            className={settingsInputClass}
            autoComplete="address-level2"
          />
        </SettingsField>
        <div className="grid gap-4 sm:grid-cols-3">
          <SettingsField label={isZh ? '省 / 州' : 'Province'}>
            <input
              value={draft.province}
              onChange={(event) => update('province', event.target.value)}
              className={settingsInputClass}
              autoComplete="address-level1"
            />
          </SettingsField>
          <SettingsField label={isZh ? '邮编' : 'Postal code'}>
            <input
              value={draft.postalCode}
              onChange={(event) => update('postalCode', event.target.value)}
              className={settingsInputClass}
              autoComplete="postal-code"
            />
          </SettingsField>
          <SettingsField label={isZh ? '国家' : 'Country'}>
            <input
              value={draft.countryCode}
              maxLength={2}
              onChange={(event) => update('countryCode', event.target.value)}
              className={settingsInputClass}
              autoComplete="country"
            />
          </SettingsField>
        </div>
        <SettingsField label={isZh ? '门店电话' : 'Store phone'}>
          <input
            type="tel"
            value={draft.phone}
            onChange={(event) => update('phone', event.target.value)}
            className={settingsInputClass}
            autoComplete="tel"
          />
        </SettingsField>
        <SettingsField label={isZh ? '现场联系人' : 'Contact name'}>
          <input
            value={draft.contactName}
            onChange={(event) => update('contactName', event.target.value)}
            className={settingsInputClass}
            autoComplete="name"
          />
        </SettingsField>
        <SettingsField label={isZh ? '纬度' : 'Latitude'}>
          <input
            type="number"
            step="0.000001"
            value={draft.latitude}
            onChange={(event) => update('latitude', event.target.value)}
            className={settingsInputClass}
          />
        </SettingsField>
        <SettingsField label={isZh ? '经度' : 'Longitude'}>
          <input
            type="number"
            step="0.000001"
            value={draft.longitude}
            onChange={(event) => update('longitude', event.target.value)}
            className={settingsInputClass}
          />
        </SettingsField>
      </StaffPanel>
    </StaffSection>
  );
}

export function StoreStatusSection({
  locale,
  draft,
  update,
}: {
  locale: Locale;
  draft: StoreDraft;
  update: StoreDraftUpdate;
}) {
  const isZh = locale === 'zh';
  return (
    <StaffSection
      title={isZh ? '营业状态与顾客公告' : 'Ordering status & customer notice'}
      description={
        isZh
          ? '暂停接单只影响顾客端下单；POS 店内点餐不受影响。'
          : 'Temporary closure blocks customer ordering only; in-store POS ordering remains available.'
      }
    >
      <StaffPanel className="space-y-4 p-5">
        <SettingsToggle
          checked={draft.isTemporarilyClosed}
          onChange={(checked) => update('isTemporarilyClosed', checked)}
          label={isZh ? '暂时暂停顾客端接单' : 'Temporarily stop customer orders'}
          description={
            isZh
              ? '状态变化仍由后端同步到需要感知门店营业状态的渠道。'
              : 'The backend continues to synchronize store-status changes to channels that depend on it.'
          }
        />
        <SettingsField
          label={isZh ? '暂停原因' : 'Closure reason'}
          description={isZh ? '仅暂停时向顾客展示。' : 'Shown to customers only while paused.'}
        >
          <input
            value={draft.temporaryCloseReason}
            disabled={!draft.isTemporarilyClosed}
            onChange={(event) => update('temporaryCloseReason', event.target.value)}
            className={settingsInputClass}
          />
        </SettingsField>
        <div className="grid gap-4 xl:grid-cols-2">
          <SettingsField label={isZh ? '中文公告' : 'Notice (ZH)'}>
            <textarea
              value={draft.publicNotice}
              onChange={(event) => update('publicNotice', event.target.value)}
              className={settingsTextareaClass}
            />
          </SettingsField>
          <SettingsField label={isZh ? '英文公告' : 'Notice (EN)'}>
            <textarea
              value={draft.publicNoticeEn}
              onChange={(event) => update('publicNoticeEn', event.target.value)}
              className={settingsTextareaClass}
            />
          </SettingsField>
        </div>
      </StaffPanel>
    </StaffSection>
  );
}
