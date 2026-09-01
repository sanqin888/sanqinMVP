'use client';

import { useMemo, useState } from 'react';
import { StaffFeedback } from '@/components/staff/StaffPrimitives';
import {
  updateAdminStoreConfig,
  type StoreConfigView,
} from '@/lib/api/brand-store';
import type { Locale } from '@/lib/i18n/locales';
import {
  StoreAllergySection,
  StoreDeliverySection,
  StoreOnlineOrderSection,
  StoreTimeTaxSection,
} from './StoreOperationsSections';
import {
  StoreAddressSection,
  StoreIdentitySummary,
  StoreStatusSection,
} from './StoreProfileSections';
import { SettingsSaveButton } from './SettingsControls';
import {
  type StoreDraft,
  toStoreDraft,
} from './store-config-model';
import {
  cadToCents,
  isValidTimeZone,
  nonNegativeNumber,
  nullableText,
  optionalNumber,
  percentToRate,
} from './settings-utils';

export function StoreConfigEditor({
  locale,
  storeStableId,
  initialConfig,
}: {
  locale: Locale;
  storeStableId: string;
  initialConfig: StoreConfigView;
}) {
  const isZh = locale === 'zh';
  const initialDraft = useMemo(() => toStoreDraft(initialConfig), [initialConfig]);
  const [draft, setDraft] = useState<StoreDraft>(initialDraft);
  const [baseline, setBaseline] = useState(JSON.stringify(initialDraft));
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const dirty = JSON.stringify(draft) !== baseline;

  const update = <K extends keyof StoreDraft>(key: K, value: StoreDraft[K]) => {
    setDraft((current) => ({ ...current, [key]: value }));
    setSuccess(null);
  };

  const handleSubmit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();

    const deliveryBaseFeeCents = cadToCents(draft.deliveryBaseFeeCad);
    const priorityPerKmCents = cadToCents(draft.priorityPerKmCad);
    const maxDeliveryRangeKm = nonNegativeNumber(draft.maxDeliveryRangeKm);
    const priorityDefaultDistanceKm = nonNegativeNumber(
      draft.priorityDefaultDistanceKm,
    );
    const salesTaxRate = percentToRate(draft.salesTaxPercent);
    const latitude = optionalNumber(draft.latitude);
    const longitude = optionalNumber(draft.longitude);
    const countryCode = draft.countryCode.trim().toUpperCase();

    if (!draft.timezone.trim() || !isValidTimeZone(draft.timezone.trim())) {
      setError(
        isZh ? '请输入有效的 IANA 时区。' : 'Enter a valid IANA time zone.',
      );
      return;
    }
    if (
      deliveryBaseFeeCents == null ||
      priorityPerKmCents == null ||
      maxDeliveryRangeKm == null ||
      priorityDefaultDistanceKm == null ||
      salesTaxRate == null
    ) {
      setError(
        isZh
          ? '请检查配送金额、配送距离和销售税率。'
          : 'Check the delivery amounts, distances, and sales tax rate.',
      );
      return;
    }
    if (
      latitude === undefined ||
      longitude === undefined ||
      (typeof latitude === 'number' && (latitude < -90 || latitude > 90)) ||
      (typeof longitude === 'number' && (longitude < -180 || longitude > 180))
    ) {
      setError(
        isZh
          ? '门店坐标格式不正确；纬度范围为 -90～90，经度范围为 -180～180。'
          : 'Store coordinates are invalid. Latitude must be -90 to 90 and longitude -180 to 180.',
      );
      return;
    }
    if (!/^[A-Z]{2}$/.test(countryCode)) {
      setError(
        isZh
          ? '国家代码必须是两位字母，例如 CA。'
          : 'Country code must be two letters, for example CA.',
      );
      return;
    }

    setSaving(true);
    setError(null);
    setSuccess(null);
    try {
      const saved = await updateAdminStoreConfig(
        {
          timezone: draft.timezone.trim(),
          isTemporarilyClosed: draft.isTemporarilyClosed,
          temporaryCloseReason: draft.isTemporarilyClosed
            ? nullableText(draft.temporaryCloseReason)
            : null,
          publicNotice: nullableText(draft.publicNotice),
          publicNoticeEn: nullableText(draft.publicNoticeEn),
          deliveryBaseFeeCents,
          priorityPerKmCents,
          maxDeliveryRangeKm,
          priorityDefaultDistanceKm,
          latitude,
          longitude,
          addressLine1: nullableText(draft.addressLine1),
          addressLine2: nullableText(draft.addressLine2),
          city: nullableText(draft.city),
          province: nullableText(draft.province),
          postalCode: nullableText(draft.postalCode),
          countryCode,
          phone: nullableText(draft.phone),
          contactName: nullableText(draft.contactName),
          salesTaxRate,
          enableUberDirect: draft.enableUberDirect,
          autoAcceptOnlineOrders: draft.autoAcceptOnlineOrders,
          allergyHandlingMode: draft.allergyHandlingMode,
          unsupportedAllergens: draft.unsupportedAllergens,
        },
        storeStableId,
      );
      const next = toStoreDraft(saved);
      setDraft(next);
      setBaseline(JSON.stringify(next));
      setSuccess(isZh ? '门店配置已保存。' : 'Store configuration saved.');
    } catch (saveError) {
      console.error(saveError);
      setError(
        isZh
          ? '门店配置保存失败，请检查输入后重试。'
          : 'Failed to save store configuration. Check the fields and try again.',
      );
    } finally {
      setSaving(false);
    }
  };

  return (
    <form id="store-config-form" onSubmit={handleSubmit} className="space-y-6">
      <div className="flex flex-col gap-3 rounded-2xl border border-slate-200 bg-white p-4 shadow-sm sm:flex-row sm:items-center sm:justify-between">
        <StoreIdentitySummary locale={locale} config={initialConfig} />
        <SettingsSaveButton saving={saving} disabled={!dirty}>
          {saving
            ? isZh
              ? '保存中…'
              : 'Saving…'
            : isZh
              ? '保存门店配置'
              : 'Save store settings'}
        </SettingsSaveButton>
      </div>

      {error ? <StaffFeedback tone="danger">{error}</StaffFeedback> : null}
      {success ? <StaffFeedback tone="success">{success}</StaffFeedback> : null}

      <div className="grid gap-6 2xl:grid-cols-2">
        <StoreAddressSection locale={locale} draft={draft} update={update} />
        <StoreStatusSection locale={locale} draft={draft} update={update} />
      </div>
      <div className="grid gap-6 2xl:grid-cols-2">
        <StoreTimeTaxSection locale={locale} draft={draft} update={update} />
        <StoreDeliverySection locale={locale} draft={draft} update={update} />
      </div>
      <StoreOnlineOrderSection locale={locale} draft={draft} update={update} />
      <StoreAllergySection locale={locale} draft={draft} update={update} />
    </form>
  );
}
