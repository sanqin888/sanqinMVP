// apps/web/src/app/[locale]/admin/(protected)/coupons/page.tsx
'use client';

import { useEffect, useMemo, useState } from 'react';
import { apiFetch } from '@/lib/api/client';

type CouponTemplate = {
  couponStableId: string;
  name: string;
  status: 'DRAFT' | 'ACTIVE' | 'PAUSED' | 'ENDED';
  validFrom: string | null;
  validTo: string | null;
  useRule: unknown;
  issueRule: unknown | null;
  createdAt: string;
  updatedAt: string;
};

type CouponProgram = {
  programStableId: string;
  name: string;
  status: 'DRAFT' | 'ACTIVE' | 'PAUSED' | 'ENDED';
  distributionType: 'AUTOMATIC_TRIGGER' | 'MANUAL_CLAIM' | 'PROMO_CODE' | 'ADMIN_PUSH';
  triggerType: 'SIGNUP_COMPLETED' | 'REFERRAL_QUALIFIED' | null;
  validFrom: string | null;
  validTo: string | null;
  promoCode: string | null;
  totalLimit: number | null;
  perUserLimit: number;
  eligibility: unknown | null;
  items: unknown;
  createdAt: string;
  updatedAt: string;
};

type TemplateFormState = {
  couponStableId: string;
  name: string;
  status: CouponTemplate['status'];
  validFrom: string;
  validTo: string;
  useRuleType: 'FIXED_CENTS' | 'PERCENT';
  amountCents: string;
  percentOff: string;
  minSubtotalCents: string;
  issueRuleMode: '' | 'MANUAL' | 'AUTO';
};

type ProgramFormState = {
  programStableId: string;
  name: string;
  status: CouponProgram['status'];
  distributionType: CouponProgram['distributionType'];
  triggerType: Exclude<CouponProgram['triggerType'], null>;
  validFrom: string;
  validTo: string;
  promoCode: string;
  totalLimit: string;
  perUserLimit: string;
  eligibilityKeys: string[];
  selectedCouponIds: string[];
};

const emptyTemplateForm: TemplateFormState = {
  couponStableId: '',
  name: '',
  status: 'DRAFT',
  validFrom: '',
  validTo: '',
  useRuleType: 'FIXED_CENTS',
  amountCents: '',
  percentOff: '',
  minSubtotalCents: '',
  issueRuleMode: '',
};

const emptyProgramForm: ProgramFormState = {
  programStableId: '',
  name: '',
  status: 'DRAFT',
  distributionType: 'AUTOMATIC_TRIGGER',
  triggerType: 'SIGNUP_COMPLETED',
  validFrom: '',
  validTo: '',
  promoCode: '',
  totalLimit: '',
  perUserLimit: '1',
  eligibilityKeys: [],
  selectedCouponIds: [],
};

const eligibilityPresets = [
  {
    id: 'requireReferralExists',
    label: '必须存在推荐关系',
  },
  {
    id: 'requireReferrerSignupCompleted',
    label: '推荐人完成注册',
  },
];

function formatDateRange(from?: string | null, to?: string | null) {
  if (!from && !to) return '—';
  return `${from ? new Date(from).toLocaleDateString() : '—'} ~ ${
    to ? new Date(to).toLocaleDateString() : '—'
  }`;
}

function getRuleType(rule: unknown) {
  if (!rule || typeof rule !== 'object') return '—';
  const record = rule as Record<string, unknown>;
  return typeof record.type === 'string' ? record.type : '—';
}

function getItemsCount(items: unknown) {
  if (Array.isArray(items)) return items.length;
  return 0;
}

function formatCurrencyFromCents(cents: number) {
  return `¥${(cents / 100).toFixed(2)}`;
}

function buildUseRuleFromForm(form: TemplateFormState) {
  const minSubtotalCents = Number(form.minSubtotalCents);
  const constraints =
    form.minSubtotalCents.trim() === '' || Number.isNaN(minSubtotalCents)
      ? undefined
      : { minSubtotalCents };
  if (form.useRuleType === 'PERCENT') {
    return {
      type: 'PERCENT',
      applyTo: 'ORDER',
      percentOff: Number(form.percentOff),
      constraints,
    };
  }
  return {
    type: 'FIXED_CENTS',
    applyTo: 'ORDER',
    amountCents: Number(form.amountCents),
    constraints,
  };
}

function parseTemplateFormFromRule(
  template: CouponTemplate,
): Pick<
  TemplateFormState,
  'useRuleType' | 'amountCents' | 'percentOff' | 'minSubtotalCents'
> {
  if (!template.useRule || typeof template.useRule !== 'object') {
    return {
      useRuleType: 'FIXED_CENTS',
      amountCents: '',
      percentOff: '',
      minSubtotalCents: '',
    };
  }
  const record = template.useRule as Record<string, unknown>;
  const constraints =
    record.constraints && typeof record.constraints === 'object'
      ? (record.constraints as Record<string, unknown>)
      : null;
  const minSubtotalValue =
    constraints && typeof constraints.minSubtotalCents === 'number'
      ? String(constraints.minSubtotalCents)
      : '';

  if (record.type === 'PERCENT') {
    return {
      useRuleType: 'PERCENT',
      amountCents: '',
      percentOff:
        typeof record.percentOff === 'number' ? String(record.percentOff) : '',
      minSubtotalCents: minSubtotalValue,
    };
  }

  return {
    useRuleType: 'FIXED_CENTS',
    amountCents:
      typeof record.amountCents === 'number' ? String(record.amountCents) : '',
    percentOff: '',
    minSubtotalCents: minSubtotalValue,
  };
}

export default function AdminCouponsPage() {
  const [templates, setTemplates] = useState<CouponTemplate[]>([]);
  const [programs, setPrograms] = useState<CouponProgram[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);

  const [templateForm, setTemplateForm] =
    useState<TemplateFormState>(emptyTemplateForm);
  const [templateEditingId, setTemplateEditingId] = useState<string | null>(
    null,
  );
  const [templateError, setTemplateError] = useState<string | null>(null);
  const [templateSaving, setTemplateSaving] = useState(false);

  const [programForm, setProgramForm] =
    useState<ProgramFormState>(emptyProgramForm);
  const [programEditingId, setProgramEditingId] = useState<string | null>(null);
  const [programError, setProgramError] = useState<string | null>(null);
  const [programSaving, setProgramSaving] = useState(false);

  async function fetchData() {
    setLoading(true);
    setLoadError(null);
    try {
      const [templateData, programData] = await Promise.all([
        apiFetch<CouponTemplate[]>('/admin/coupons/templates'),
        apiFetch<CouponProgram[]>('/admin/coupons/programs'),
      ]);
      setTemplates(templateData);
      setPrograms(programData);
    } catch (error) {
      setLoadError((error as Error).message);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void fetchData();
  }, []);

  const templateCount = templates.length;
  const programCount = programs.length;

  const templateHint = useMemo(
    () => (templateEditingId ? '更新模板' : '创建模板'),
    [templateEditingId],
  );
  const templatePreview = useMemo(() => {
    const name = templateForm.name.trim() || '未命名优惠券';
    const minSubtotalCents = Number(templateForm.minSubtotalCents);
    const minSubtotalText =
      templateForm.minSubtotalCents.trim() === '' ||
      Number.isNaN(minSubtotalCents)
        ? '无门槛'
        : `满 ${formatCurrencyFromCents(minSubtotalCents)} 可用`;

    if (templateForm.useRuleType === 'PERCENT') {
      const percent = Number(templateForm.percentOff);
      const percentText =
        templateForm.percentOff.trim() === '' || Number.isNaN(percent)
          ? '折扣未设置'
          : `${100 - percent}% OFF`;
      return {
        name,
        badge: '折扣券',
        value: percentText,
        limit: minSubtotalText,
      };
    }

    const amountCents = Number(templateForm.amountCents);
    const amountText =
      templateForm.amountCents.trim() === '' || Number.isNaN(amountCents)
        ? '金额未设置'
        : formatCurrencyFromCents(amountCents);

    return {
      name,
      badge: '立减券',
      value: amountText,
      limit: minSubtotalText,
    };
  }, [
    templateForm.amountCents,
    templateForm.minSubtotalCents,
    templateForm.name,
    templateForm.percentOff,
    templateForm.useRuleType,
  ]);
  const programHint = useMemo(
    () => (programEditingId ? '更新礼包' : '创建礼包'),
    [programEditingId],
  );

  function resetTemplateForm() {
    setTemplateForm(emptyTemplateForm);
    setTemplateEditingId(null);
    setTemplateError(null);
  }

  function resetProgramForm() {
    setProgramForm(emptyProgramForm);
    setProgramEditingId(null);
    setProgramError(null);
  }

  async function handleTemplateSubmit() {
    setTemplateSaving(true);
    setTemplateError(null);
    try {
      const useRule = buildUseRuleFromForm(templateForm);
      if (templateForm.useRuleType === 'PERCENT') {
        if (!templateForm.percentOff.trim()) {
          throw new Error('请输入折扣比例');
        }
        const percentValue = Number(templateForm.percentOff);
        if (Number.isNaN(percentValue) || percentValue <= 0) {
          throw new Error('折扣比例必须为正数');
        }
      } else if (!templateForm.amountCents.trim()) {
        throw new Error('请输入立减金额（分）');
      } else {
        const amountValue = Number(templateForm.amountCents);
        if (Number.isNaN(amountValue) || amountValue <= 0) {
          throw new Error('立减金额必须为正数');
        }
      }
      const issueRule =
        templateForm.issueRuleMode === ''
          ? null
          : { mode: templateForm.issueRuleMode };
      const payload = {
        couponStableId: templateForm.couponStableId || undefined,
        name: templateForm.name.trim(),
        status: templateForm.status,
        validFrom: templateForm.validFrom || null,
        validTo: templateForm.validTo || null,
        useRule,
        issueRule,
      };

      if (!payload.name) throw new Error('模板名称不能为空');

      if (templateEditingId) {
        await apiFetch(`/admin/coupons/templates/${templateEditingId}`, {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload),
        });
      } else {
        await apiFetch('/admin/coupons/templates', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload),
        });
      }
      await fetchData();
      resetTemplateForm();
    } catch (error) {
      setTemplateError((error as Error).message);
    } finally {
      setTemplateSaving(false);
    }
  }

  async function handleProgramSubmit() {
    setProgramSaving(true);
    setProgramError(null);
    try {
      const items = programForm.selectedCouponIds.map((couponStableId) => ({
        couponStableId,
        quantity: 1,
      }));
      if (items.length === 0) throw new Error('礼包内容不能为空');
      if (
        programForm.distributionType === 'PROMO_CODE' &&
        !programForm.promoCode.trim()
      ) {
        throw new Error('请输入兑换码');
      }
      const eligibility =
        programForm.eligibilityKeys.length > 0
          ? Object.fromEntries(
              programForm.eligibilityKeys.map((key) => [key, true]),
            )
          : null;
      const totalLimit = programForm.totalLimit.trim()
        ? Number(programForm.totalLimit)
        : null;
      if (programForm.totalLimit.trim() && Number.isNaN(totalLimit)) {
        throw new Error('总发放量必须为数字');
      }
      const perUserLimit = programForm.perUserLimit.trim()
        ? Number(programForm.perUserLimit)
        : 1;
      if (Number.isNaN(perUserLimit) || perUserLimit <= 0) {
        throw new Error('单人限领必须为正数');
      }
      const payload = {
        programStableId: programForm.programStableId || undefined,
        name: programForm.name.trim(),
        status: programForm.status,
        distributionType: programForm.distributionType,
        triggerType:
          programForm.distributionType === 'AUTOMATIC_TRIGGER'
            ? programForm.triggerType
            : null,
        validFrom: programForm.validFrom || null,
        validTo: programForm.validTo || null,
        promoCode:
          programForm.distributionType === 'PROMO_CODE'
            ? programForm.promoCode.trim()
            : null,
        totalLimit,
        perUserLimit,
        eligibility,
        items,
      };

      if (!payload.name) throw new Error('礼包名称不能为空');

      if (programEditingId) {
        await apiFetch(`/admin/coupons/programs/${programEditingId}`, {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload),
        });
      } else {
        await apiFetch('/admin/coupons/programs', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload),
        });
      }
      await fetchData();
      resetProgramForm();
    } catch (error) {
      setProgramError((error as Error).message);
    } finally {
      setProgramSaving(false);
    }
  }

  function handleEditTemplate(template: CouponTemplate) {
    const templateRuleState = parseTemplateFormFromRule(template);
    const issueRuleMode =
      template.issueRule && typeof template.issueRule === 'object'
        ? ((template.issueRule as Record<string, unknown>)
            .mode as TemplateFormState['issueRuleMode']) ?? ''
        : '';
    setTemplateEditingId(template.couponStableId);
    setTemplateForm({
      couponStableId: template.couponStableId,
      name: template.name,
      status: template.status,
      validFrom: template.validFrom ? template.validFrom.slice(0, 10) : '',
      validTo: template.validTo ? template.validTo.slice(0, 10) : '',
      ...templateRuleState,
      issueRuleMode:
        issueRuleMode === 'MANUAL' || issueRuleMode === 'AUTO'
          ? issueRuleMode
          : '',
    });
  }

  function handleEditProgram(program: CouponProgram) {
    const rawItems = Array.isArray(program.items) ? program.items : [];
    const selectedCouponIds = rawItems
      .map((item) => {
        if (!item || typeof item !== 'object') return null;
        const record = item as Record<string, unknown>;
        return typeof record.couponStableId === 'string'
          ? record.couponStableId
          : null;
      })
      .filter((value): value is string => Boolean(value));
    const eligibilityKeys =
      program.eligibility && typeof program.eligibility === 'object'
        ? Object.keys(program.eligibility as Record<string, unknown>)
        : [];
    setProgramEditingId(program.programStableId);
    setProgramForm({
      programStableId: program.programStableId,
      name: program.name,
      status: program.status,
      distributionType: program.distributionType,
      triggerType: program.triggerType ?? 'SIGNUP_COMPLETED',
      validFrom: program.validFrom ? program.validFrom.slice(0, 10) : '',
      validTo: program.validTo ? program.validTo.slice(0, 10) : '',
      promoCode: program.promoCode ?? '',
      totalLimit:
        typeof program.totalLimit === 'number'
          ? String(program.totalLimit)
          : '',
      perUserLimit: String(program.perUserLimit ?? 1),
      eligibilityKeys,
      selectedCouponIds,
    });
  }

  return (
    <main className="mx-auto flex max-w-6xl flex-col gap-6 p-6">
      <header className="space-y-2">
        <h1 className="text-3xl font-bold">优惠券管理</h1>
        <p className="text-muted-foreground">
          配置优惠券模板与礼包规则，支撑注册完成触发和推荐奖励发放。
        </p>
      </header>

      {loadError && (
        <div className="rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-600">
          加载失败：{loadError}
        </div>
      )}

      <section className="grid gap-6 lg:grid-cols-[1.2fr_1fr]">
        <div className="rounded-2xl border p-6 space-y-5">
          <div className="flex items-center justify-between">
            <div>
              <h2 className="text-xl font-semibold">优惠券模板</h2>
              <p className="text-sm text-muted-foreground">
                当前共 {templateCount} 个模板
              </p>
            </div>
            <button
              onClick={() => resetTemplateForm()}
              className="rounded-md border px-3 py-2 text-sm hover:bg-accent"
            >
              新建模板
            </button>
          </div>

          <div className="space-y-3">
            {loading ? (
              <div className="text-sm text-muted-foreground">加载中…</div>
            ) : templates.length === 0 ? (
              <div className="text-sm text-muted-foreground">
                暂无模板，请先创建。
              </div>
            ) : (
              templates.map((template) => (
                <div
                  key={template.couponStableId}
                  className="rounded-xl border p-4 space-y-2"
                >
                  <div className="flex items-center justify-between">
                    <div className="text-base font-semibold">
                      {template.name}
                    </div>
                    <span className="rounded-full bg-primary/10 px-3 py-1 text-xs font-medium text-primary">
                      {template.status}
                    </span>
                  </div>
                  <div className="text-sm text-muted-foreground">
                    StableId：{template.couponStableId}
                  </div>
                  <div className="text-sm text-muted-foreground">
                    有效期：{formatDateRange(template.validFrom, template.validTo)}
                  </div>
                  <div className="text-sm text-muted-foreground">
                    规则类型：{getRuleType(template.useRule)}
                  </div>
                  <button
                    onClick={() => handleEditTemplate(template)}
                    className="rounded-md border px-3 py-1 text-sm hover:bg-accent"
                  >
                    编辑
                  </button>
                </div>
              ))
            )}
          </div>
        </div>

        <div className="rounded-2xl border p-6 space-y-4">
          <h2 className="text-xl font-semibold">{templateHint}</h2>
          <div className="space-y-3 text-sm">
            <div className="grid gap-3 md:grid-cols-2">
              <label className="space-y-1">
                <span className="text-muted-foreground">模板名称</span>
                <input
                  className="w-full rounded-md border px-3 py-2"
                  value={templateForm.name}
                  onChange={(e) =>
                    setTemplateForm((prev) => ({
                      ...prev,
                      name: e.target.value,
                    }))
                  }
                />
              </label>
              <label className="space-y-1">
                <span className="text-muted-foreground">状态</span>
                <select
                  className="w-full rounded-md border px-3 py-2"
                  value={templateForm.status}
                  onChange={(e) =>
                    setTemplateForm((prev) => ({
                      ...prev,
                      status: e.target.value as CouponTemplate['status'],
                    }))
                  }
                >
                  <option value="DRAFT">DRAFT</option>
                  <option value="ACTIVE">ACTIVE</option>
                  <option value="PAUSED">PAUSED</option>
                  <option value="ENDED">ENDED</option>
                </select>
              </label>
              <label className="space-y-1">
                <span className="text-muted-foreground">有效期开始</span>
                <input
                  type="date"
                  className="w-full rounded-md border px-3 py-2"
                  value={templateForm.validFrom}
                  onChange={(e) =>
                    setTemplateForm((prev) => ({
                      ...prev,
                      validFrom: e.target.value,
                    }))
                  }
                />
              </label>
              <label className="space-y-1">
                <span className="text-muted-foreground">有效期结束</span>
                <input
                  type="date"
                  className="w-full rounded-md border px-3 py-2"
                  value={templateForm.validTo}
                  onChange={(e) =>
                    setTemplateForm((prev) => ({
                      ...prev,
                      validTo: e.target.value,
                    }))
                  }
                />
              </label>
            </div>
            <label className="space-y-1">
              <span className="text-muted-foreground">模板 StableId（可选）</span>
              <input
                className="w-full rounded-md border px-3 py-2"
                value={templateForm.couponStableId}
                onChange={(e) =>
                  setTemplateForm((prev) => ({
                    ...prev,
                    couponStableId: e.target.value,
                  }))
                }
              />
            </label>
            <div className="space-y-3 rounded-lg border p-4">
              <div className="text-sm font-semibold">使用规则构建器</div>
              <div className="grid gap-3 md:grid-cols-2">
                <label className="space-y-1">
                  <span className="text-muted-foreground">优惠类型</span>
                  <select
                    className="w-full rounded-md border px-3 py-2"
                    value={templateForm.useRuleType}
                    onChange={(e) =>
                      setTemplateForm((prev) => ({
                        ...prev,
                        useRuleType: e.target
                          .value as TemplateFormState['useRuleType'],
                      }))
                    }
                  >
                    <option value="FIXED_CENTS">立减</option>
                    <option value="PERCENT">折扣</option>
                  </select>
                </label>
                <label className="space-y-1">
                  <span className="text-muted-foreground">最低消费（分）</span>
                  <input
                    type="number"
                    min={0}
                    className="w-full rounded-md border px-3 py-2"
                    value={templateForm.minSubtotalCents}
                    onChange={(e) =>
                      setTemplateForm((prev) => ({
                        ...prev,
                        minSubtotalCents: e.target.value,
                      }))
                    }
                  />
                </label>
                {templateForm.useRuleType === 'FIXED_CENTS' ? (
                  <label className="space-y-1">
                    <span className="text-muted-foreground">立减金额（分）</span>
                    <input
                      type="number"
                      min={1}
                      className="w-full rounded-md border px-3 py-2"
                      value={templateForm.amountCents}
                      onChange={(e) =>
                        setTemplateForm((prev) => ({
                          ...prev,
                          amountCents: e.target.value,
                        }))
                      }
                    />
                  </label>
                ) : (
                  <label className="space-y-1">
                    <span className="text-muted-foreground">折扣比例（1-100）</span>
                    <input
                      type="number"
                      min={1}
                      max={100}
                      className="w-full rounded-md border px-3 py-2"
                      value={templateForm.percentOff}
                      onChange={(e) =>
                        setTemplateForm((prev) => ({
                          ...prev,
                          percentOff: e.target.value,
                        }))
                      }
                    />
                  </label>
                )}
              </div>
            </div>
            <label className="space-y-1">
              <span className="text-muted-foreground">发放规则（可选）</span>
              <select
                className="w-full rounded-md border px-3 py-2"
                value={templateForm.issueRuleMode}
                onChange={(e) =>
                  setTemplateForm((prev) => ({
                    ...prev,
                    issueRuleMode: e.target
                      .value as TemplateFormState['issueRuleMode'],
                  }))
                }
              >
                <option value="">不设置发放规则</option>
                <option value="MANUAL">手动发放</option>
                <option value="AUTO">自动发放</option>
              </select>
              <div className="text-xs text-muted-foreground">
                选择触发方式，未选择则不设置发放规则。
              </div>
            </label>
          </div>
          <div className="rounded-xl border bg-muted/40 p-4">
            <div className="text-xs text-muted-foreground">预览</div>
            <div className="mt-3 flex items-center justify-between rounded-lg border bg-background p-4">
              <div>
                <div className="text-sm text-muted-foreground">
                  {templatePreview.badge}
                </div>
                <div className="text-lg font-semibold">
                  {templatePreview.name}
                </div>
                <div className="text-xs text-muted-foreground">
                  {templatePreview.limit}
                </div>
              </div>
              <div className="text-2xl font-bold text-primary">
                {templatePreview.value}
              </div>
            </div>
          </div>
          {templateError && (
            <div className="text-sm text-red-600">错误：{templateError}</div>
          )}
          <div className="flex flex-wrap gap-3">
            <button
              onClick={() => void handleTemplateSubmit()}
              disabled={templateSaving}
              className="rounded-md border px-4 py-2 text-sm hover:bg-accent disabled:opacity-60"
            >
              {templateEditingId ? '保存修改' : '创建模板'}
            </button>
            {templateEditingId && (
              <button
                onClick={() => resetTemplateForm()}
                className="rounded-md border px-4 py-2 text-sm hover:bg-accent"
              >
                取消编辑
              </button>
            )}
          </div>
        </div>
      </section>

      <section className="grid gap-6 lg:grid-cols-[1.2fr_1fr]">
        <div className="rounded-2xl border p-6 space-y-5">
          <div className="flex items-center justify-between">
            <div>
              <h2 className="text-xl font-semibold">礼包编排</h2>
              <p className="text-sm text-muted-foreground">
                当前共 {programCount} 个礼包
              </p>
            </div>
            <button
              onClick={() => resetProgramForm()}
              className="rounded-md border px-3 py-2 text-sm hover:bg-accent"
            >
              新建礼包
            </button>
          </div>

          <div className="space-y-3">
            {loading ? (
              <div className="text-sm text-muted-foreground">加载中…</div>
            ) : programs.length === 0 ? (
              <div className="text-sm text-muted-foreground">
                暂无礼包，请先创建。
              </div>
            ) : (
              programs.map((program) => (
                <div
                  key={program.programStableId}
                  className="rounded-xl border p-4 space-y-2"
                >
                  <div className="flex items-center justify-between">
                    <div className="text-base font-semibold">{program.name}</div>
                    <span className="rounded-full bg-primary/10 px-3 py-1 text-xs font-medium text-primary">
                      {program.status}
                    </span>
                  </div>
                  <div className="text-sm text-muted-foreground">
                    StableId：{program.programStableId}
                  </div>
                  <div className="text-sm text-muted-foreground">
                    触发器：{program.triggerType ?? '—'}
                  </div>
                  <div className="text-sm text-muted-foreground">
                    发放方式：{program.distributionType}
                  </div>
                  {program.distributionType === 'PROMO_CODE' && (
                    <div className="text-sm text-muted-foreground">
                      兑换码：{program.promoCode ?? '—'}
                    </div>
                  )}
                  <div className="text-sm text-muted-foreground">
                    有效期：{formatDateRange(program.validFrom, program.validTo)}
                  </div>
                  <div className="text-sm text-muted-foreground">
                    券数量：{getItemsCount(program.items)}
                  </div>
                  <button
                    onClick={() => handleEditProgram(program)}
                    className="rounded-md border px-3 py-1 text-sm hover:bg-accent"
                  >
                    编辑
                  </button>
                </div>
              ))
            )}
          </div>
        </div>

        <div className="rounded-2xl border p-6 space-y-4">
          <h2 className="text-xl font-semibold">{programHint}</h2>
          <div className="space-y-3 text-sm">
            <div className="grid gap-3 md:grid-cols-2">
              <label className="space-y-1">
                <span className="text-muted-foreground">礼包名称</span>
                <input
                  className="w-full rounded-md border px-3 py-2"
                  value={programForm.name}
                  onChange={(e) =>
                    setProgramForm((prev) => ({
                      ...prev,
                      name: e.target.value,
                    }))
                  }
                />
              </label>
              <label className="space-y-1">
                <span className="text-muted-foreground">状态</span>
                <select
                  className="w-full rounded-md border px-3 py-2"
                  value={programForm.status}
                  onChange={(e) =>
                    setProgramForm((prev) => ({
                      ...prev,
                      status: e.target.value as CouponProgram['status'],
                    }))
                  }
                >
                  <option value="DRAFT">DRAFT</option>
                  <option value="ACTIVE">ACTIVE</option>
                  <option value="PAUSED">PAUSED</option>
                  <option value="ENDED">ENDED</option>
                </select>
              </label>
              <label className="space-y-1">
                <span className="text-muted-foreground">触发器</span>
                <select
                  className="w-full rounded-md border px-3 py-2"
                  value={programForm.triggerType}
                  onChange={(e) =>
                    setProgramForm((prev) => ({
                      ...prev,
                      triggerType: e.target
                        .value as ProgramFormState['triggerType'],
                    }))
                  }
                  disabled={programForm.distributionType !== 'AUTOMATIC_TRIGGER'}
                >
                  <option value="SIGNUP_COMPLETED">SIGNUP_COMPLETED</option>
                  <option value="REFERRAL_QUALIFIED">REFERRAL_QUALIFIED</option>
                </select>
              </label>
              <label className="space-y-1">
                <span className="text-muted-foreground">发放方式</span>
                <select
                  className="w-full rounded-md border px-3 py-2"
                  value={programForm.distributionType}
                  onChange={(e) =>
                    setProgramForm((prev) => ({
                      ...prev,
                      distributionType: e.target
                        .value as ProgramFormState['distributionType'],
                    }))
                  }
                >
                  <option value="AUTOMATIC_TRIGGER">自动触发</option>
                  <option value="MANUAL_CLAIM">手动领取</option>
                  <option value="PROMO_CODE">兑换码领取</option>
                  <option value="ADMIN_PUSH">后台发放</option>
                </select>
              </label>
              <label className="space-y-1">
                <span className="text-muted-foreground">有效期开始</span>
                <input
                  type="date"
                  className="w-full rounded-md border px-3 py-2"
                  value={programForm.validFrom}
                  onChange={(e) =>
                    setProgramForm((prev) => ({
                      ...prev,
                      validFrom: e.target.value,
                    }))
                  }
                />
              </label>
              <label className="space-y-1">
                <span className="text-muted-foreground">有效期结束</span>
                <input
                  type="date"
                  className="w-full rounded-md border px-3 py-2"
                  value={programForm.validTo}
                  onChange={(e) =>
                    setProgramForm((prev) => ({
                      ...prev,
                      validTo: e.target.value,
                    }))
                  }
                />
              </label>
            </div>
            {programForm.distributionType === 'PROMO_CODE' && (
              <label className="space-y-1">
                <span className="text-muted-foreground">兑换码</span>
                <input
                  className="w-full rounded-md border px-3 py-2"
                  value={programForm.promoCode}
                  onChange={(e) =>
                    setProgramForm((prev) => ({
                      ...prev,
                      promoCode: e.target.value,
                    }))
                  }
                />
              </label>
            )}
            <label className="space-y-1">
              <span className="text-muted-foreground">礼包 StableId（可选）</span>
              <input
                className="w-full rounded-md border px-3 py-2"
                value={programForm.programStableId}
                onChange={(e) =>
                  setProgramForm((prev) => ({
                    ...prev,
                    programStableId: e.target.value,
                  }))
                }
              />
            </label>
            <div className="grid gap-3 md:grid-cols-2">
              <label className="space-y-1">
                <span className="text-muted-foreground">总发放量（可选）</span>
                <input
                  type="number"
                  min={0}
                  className="w-full rounded-md border px-3 py-2"
                  value={programForm.totalLimit}
                  onChange={(e) =>
                    setProgramForm((prev) => ({
                      ...prev,
                      totalLimit: e.target.value,
                    }))
                  }
                />
              </label>
              <label className="space-y-1">
                <span className="text-muted-foreground">单人限领</span>
                <input
                  type="number"
                  min={1}
                  className="w-full rounded-md border px-3 py-2"
                  value={programForm.perUserLimit}
                  onChange={(e) =>
                    setProgramForm((prev) => ({
                      ...prev,
                      perUserLimit: e.target.value,
                    }))
                  }
                />
              </label>
            </div>
            <label className="space-y-1">
              <span className="text-muted-foreground">资格条件（预设，可选）</span>
              <div className="space-y-2">
                {eligibilityPresets.map((preset) => (
                  <label
                    key={preset.id}
                    className="flex items-start gap-3 rounded-md border px-3 py-2"
                  >
                    <input
                      type="checkbox"
                      className="mt-1"
                      checked={programForm.eligibilityKeys.includes(preset.id)}
                      onChange={(e) =>
                        setProgramForm((prev) => {
                          const next = new Set(prev.eligibilityKeys);
                          if (e.target.checked) {
                            next.add(preset.id);
                          } else {
                            next.delete(preset.id);
                          }
                          return {
                            ...prev,
                            eligibilityKeys: Array.from(next),
                          };
                        })
                      }
                    />
                    <div className="font-medium">{preset.label}</div>
                  </label>
                ))}
                <div className="text-xs text-muted-foreground">
                  不选择则不设置资格条件。
                </div>
              </div>
            </label>
            <label className="space-y-1">
              <span className="text-muted-foreground">礼包内容（优惠券）</span>
              {templates.length === 0 ? (
                <div className="rounded-md border border-dashed p-3 text-xs text-muted-foreground">
                  暂无可选优惠券，请先创建优惠券模板。
                </div>
              ) : (
                <div className="space-y-2">
                  {templates.map((template) => (
                    <label
                      key={template.couponStableId}
                      className="flex items-start gap-3 rounded-md border px-3 py-2"
                    >
                      <input
                        type="checkbox"
                        className="mt-1"
                        checked={programForm.selectedCouponIds.includes(
                          template.couponStableId,
                        )}
                        onChange={(e) =>
                          setProgramForm((prev) => {
                            const next = new Set(prev.selectedCouponIds);
                            if (e.target.checked) {
                              next.add(template.couponStableId);
                            } else {
                              next.delete(template.couponStableId);
                            }
                            return {
                              ...prev,
                              selectedCouponIds: Array.from(next),
                            };
                          })
                        }
                      />
                      <div>
                        <div className="font-medium">{template.name}</div>
                        <div className="text-xs text-muted-foreground">
                          {template.couponStableId}
                        </div>
                      </div>
                    </label>
                  ))}
                </div>
              )}
            </label>
          </div>
          {programError && (
            <div className="text-sm text-red-600">错误：{programError}</div>
          )}
          <div className="flex flex-wrap gap-3">
            <button
              onClick={() => void handleProgramSubmit()}
              disabled={programSaving}
              className="rounded-md border px-4 py-2 text-sm hover:bg-accent disabled:opacity-60"
            >
              {programEditingId ? '保存修改' : '创建礼包'}
            </button>
            {programEditingId && (
              <button
                onClick={() => resetProgramForm()}
                className="rounded-md border px-4 py-2 text-sm hover:bg-accent"
              >
                取消编辑
              </button>
            )}
          </div>
        </div>
      </section>
    </main>
  );
}
