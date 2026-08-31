'use client';

import {
  StaffPanel,
  StaffSection,
} from '@/components/staff/StaffPrimitives';
import type { Locale } from '@/lib/i18n/locales';
import {
  SettingsField,
  SettingsToggle,
  settingsInputClass,
} from './SettingsControls';
import {
  ALLERGY_OPTIONS,
  COMMON_TIMEZONES,
  type StoreDraft,
  type StoreDraftUpdate,
} from './store-config-model';

export function StoreTimeTaxSection({
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
      title={isZh ? '门店时间与税率' : 'Store time & tax'}
      description={
        isZh
          ? '时区用于营业时间、节假日和“今日”计算；税率作用于新订单。'
          : 'The time zone drives business hours, holidays, and “today” calculations. Tax applies to new orders.'
      }
    >
      <StaffPanel className="grid gap-4 p-5 md:grid-cols-2">
        <SettingsField label={isZh ? 'IANA 时区' : 'IANA time zone'}>
          <input
            value={draft.timezone}
            onChange={(event) => update('timezone', event.target.value)}
            list="admin-store-timezones"
            className={settingsInputClass}
          />
          <datalist id="admin-store-timezones">
            {COMMON_TIMEZONES.map((timezone) => (
              <option key={timezone} value={timezone} />
            ))}
          </datalist>
        </SettingsField>
        <SettingsField
          label={isZh ? '销售税率（%）' : 'Sales tax rate (%)'}
          description={isZh ? '例如 13% 填写 13.00。' : 'Enter 13.00 for a 13% rate.'}
        >
          <input
            type="number"
            min="0"
            max="100"
            step="0.01"
            value={draft.salesTaxPercent}
            onChange={(event) => update('salesTaxPercent', event.target.value)}
            className={settingsInputClass}
          />
        </SettingsField>
      </StaffPanel>
    </StaffSection>
  );
}

export function StoreDeliverySection({
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
      title={isZh ? '配送计费与范围' : 'Delivery pricing & range'}
      description={
        isZh
          ? '这些门店级参数直接参与新订单配送费用与配送范围判断。'
          : 'These store-level values drive delivery pricing and range for new orders.'
      }
    >
      <StaffPanel className="grid gap-4 p-5 md:grid-cols-2">
        <SettingsField label={isZh ? '基础配送费（CAD）' : 'Base fee (CAD)'}>
          <input
            type="number"
            min="0"
            step="0.01"
            value={draft.deliveryBaseFeeCad}
            onChange={(event) => update('deliveryBaseFeeCad', event.target.value)}
            className={settingsInputClass}
          />
        </SettingsField>
        <SettingsField label={isZh ? '优先配送每公里（CAD）' : 'Priority per km (CAD)'}>
          <input
            type="number"
            min="0"
            step="0.01"
            value={draft.priorityPerKmCad}
            onChange={(event) => update('priorityPerKmCad', event.target.value)}
            className={settingsInputClass}
          />
        </SettingsField>
        <SettingsField label={isZh ? '最大配送距离（km）' : 'Max delivery range (km)'}>
          <input
            type="number"
            min="0"
            step="0.1"
            value={draft.maxDeliveryRangeKm}
            onChange={(event) => update('maxDeliveryRangeKm', event.target.value)}
            className={settingsInputClass}
          />
        </SettingsField>
        <SettingsField label={isZh ? '优先配送默认距离（km）' : 'Priority fallback distance (km)'}>
          <input
            type="number"
            min="0"
            step="0.1"
            value={draft.priorityDefaultDistanceKm}
            onChange={(event) =>
              update('priorityDefaultDistanceKm', event.target.value)
            }
            className={settingsInputClass}
          />
        </SettingsField>
      </StaffPanel>
    </StaffSection>
  );
}

export function StoreOnlineOrderSection({
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
      title={isZh ? '在线接单与第三方配送' : 'Online orders & delivery providers'}
      description={
        isZh
          ? '控制门店级自动接单与 Uber Direct 开关；不会改变订单、支付或 Uber 协议本身。'
          : 'Controls store-level auto-accept and Uber Direct toggles without changing order, payment, or Uber protocol behavior.'
      }
    >
      <StaffPanel className="grid gap-4 p-5 lg:grid-cols-2">
        <SettingsToggle
          checked={draft.autoAcceptOnlineOrders}
          onChange={(checked) => update('autoAcceptOnlineOrders', checked)}
          label={isZh ? '自动接受在线订单' : 'Auto-accept online orders'}
          description={
            isZh
              ? '供支持该 StoreConfig 设置的在线订单入口读取。'
              : 'Read by online-order flows that honor this StoreConfig setting.'
          }
        />
        <SettingsToggle
          checked={draft.enableUberDirect}
          onChange={(checked) => update('enableUberDirect', checked)}
          label={isZh ? '启用 Uber Direct' : 'Enable Uber Direct'}
          description={
            isZh
              ? '关闭后新订单不会使用 Uber Direct 配送能力。'
              : 'When disabled, new orders do not use the Uber Direct delivery capability.'
          }
        />
      </StaffPanel>
    </StaffSection>
  );
}

export function StoreAllergySection({
  locale,
  draft,
  update,
}: {
  locale: Locale;
  draft: StoreDraft;
  update: StoreDraftUpdate;
}) {
  const isZh = locale === 'zh';

  const handleAllergen = (code: string, checked: boolean) => {
    const selected = new Set(draft.unsupportedAllergens);
    if (checked) selected.add(code);
    else selected.delete(code);
    update(
      'unsupportedAllergens',
      ALLERGY_OPTIONS.map((option) => option.code).filter((option) =>
        selected.has(option),
      ),
    );
  };

  return (
    <StaffSection
      title={isZh ? '结构化过敏原接单策略' : 'Structured allergy request policy'}
      description={
        isZh
          ? '仅处理结构化 Allergy Request；自由文本备注继续原样传递，不做关键词猜测。'
          : 'Applies only to structured Allergy Requests. Free-text notes continue to pass through without keyword classification.'
      }
    >
      <StaffPanel className="space-y-4 p-5">
        <SettingsField label={isZh ? '处理模式' : 'Handling mode'}>
          <select
            value={draft.allergyHandlingMode}
            onChange={(event) => {
              const value = event.target.value;
              if (
                value === 'RELAY_ALL' ||
                value === 'DENY_LIST' ||
                value === 'DENY_ALL'
              ) {
                update('allergyHandlingMode', value);
              }
            }}
            className={settingsInputClass}
          >
            <option value="RELAY_ALL">{isZh ? '全部接收并转发' : 'Relay all'}</option>
            <option value="DENY_LIST">
              {isZh ? '命中禁用列表自动拒单' : 'Deny configured allergens'}
            </option>
            <option value="DENY_ALL">
              {isZh ? '任何过敏请求都自动拒单' : 'Deny all allergy requests'}
            </option>
          </select>
        </SettingsField>
        <div className="grid gap-2 sm:grid-cols-2 xl:grid-cols-3">
          {ALLERGY_OPTIONS.map((option) => (
            <SettingsToggle
              key={option.code}
              checked={draft.unsupportedAllergens.includes(option.code)}
              onChange={(checked) => handleAllergen(option.code, checked)}
              disabled={draft.allergyHandlingMode !== 'DENY_LIST'}
              label={isZh ? option.zh : option.en}
            />
          ))}
        </div>
      </StaffPanel>
    </StaffSection>
  );
}
