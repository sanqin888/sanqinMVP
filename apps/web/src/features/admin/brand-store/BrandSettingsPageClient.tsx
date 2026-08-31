'use client';

import { useEffect, useMemo, useState } from 'react';
import {
  StaffFeedback,
  StaffPage,
  StaffPageHeader,
  StaffPanel,
  StaffSection,
} from '@/components/staff/StaffPrimitives';
import {
  fetchAdminBrandConfig,
  updateAdminBrandConfig,
  type BrandConfigView,
} from '@/lib/api/brand-store';
import type { Locale } from '@/lib/i18n/locales';
import {
  SettingsField,
  SettingsSaveButton,
  settingsInputClass,
} from './SettingsControls';
import { nullableText } from './settings-utils';

type BrandDraft = {
  brandNameZh: string;
  brandNameEn: string;
  siteUrl: string;
  emailFromNameZh: string;
  emailFromNameEn: string;
  emailFromAddress: string;
  smsSignature: string;
  supportPhone: string;
  supportEmail: string;
  wechatAlipayExchangeRate: string;
};

function toDraft(config: BrandConfigView): BrandDraft {
  return {
    brandNameZh: config.brandNameZh ?? '',
    brandNameEn: config.brandNameEn ?? '',
    siteUrl: config.siteUrl ?? '',
    emailFromNameZh: config.emailFromNameZh ?? '',
    emailFromNameEn: config.emailFromNameEn ?? '',
    emailFromAddress: config.emailFromAddress ?? '',
    smsSignature: config.smsSignature ?? '',
    supportPhone: config.supportPhone ?? '',
    supportEmail: config.supportEmail ?? '',
    wechatAlipayExchangeRate: String(config.wechatAlipayExchangeRate),
  };
}

export function BrandSettingsPageClient({ locale }: { locale: Locale }) {
  const isZh = locale === 'zh';
  const [draft, setDraft] = useState<BrandDraft | null>(null);
  const [baseline, setBaseline] = useState('');
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);

    void fetchAdminBrandConfig()
      .then((config) => {
        if (cancelled) return;
        const next = toDraft(config);
        setDraft(next);
        setBaseline(JSON.stringify(next));
      })
      .catch((loadError) => {
        if (cancelled) return;
        console.error(loadError);
        setError(
          isZh
            ? '品牌配置加载失败，请稍后重试。'
            : 'Failed to load brand configuration. Please try again.',
        );
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [isZh]);

  const dirty = useMemo(
    () => draft !== null && JSON.stringify(draft) !== baseline,
    [baseline, draft],
  );

  const update = <K extends keyof BrandDraft>(key: K, value: BrandDraft[K]) => {
    setDraft((current) => (current ? { ...current, [key]: value } : current));
    setSuccess(null);
  };

  const handleSubmit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!draft) return;

    const exchangeRate = Number(draft.wechatAlipayExchangeRate);
    if (!Number.isFinite(exchangeRate) || exchangeRate <= 0) {
      setError(
        isZh
          ? '微信/支付宝备用汇率必须大于 0。'
          : 'The WeChat/Alipay fallback rate must be greater than 0.',
      );
      return;
    }

    setSaving(true);
    setError(null);
    setSuccess(null);
    try {
      const saved = await updateAdminBrandConfig({
        brandNameZh: nullableText(draft.brandNameZh),
        brandNameEn: nullableText(draft.brandNameEn),
        siteUrl: nullableText(draft.siteUrl),
        emailFromNameZh: nullableText(draft.emailFromNameZh),
        emailFromNameEn: nullableText(draft.emailFromNameEn),
        emailFromAddress: nullableText(draft.emailFromAddress),
        smsSignature: nullableText(draft.smsSignature),
        supportPhone: nullableText(draft.supportPhone),
        supportEmail: nullableText(draft.supportEmail),
        wechatAlipayExchangeRate: exchangeRate,
      });
      const next = toDraft(saved);
      setDraft(next);
      setBaseline(JSON.stringify(next));
      setSuccess(isZh ? '品牌配置已保存。' : 'Brand configuration saved.');
    } catch (saveError) {
      console.error(saveError);
      setError(
        isZh
          ? '品牌配置保存失败，请检查输入后重试。'
          : 'Failed to save brand configuration. Check the fields and try again.',
      );
    } finally {
      setSaving(false);
    }
  };

  return (
    <StaffPage>
      <StaffPageHeader
        eyebrow={isZh ? '品牌管理' : 'Brand management'}
        title={isZh ? '品牌配置' : 'Brand configuration'}
        description={
          isZh
            ? '管理品牌名称、对外客服身份、消息发送身份和 POS 支付备用汇率。会员积分与等级策略由 Benefits 模块独立管理。'
            : 'Manage brand identity, support contacts, messaging sender identity, and the POS payment fallback exchange rate. Loyalty policy is managed separately by Benefits.'
        }
        actions={
          <SettingsSaveButton
            form="brand-settings-form"
            saving={saving}
            disabled={!dirty || loading || !draft}
          >
            {saving
              ? isZh
                ? '保存中…'
                : 'Saving…'
              : isZh
                ? '保存品牌配置'
                : 'Save brand settings'}
          </SettingsSaveButton>
        }
      />

      {error ? <StaffFeedback tone="danger">{error}</StaffFeedback> : null}
      {success ? <StaffFeedback tone="success">{success}</StaffFeedback> : null}

      {loading ? (
        <StaffPanel className="p-6 text-sm text-slate-500">
          {isZh ? '正在加载品牌配置…' : 'Loading brand configuration…'}
        </StaffPanel>
      ) : !draft ? (
        <StaffFeedback tone="danger">
          {isZh
            ? '当前无法读取 BrandConfig。'
            : 'BrandConfig is currently unavailable.'}
        </StaffFeedback>
      ) : (
        <form id="brand-settings-form" onSubmit={handleSubmit} className="space-y-6">
          <div className="grid gap-6 xl:grid-cols-2">
            <StaffSection
              title={isZh ? '品牌基础信息' : 'Brand basics'}
              description={
                isZh
                  ? '用于顾客端、账单和运营界面的品牌展示。'
                  : 'Used for customer-facing, receipt, and operations branding.'
              }
            >
              <StaffPanel className="grid gap-4 p-5 md:grid-cols-2">
                <SettingsField label={isZh ? '品牌名（中文）' : 'Brand name (ZH)'}>
                  <input
                    value={draft.brandNameZh}
                    onChange={(event) => update('brandNameZh', event.target.value)}
                    className={settingsInputClass}
                    autoComplete="organization"
                  />
                </SettingsField>
                <SettingsField label={isZh ? '品牌名（英文）' : 'Brand name (EN)'}>
                  <input
                    value={draft.brandNameEn}
                    onChange={(event) => update('brandNameEn', event.target.value)}
                    className={settingsInputClass}
                  />
                </SettingsField>
                <SettingsField
                  label={isZh ? '官方网站' : 'Website'}
                  className="md:col-span-2"
                >
                  <input
                    type="url"
                    value={draft.siteUrl}
                    onChange={(event) => update('siteUrl', event.target.value)}
                    placeholder="https://sanq.ca"
                    className={settingsInputClass}
                    autoComplete="url"
                  />
                </SettingsField>
              </StaffPanel>
            </StaffSection>

            <StaffSection
              title={isZh ? '客服联系方式' : 'Support contacts'}
              description={
                isZh
                  ? '品牌级客服联系方式，可用于网站、邮件和账单。'
                  : 'Brand-level support contacts used by the website, email, and receipts.'
              }
            >
              <StaffPanel className="grid gap-4 p-5 md:grid-cols-2">
                <SettingsField label={isZh ? '客服电话' : 'Support phone'}>
                  <input
                    type="tel"
                    value={draft.supportPhone}
                    onChange={(event) => update('supportPhone', event.target.value)}
                    className={settingsInputClass}
                    autoComplete="tel"
                  />
                </SettingsField>
                <SettingsField label={isZh ? '客服邮箱' : 'Support email'}>
                  <input
                    type="email"
                    value={draft.supportEmail}
                    onChange={(event) => update('supportEmail', event.target.value)}
                    className={settingsInputClass}
                    autoComplete="email"
                  />
                </SettingsField>
              </StaffPanel>
            </StaffSection>
          </div>

          <StaffSection
            title={isZh ? '消息发送身份' : 'Messaging sender identity'}
            description={
              isZh
                ? '控制系统邮件的发件名称、发件地址与短信签名。'
                : 'Controls system email sender names, sender address, and SMS signature.'
            }
          >
            <StaffPanel className="grid gap-4 p-5 md:grid-cols-2 xl:grid-cols-4">
              <SettingsField label={isZh ? '邮件名称（中文）' : 'Email name (ZH)'}>
                <input
                  value={draft.emailFromNameZh}
                  onChange={(event) => update('emailFromNameZh', event.target.value)}
                  className={settingsInputClass}
                />
              </SettingsField>
              <SettingsField label={isZh ? '邮件名称（英文）' : 'Email name (EN)'}>
                <input
                  value={draft.emailFromNameEn}
                  onChange={(event) => update('emailFromNameEn', event.target.value)}
                  className={settingsInputClass}
                />
              </SettingsField>
              <SettingsField label={isZh ? '发件邮箱' : 'Sender email'}>
                <input
                  type="email"
                  value={draft.emailFromAddress}
                  onChange={(event) => update('emailFromAddress', event.target.value)}
                  className={settingsInputClass}
                />
              </SettingsField>
              <SettingsField label={isZh ? '短信签名' : 'SMS signature'}>
                <input
                  value={draft.smsSignature}
                  onChange={(event) => update('smsSignature', event.target.value)}
                  className={settingsInputClass}
                />
              </SettingsField>
            </StaffPanel>
          </StaffSection>

          <StaffSection
            title={isZh ? '支付备用汇率' : 'Payment fallback exchange rate'}
            description={
              isZh
                ? '正常情况下 POS 使用自动汇率；只有自动汇率与缓存都不可用时才使用这里的值。'
                : 'POS normally uses the automatic rate. This value is only used when both the automatic rate and cached rate are unavailable.'
            }
          >
            <StaffPanel className="max-w-xl p-5">
              <SettingsField
                label={isZh ? '微信/支付宝备用汇率' : 'WeChat/Alipay fallback rate'}
                description={
                  isZh
                    ? '表示 1 CAD 对应的 CNY，保存时由后端统一保留两位小数。'
                    : 'CNY per 1 CAD. The server normalizes the saved value to two decimals.'
                }
              >
                <input
                  type="number"
                  min="0.01"
                  step="0.01"
                  value={draft.wechatAlipayExchangeRate}
                  onChange={(event) =>
                    update('wechatAlipayExchangeRate', event.target.value)
                  }
                  className={settingsInputClass}
                />
              </SettingsField>
            </StaffPanel>
          </StaffSection>
        </form>
      )}
    </StaffPage>
  );
}
