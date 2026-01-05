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
  triggerType: 'SIGNUP_COMPLETED' | 'REFERRAL_QUALIFIED';
  validFrom: string | null;
  validTo: string | null;
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
  useRulePresetId: string;
  issueRulePresetId: string;
};

type ProgramFormState = {
  programStableId: string;
  name: string;
  status: CouponProgram['status'];
  triggerType: CouponProgram['triggerType'];
  validFrom: string;
  validTo: string;
  eligibilityKeys: string[];
  selectedCouponIds: string[];
};

const emptyTemplateForm: TemplateFormState = {
  couponStableId: '',
  name: '',
  status: 'DRAFT',
  validFrom: '',
  validTo: '',
  useRulePresetId: '',
  issueRulePresetId: '',
};

const emptyProgramForm: ProgramFormState = {
  programStableId: '',
  name: '',
  status: 'DRAFT',
  triggerType: 'SIGNUP_COMPLETED',
  validFrom: '',
  validTo: '',
  eligibilityKeys: [],
  selectedCouponIds: [],
};

const useRulePresets = [
  {
    id: 'order_fixed_5',
    label: '订单固定立减 ¥5',
    description: '适用于订单，最低消费 0 元',
    value: {
      type: 'FIXED_CENTS',
      applyTo: 'ORDER',
      amountCents: 500,
      constraints: { minSubtotalCents: 0 },
      preset: 'ORDER_FIXED_5',
    },
  },
  {
    id: 'order_percent_10',
    label: '订单 9 折（10% 折扣）',
    description: '适用于订单，最低消费 0 元',
    value: {
      type: 'PERCENT',
      applyTo: 'ORDER',
      percentOff: 10,
      constraints: { minSubtotalCents: 0 },
      preset: 'ORDER_PERCENT_10',
    },
  },
];

const issueRulePresets = [
  {
    id: 'manual',
    label: '手动发放',
    description: '通过后台或任务手动发放',
    value: { mode: 'MANUAL', preset: 'MANUAL' },
  },
  {
    id: 'auto',
    label: '自动发放',
    description: '由系统自动触发发放',
    value: { mode: 'AUTO', preset: 'AUTO' },
  },
];

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

function getPresetIdFromValue(
  value: unknown,
  presets: Array<{ id: string; value: Record<string, unknown> }>,
) {
  if (!value || typeof value !== 'object') return '';
  const record = value as Record<string, unknown>;
  if (typeof record.preset === 'string') {
    const presetMatch = presets.find(
      (preset) => preset.value.preset === record.preset,
    );
    if (presetMatch) return presetMatch.id;
  }
  const raw = JSON.stringify(value);
  const match = presets.find((preset) => JSON.stringify(preset.value) === raw);
  return match?.id ?? '';
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
      const useRulePreset = useRulePresets.find(
        (preset) => preset.id === templateForm.useRulePresetId,
      );
      const useRule = useRulePreset?.value ?? null;
      if (!useRule) {
        throw new Error('使用规则不能为空');
      }
      const issueRulePreset = issueRulePresets.find(
        (preset) => preset.id === templateForm.issueRulePresetId,
      );
      const issueRule = issueRulePreset?.value ?? null;
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
      const eligibility =
        programForm.eligibilityKeys.length > 0
          ? Object.fromEntries(
              programForm.eligibilityKeys.map((key) => [key, true]),
            )
          : null;
      const payload = {
        programStableId: programForm.programStableId || undefined,
        name: programForm.name.trim(),
        status: programForm.status,
        triggerType: programForm.triggerType,
        validFrom: programForm.validFrom || null,
        validTo: programForm.validTo || null,
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
    setTemplateEditingId(template.couponStableId);
    setTemplateForm({
      couponStableId: template.couponStableId,
      name: template.name,
      status: template.status,
      validFrom: template.validFrom ? template.validFrom.slice(0, 10) : '',
      validTo: template.validTo ? template.validTo.slice(0, 10) : '',
      useRulePresetId: getPresetIdFromValue(template.useRule, useRulePresets),
      issueRulePresetId: getPresetIdFromValue(
        template.issueRule ?? null,
        issueRulePresets,
      ),
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
      triggerType: program.triggerType,
      validFrom: program.validFrom ? program.validFrom.slice(0, 10) : '',
      validTo: program.validTo ? program.validTo.slice(0, 10) : '',
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
            <label className="space-y-1">
              <span className="text-muted-foreground">使用规则（预设）</span>
              <div className="space-y-2">
                {useRulePresets.map((preset) => (
                  <label
                    key={preset.id}
                    className="flex items-start gap-3 rounded-md border px-3 py-2"
                  >
                    <input
                      type="checkbox"
                      className="mt-1"
                      checked={templateForm.useRulePresetId === preset.id}
                      onChange={(e) =>
                        setTemplateForm((prev) => ({
                          ...prev,
                          useRulePresetId: e.target.checked ? preset.id : '',
                        }))
                      }
                    />
                    <div>
                      <div className="font-medium">{preset.label}</div>
                      <div className="text-xs text-muted-foreground">
                        {preset.description}
                      </div>
                    </div>
                  </label>
                ))}
              </div>
            </label>
            <label className="space-y-1">
              <span className="text-muted-foreground">发放规则（预设，可选）</span>
              <div className="space-y-2">
                {issueRulePresets.map((preset) => (
                  <label
                    key={preset.id}
                    className="flex items-start gap-3 rounded-md border px-3 py-2"
                  >
                    <input
                      type="checkbox"
                      className="mt-1"
                      checked={templateForm.issueRulePresetId === preset.id}
                      onChange={(e) =>
                        setTemplateForm((prev) => ({
                          ...prev,
                          issueRulePresetId: e.target.checked ? preset.id : '',
                        }))
                      }
                    />
                    <div>
                      <div className="font-medium">{preset.label}</div>
                      <div className="text-xs text-muted-foreground">
                        {preset.description}
                      </div>
                    </div>
                  </label>
                ))}
                <div className="text-xs text-muted-foreground">
                  不选择则不设置发放规则。
                </div>
              </div>
            </label>
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
                    触发器：{program.triggerType}
                  </div>
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
                      triggerType: e.target.value as CouponProgram['triggerType'],
                    }))
                  }
                >
                  <option value="SIGNUP_COMPLETED">SIGNUP_COMPLETED</option>
                  <option value="REFERRAL_QUALIFIED">REFERRAL_QUALIFIED</option>
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
