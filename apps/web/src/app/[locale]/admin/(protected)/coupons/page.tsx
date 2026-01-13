// apps/web/src/app/[locale]/admin/(protected)/coupons/page.tsx
'use client';

import { useEffect, useMemo, useState } from 'react';
import { apiFetch } from '@/lib/api/client';
import type { AdminMenuCategoryDto } from '@shared/menu';

type CouponTemplate = {
  couponStableId: string;
  name: string;
  title: string | null;
  titleEn: string | null;
  description: string | null;
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
  triggerType:
    | 'SIGNUP_COMPLETED'
    | 'REFERRAL_QUALIFIED'
    | 'MARKETING_OPT_IN'
    | 'BIRTHDAY_MONTH'
    | 'TIER_UPGRADE'
    | null;
  validFrom: string | null;
  validTo: string | null;
  promoCode: string | null;
  totalLimit: number | null;
  perUserLimit: number;
  issuedCount: number;
  usedCount: number;
  items: unknown;
  createdAt: string;
  updatedAt: string;
};

type TemplateFormState = {
  couponStableId: string;
  name: string;
  title: string;
  titleEn: string;
  description: string;
  descriptionEn: string;
  status: CouponTemplate['status'];
  validityType: 'LONG_TERM' | 'LIMITED';
  validityDays: string;
  useRuleType: 'FIXED_CENTS' | 'PERCENT';
  applyTo: 'ORDER' | 'ITEM';
  itemStableIds: string[];
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
  validityType: 'LONG_TERM' | 'LIMITED';
  validFrom: string;
  validTo: string;
  promoCode: string;
  totalLimit: string;
  perUserLimit: string;
  selectedCouponIds: string[];
  couponQuantities: Record<string, string>;
};

type ItemChoice = {
  stableId: string;
  label: string;
  categoryLabel: string;
};

const emptyTemplateForm: TemplateFormState = {
  couponStableId: '',
  name: '',
  title: '',
  titleEn: '',
  description: '',
  descriptionEn: '',
  status: 'DRAFT',
  validityType: 'LONG_TERM',
  validityDays: '',
  useRuleType: 'FIXED_CENTS',
  applyTo: 'ORDER',
  itemStableIds: [],
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
  validityType: 'LONG_TERM',
  validFrom: '',
  validTo: '',
  promoCode: '',
  totalLimit: '',
  perUserLimit: '1',
  selectedCouponIds: [],
  couponQuantities: {},
};

function formatDateRange(from?: string | null, to?: string | null) {
  if (!from && !to) return '—';
  return `${from ? new Date(from).toLocaleDateString() : '—'} ~ ${
    to ? new Date(to).toLocaleDateString() : '—'
  }`;
}

function getExpiresInDays(rule: unknown) {
  if (!rule || typeof rule !== 'object') return null;
  const record = rule as Record<string, unknown>;
  return typeof record.expiresInDays === 'number' &&
    Number.isFinite(record.expiresInDays)
    ? record.expiresInDays
    : null;
}

function formatTemplateValidity(template: CouponTemplate) {
  const expiresInDays = getExpiresInDays(template.issueRule);
  if (typeof expiresInDays === 'number') {
    return `限时 ${expiresInDays} 天`;
  }
  if (template.validFrom || template.validTo) {
    return formatDateRange(template.validFrom, template.validTo);
  }
  return '长期有效';
}

function formatProgramValidity(program: CouponProgram) {
  if (!program.validFrom && !program.validTo) {
    return '长期';
  }
  return formatDateRange(program.validFrom, program.validTo);
}

function getRuleType(rule: unknown) {
  if (!rule || typeof rule !== 'object') return '—';
  const record = rule as Record<string, unknown>;
  return typeof record.type === 'string' ? record.type : '—';
}

function getItemsCount(items: unknown) {
  if (!Array.isArray(items)) return 0;
  return items.reduce((sum, entry) => {
    if (!entry || typeof entry !== 'object') return sum;
    const record = entry as Record<string, unknown>;
    const quantity =
      typeof record.quantity === 'number' && Number.isFinite(record.quantity)
        ? record.quantity
        : 1;
    return sum + quantity;
  }, 0);
}

function formatCurrencyFromCents(cents: number) {
  return `¥${(cents / 100).toFixed(2)}`;
}

function formatRedemptionRate(issuedCount: number, usedCount: number) {
  if (!issuedCount) return '—';
  return `${((usedCount / issuedCount) * 100).toFixed(1)}%`;
}

function buildUseRuleFromForm(form: TemplateFormState) {
  const minSubtotalCents = Number(form.minSubtotalCents);
  const constraints =
    form.minSubtotalCents.trim() === '' || Number.isNaN(minSubtotalCents)
      ? undefined
      : { minSubtotalCents };
  const applyTo = form.applyTo;
  const itemStableIds =
    applyTo === 'ITEM' ? form.itemStableIds.map((id) => id.trim()) : undefined;
  const descriptionEn = form.descriptionEn.trim();
  const descriptionEnPayload = descriptionEn ? { descriptionEn } : {};
  if (form.useRuleType === 'PERCENT') {
    return {
      type: 'PERCENT',
      applyTo,
      itemStableIds,
      percentOff: Number(form.percentOff),
      constraints,
      ...descriptionEnPayload,
    };
  }
  return {
    type: 'FIXED_CENTS',
    applyTo,
    itemStableIds,
    amountCents: Number(form.amountCents),
    constraints,
    ...descriptionEnPayload,
  };
}

function parseTemplateFormFromRule(
  template: CouponTemplate,
): Pick<
  TemplateFormState,
  | 'descriptionEn'
  | 'useRuleType'
  | 'applyTo'
  | 'itemStableIds'
  | 'amountCents'
  | 'percentOff'
  | 'minSubtotalCents'
> {
  if (!template.useRule || typeof template.useRule !== 'object') {
    return {
      descriptionEn: '',
      useRuleType: 'FIXED_CENTS',
      applyTo: 'ORDER',
      itemStableIds: [],
      amountCents: '',
      percentOff: '',
      minSubtotalCents: '',
    };
  }
  const record = template.useRule as Record<string, unknown>;
  const applyTo = record.applyTo === 'ITEM' ? 'ITEM' : 'ORDER';
  const itemStableIds = Array.isArray(record.itemStableIds)
    ? record.itemStableIds.filter((id): id is string => typeof id === 'string')
    : [];
  const descriptionEn =
    typeof record.descriptionEn === 'string' ? record.descriptionEn : '';
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
      descriptionEn,
      useRuleType: 'PERCENT',
      applyTo,
      itemStableIds,
      amountCents: '',
      percentOff:
        typeof record.percentOff === 'number' ? String(record.percentOff) : '',
      minSubtotalCents: minSubtotalValue,
    };
  }

  return {
    descriptionEn,
    useRuleType: 'FIXED_CENTS',
    applyTo,
    itemStableIds,
    amountCents:
      typeof record.amountCents === 'number' ? String(record.amountCents) : '',
    percentOff: '',
    minSubtotalCents: minSubtotalValue,
  };
}

const triggerLabels: Record<Exclude<CouponProgram['triggerType'], null>, string> = {
  SIGNUP_COMPLETED: '注册完成',
  REFERRAL_QUALIFIED: '邀请成功',
  MARKETING_OPT_IN: '开启订阅',
  BIRTHDAY_MONTH: '生日月',
  TIER_UPGRADE: '等级提升',
};

function formatTriggerLabel(triggerType: CouponProgram['triggerType']) {
  if (!triggerType) return '—';
  return triggerLabels[triggerType] ?? triggerType;
}

export default function AdminCouponsPage() {
  const [templates, setTemplates] = useState<CouponTemplate[]>([]);
  const [programs, setPrograms] = useState<CouponProgram[]>([]);
  const [menuCategories, setMenuCategories] = useState<AdminMenuCategoryDto[]>(
    [],
  );
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
  const [issueTarget, setIssueTarget] = useState<{
    programStableId: string;
    programName: string;
  } | null>(null);
  const [issueForm, setIssueForm] = useState({
    userStableId: '',
    phone: '',
    error: null as string | null,
    saving: false,
  });

  async function fetchData() {
    setLoading(true);
    setLoadError(null);
    try {
      const [templateData, programData, menuData] = await Promise.all([
        apiFetch<CouponTemplate[]>('/admin/coupons/templates'),
        apiFetch<CouponProgram[]>('/admin/coupons/programs'),
        apiFetch<{ categories: AdminMenuCategoryDto[] }>('/admin/menu/full'),
      ]);
      setTemplates(templateData);
      setPrograms(programData);
      setMenuCategories(menuData.categories ?? []);
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
    const name =
      templateForm.title.trim() ||
      templateForm.name.trim() ||
      '未命名优惠券';
    const description =
      templateForm.description.trim() || templateForm.name.trim() || '优惠详情';
    const minSubtotalCents = Number(templateForm.minSubtotalCents);
    const minSubtotalText =
      templateForm.minSubtotalCents.trim() === '' ||
      Number.isNaN(minSubtotalCents)
        ? '无门槛'
        : `满 ${formatCurrencyFromCents(minSubtotalCents)} 可用`;
    const applyToText =
      templateForm.applyTo === 'ITEM' ? '指定商品可用' : '全场可用';
    const expiresInDays =
      templateForm.validityType === 'LIMITED'
        ? Number(templateForm.validityDays)
        : null;
    const expiresText =
      templateForm.validityType === 'LIMITED'
        ? Number.isNaN(expiresInDays) || expiresInDays === null
          ? '限时未设置'
          : `限时 ${expiresInDays} 天`
        : '长期有效';

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
        limit: `${minSubtotalText} · ${applyToText}`,
        description,
        expiresText,
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
      limit: `${minSubtotalText} · ${applyToText}`,
      description,
      expiresText,
    };
  }, [
    templateForm.amountCents,
    templateForm.description,
    templateForm.minSubtotalCents,
    templateForm.name,
    templateForm.title,
    templateForm.applyTo,
    templateForm.percentOff,
    templateForm.useRuleType,
    templateForm.validityDays,
    templateForm.validityType,
  ]);
  const programHint = useMemo(
    () => (programEditingId ? '更新礼包' : '创建礼包'),
    [programEditingId],
  );
  const itemChoices = useMemo<ItemChoice[]>(() => {
    return menuCategories.flatMap((category) =>
      category.items.map((item) => ({
        stableId: item.stableId,
        label: `${item.nameEn}${item.nameZh ? ` / ${item.nameZh}` : ''}`,
        categoryLabel: category.nameZh ?? category.nameEn,
      })),
    );
  }, [menuCategories]);
  const itemChoicesByCategory = useMemo(() => {
    const map = new Map<string, ItemChoice[]>();
    itemChoices.forEach((item) => {
      const list = map.get(item.categoryLabel) ?? [];
      list.push(item);
      map.set(item.categoryLabel, list);
    });
    return Array.from(map.entries());
  }, [itemChoices]);

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
      if (
        templateForm.applyTo === 'ITEM' &&
        templateForm.itemStableIds.length === 0
      ) {
        throw new Error('请选择至少一个指定商品');
      }
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
      const hasLimitedValidity = templateForm.validityType === 'LIMITED';
      const parsedValidityDays = hasLimitedValidity
        ? Number(templateForm.validityDays)
        : null;
      if (hasLimitedValidity) {
        if (
          parsedValidityDays === null ||
          Number.isNaN(parsedValidityDays) ||
          !Number.isInteger(parsedValidityDays) ||
          parsedValidityDays <= 0
        ) {
          throw new Error('限时天数必须为正整数');
        }
      }
      const issueRule =
        templateForm.issueRuleMode === '' && !hasLimitedValidity
          ? null
          : {
              ...(templateForm.issueRuleMode === ''
                ? {}
                : { mode: templateForm.issueRuleMode }),
              ...(hasLimitedValidity && parsedValidityDays !== null
                ? { expiresInDays: parsedValidityDays }
                : {}),
            };
      const payload = {
        couponStableId: templateForm.couponStableId || undefined,
        name: templateForm.name.trim(),
        title: templateForm.title.trim() || null,
        titleEn: templateForm.titleEn.trim() || null,
        description: templateForm.description.trim() || null,
        status: templateForm.status,
        validFrom: null,
        validTo: null,
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
      const items = programForm.selectedCouponIds.map((couponStableId) => {
        const rawQuantity = programForm.couponQuantities[couponStableId] ?? '1';
        const parsedQuantity = Number(rawQuantity);
        if (!Number.isInteger(parsedQuantity) || parsedQuantity <= 0) {
          throw new Error('券数量必须为正整数');
        }
        return {
          couponStableId,
          quantity: parsedQuantity,
        };
      });
      if (items.length === 0) throw new Error('礼包内容不能为空');
      if (
        programForm.distributionType === 'PROMO_CODE' &&
        !programForm.promoCode.trim()
      ) {
        throw new Error('请输入兑换码');
      }
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
        validFrom:
          programForm.validityType === 'LIMITED'
            ? programForm.validFrom || null
            : null,
        validTo:
          programForm.validityType === 'LIMITED'
            ? programForm.validTo || null
            : null,
        promoCode:
          programForm.distributionType === 'PROMO_CODE'
            ? programForm.promoCode.trim()
            : null,
        totalLimit,
        perUserLimit,
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

  async function handleIssueProgram() {
    if (!issueTarget) return;
    setIssueForm((prev) => ({ ...prev, saving: true, error: null }));
    try {
      const userStableId = issueForm.userStableId.trim();
      const phone = issueForm.phone.trim();
      if (!userStableId && !phone) {
        throw new Error('请输入用户 StableId 或手机号');
      }
      const payload = userStableId ? { userStableId } : { phone };
      await apiFetch(`/admin/coupons/programs/${issueTarget.programStableId}/issue`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      await fetchData();
      setIssueTarget(null);
      setIssueForm({
        userStableId: '',
        phone: '',
        error: null,
        saving: false,
      });
    } catch (error) {
      setIssueForm((prev) => ({
        ...prev,
        error: (error as Error).message,
        saving: false,
      }));
    }
  }

  function handleCloseIssue() {
    setIssueTarget(null);
    setIssueForm({
      userStableId: '',
      phone: '',
      error: null,
      saving: false,
    });
  }

  function handleEditTemplate(template: CouponTemplate) {
    const templateRuleState = parseTemplateFormFromRule(template);
    const issueRuleMode =
      template.issueRule && typeof template.issueRule === 'object'
        ? ((template.issueRule as Record<string, unknown>)
            .mode as TemplateFormState['issueRuleMode']) ?? ''
        : '';
    const expiresInDays = getExpiresInDays(template.issueRule);
    const validityDays =
      typeof expiresInDays === 'number' && Number.isFinite(expiresInDays)
        ? String(expiresInDays)
        : '';
    const validityType =
      typeof expiresInDays === 'number'
        ? 'LIMITED'
        : template.validFrom || template.validTo
          ? 'LIMITED'
          : 'LONG_TERM';
    setTemplateEditingId(template.couponStableId);
    setTemplateForm({
      couponStableId: template.couponStableId,
      name: template.name,
      title: template.title ?? '',
      titleEn: template.titleEn ?? '',
      description: template.description ?? '',
      status: template.status,
      validityType,
      validityDays:
        validityDays ||
        (template.validFrom && template.validTo
          ? String(
              Math.max(
                1,
                Math.ceil(
                  (new Date(template.validTo).getTime() -
                    new Date(template.validFrom).getTime()) /
                    (24 * 60 * 60 * 1000),
                ),
              ),
            )
          : ''),
      ...templateRuleState,
      issueRuleMode:
        issueRuleMode === 'MANUAL' || issueRuleMode === 'AUTO'
          ? issueRuleMode
          : '',
    });
  }

  function handleEditProgram(program: CouponProgram) {
    const rawItems = Array.isArray(program.items) ? program.items : [];
    const couponQuantities: Record<string, string> = {};
    const selectedCouponIds = rawItems
      .map((item) => {
        if (!item || typeof item !== 'object') return null;
        const record = item as Record<string, unknown>;
        if (typeof record.couponStableId !== 'string') return null;
        const quantity =
          typeof record.quantity === 'number' && Number.isFinite(record.quantity)
            ? String(record.quantity)
            : '1';
        couponQuantities[record.couponStableId] = quantity;
        return record.couponStableId;
      })
      .filter((value): value is string => Boolean(value));
    const validityType =
      program.validFrom || program.validTo ? 'LIMITED' : 'LONG_TERM';
    setProgramEditingId(program.programStableId);
    setProgramForm({
      programStableId: program.programStableId,
      name: program.name,
      status: program.status,
      distributionType: program.distributionType,
      triggerType: program.triggerType ?? 'SIGNUP_COMPLETED',
      validityType,
      validFrom: program.validFrom ? program.validFrom.slice(0, 10) : '',
      validTo: program.validTo ? program.validTo.slice(0, 10) : '',
      promoCode: program.promoCode ?? '',
      totalLimit:
        typeof program.totalLimit === 'number'
          ? String(program.totalLimit)
          : '',
      perUserLimit: String(program.perUserLimit ?? 1),
      selectedCouponIds,
      couponQuantities,
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

      <section className="grid gap-6 lg:grid-cols-[0.9fr_1.3fr]">
        <div className="rounded-2xl border p-6 space-y-5">
          <div className="flex items-center justify-between">
            <div>
              <h2 className="text-xl font-semibold">优惠券模板</h2>
              <p className="text-sm text-muted-foreground">
                当前共 {templateCount} 个模板
              </p>
            </div>
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
                    展示标题：{template.title ?? '—'}
                  </div>
                  <div className="text-sm text-muted-foreground">
                    英文标题：{template.titleEn ?? '—'}
                  </div>
                  <div className="text-sm text-muted-foreground">
                    有效期：{formatTemplateValidity(template)}
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
                <span className="text-muted-foreground">模板名称（内部）</span>
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
                <span className="text-muted-foreground">展示标题（App端）</span>
                <input
                  className="w-full rounded-md border px-3 py-2"
                  value={templateForm.title}
                  onChange={(e) =>
                    setTemplateForm((prev) => ({
                      ...prev,
                      title: e.target.value,
                    }))
                  }
                />
              </label>
              <label className="space-y-1">
                <span className="text-muted-foreground">展示标题（英文）</span>
                <input
                  className="w-full rounded-md border px-3 py-2"
                  value={templateForm.titleEn}
                  onChange={(e) =>
                    setTemplateForm((prev) => ({
                      ...prev,
                      titleEn: e.target.value,
                    }))
                  }
                />
              </label>
              <label className="space-y-1">
                <span className="text-muted-foreground">有效期类型</span>
                <select
                  className="w-full rounded-md border px-3 py-2"
                  value={templateForm.validityType}
                  onChange={(e) =>
                    setTemplateForm((prev) => ({
                      ...prev,
                      validityType: e.target
                        .value as TemplateFormState['validityType'],
                      validityDays:
                        e.target.value === 'LIMITED'
                          ? prev.validityDays
                          : '',
                    }))
                  }
                >
                  <option value="LONG_TERM">长期</option>
                  <option value="LIMITED">限时</option>
                </select>
              </label>
              {templateForm.validityType === 'LIMITED' && (
                <label className="space-y-1">
                  <span className="text-muted-foreground">限时时长（天）</span>
                  <input
                    type="number"
                    min={1}
                    className="w-full rounded-md border px-3 py-2"
                    value={templateForm.validityDays}
                    onChange={(e) =>
                      setTemplateForm((prev) => ({
                        ...prev,
                        validityDays: e.target.value,
                      }))
                    }
                  />
                  <div className="text-xs text-muted-foreground">
                    选择限时后，优惠券从发放日起算，X 天后作废。
                  </div>
                </label>
              )}
            </div>
            <label className="space-y-1">
              <span className="text-muted-foreground">使用说明 / 限制条款</span>
              <textarea
                className="min-h-[44px] w-full rounded-md border px-3 py-2"
                value={templateForm.description}
                onChange={(e) =>
                  setTemplateForm((prev) => ({
                    ...prev,
                    description: e.target.value,
                  }))
                }
              />
            </label>
            <label className="space-y-1">
              <span className="text-muted-foreground">
                Usage Instructions / Restrictions (EN)
              </span>
              <textarea
                className="min-h-[44px] w-full rounded-md border px-3 py-2"
                value={templateForm.descriptionEn}
                onChange={(e) =>
                  setTemplateForm((prev) => ({
                    ...prev,
                    descriptionEn: e.target.value,
                  }))
                }
              />
            </label>
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
                  <span className="text-muted-foreground">适用范围</span>
                  <select
                    className="w-full rounded-md border px-3 py-2"
                    value={templateForm.applyTo}
                    onChange={(e) =>
                      setTemplateForm((prev) => ({
                        ...prev,
                        applyTo: e.target.value as TemplateFormState['applyTo'],
                        itemStableIds:
                          e.target.value === 'ITEM'
                            ? prev.itemStableIds
                            : [],
                      }))
                    }
                  >
                    <option value="ORDER">整单优惠</option>
                    <option value="ITEM">指定商品</option>
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
              {templateForm.applyTo === 'ITEM' && (
                <div className="space-y-2">
                  <div className="text-xs text-muted-foreground">
                    选择可使用该优惠券的指定商品
                  </div>
                  {itemChoicesByCategory.length === 0 ? (
                    <div className="rounded-md border border-dashed p-3 text-xs text-muted-foreground">
                      暂无可选商品，请先配置菜单。
                    </div>
                  ) : (
                    <div className="space-y-3">
                      {itemChoicesByCategory.map(([category, items]) => (
                        <div key={category} className="space-y-2">
                          <div className="text-xs font-semibold text-muted-foreground">
                            {category}
                          </div>
                          <div className="grid gap-2 md:grid-cols-2">
                            {items.map((item) => (
                              <label
                                key={item.stableId}
                                className="flex items-start gap-2 rounded-md border px-3 py-2"
                              >
                                <input
                                  type="checkbox"
                                  className="mt-1"
                                  checked={templateForm.itemStableIds.includes(
                                    item.stableId,
                                  )}
                                  onChange={(e) =>
                                    setTemplateForm((prev) => {
                                      const next = new Set(prev.itemStableIds);
                                      if (e.target.checked) {
                                        next.add(item.stableId);
                                      } else {
                                        next.delete(item.stableId);
                                      }
                                      return {
                                        ...prev,
                                        itemStableIds: Array.from(next),
                                      };
                                    })
                                  }
                                />
                                <div>
                                  <div className="font-medium">
                                    {item.label}
                                  </div>
                                  <div className="text-xs text-muted-foreground">
                                    {item.stableId}
                                  </div>
                                </div>
                              </label>
                            ))}
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              )}
            </div>
          </div>
          <div className="rounded-xl border bg-muted/40 p-4">
            <div className="text-xs text-muted-foreground">预览</div>
            <div className="mt-3 overflow-hidden rounded-lg border bg-background">
              <div className="flex items-center justify-between gap-4 border-b border-dashed px-4 py-4">
                <div>
                  <div className="text-xs text-muted-foreground">
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
              <div className="flex items-center justify-between gap-2 px-4 py-3 text-xs text-muted-foreground">
                <div>{templatePreview.description}</div>
                <div>{templatePreview.expiresText}</div>
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

      <section className="grid gap-6 lg:grid-cols-[0.9fr_1.3fr]">
        <div className="rounded-2xl border p-6 space-y-5">
          <div className="flex items-center justify-between">
            <div>
              <h2 className="text-xl font-semibold">礼包编排</h2>
              <p className="text-sm text-muted-foreground">
                当前共 {programCount} 个礼包
              </p>
            </div>
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
                    触发器：{formatTriggerLabel(program.triggerType)}
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
                    有效期：{formatProgramValidity(program)}
                  </div>
                  <div className="text-sm text-muted-foreground">
                    券数量：{getItemsCount(program.items)}
                  </div>
                  <div className="text-sm text-muted-foreground">
                    已发放：{program.issuedCount} · 已核销：{program.usedCount}
                  </div>
                  <div className="text-sm text-muted-foreground">
                    核销率：{formatRedemptionRate(program.issuedCount, program.usedCount)}
                  </div>
                  <button
                    onClick={() => handleEditProgram(program)}
                    className="rounded-md border px-3 py-1 text-sm hover:bg-accent"
                  >
                    编辑
                  </button>
                  {program.distributionType === 'ADMIN_PUSH' && (
                    <button
                      onClick={() => {
                        setIssueTarget({
                          programStableId: program.programStableId,
                          programName: program.name,
                        });
                        setIssueForm({
                          userStableId: '',
                          phone: '',
                          error: null,
                          saving: false,
                        });
                      }}
                      className="rounded-md border px-3 py-1 text-sm hover:bg-accent"
                    >
                      去发放
                    </button>
                  )}
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
                  <option value="SIGNUP_COMPLETED">注册完成</option>
                  <option value="REFERRAL_QUALIFIED">邀请成功</option>
                  <option value="MARKETING_OPT_IN">开启订阅</option>
                  <option value="BIRTHDAY_MONTH">生日月</option>
                  <option value="TIER_UPGRADE">等级提升</option>
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
                <span className="text-muted-foreground">有效期类型</span>
                <select
                  className="w-full rounded-md border px-3 py-2"
                  value={programForm.validityType}
                  onChange={(e) =>
                    setProgramForm((prev) => ({
                      ...prev,
                      validityType: e.target
                        .value as ProgramFormState['validityType'],
                      validFrom:
                        e.target.value === 'LONG_TERM' ? '' : prev.validFrom,
                      validTo:
                        e.target.value === 'LONG_TERM' ? '' : prev.validTo,
                    }))
                  }
                >
                  <option value="LONG_TERM">长期</option>
                  <option value="LIMITED">限时</option>
                </select>
              </label>
              {programForm.validityType === 'LIMITED' && (
                <>
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
                </>
              )}
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
            <div className="space-y-1">
              <span className="text-muted-foreground">礼包内容（优惠券）</span>
              {templates.length === 0 ? (
                <div className="rounded-md border border-dashed p-3 text-xs text-muted-foreground">
                  暂无可选优惠券，请先创建优惠券模板。
                </div>
              ) : (
                <div className="space-y-2">
                  {templates.map((template) => (
                    <div
                      key={template.couponStableId}
                      className="flex flex-wrap items-center gap-3 rounded-md border px-3 py-2"
                    >
                      <label className="flex flex-1 items-center gap-3 cursor-pointer">
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
                                if (!prev.couponQuantities[template.couponStableId]) {
                                  return {
                                    ...prev,
                                    selectedCouponIds: Array.from(next),
                                    couponQuantities: {
                                      ...prev.couponQuantities,
                                      [template.couponStableId]: '1',
                                    },
                                  };
                                }
                              } else {
                                next.delete(template.couponStableId);
                              }
                              return {
                                ...prev,
                                selectedCouponIds: Array.from(next),
                                couponQuantities: e.target.checked
                                  ? prev.couponQuantities
                                  : Object.fromEntries(
                                      Object.entries(prev.couponQuantities).filter(
                                        ([key]) => key !== template.couponStableId,
                                      ),
                                    ),
                              };
                            })
                          }
                        />
                        <div className="min-w-[180px]">
                          <div className="font-medium">{template.name}</div>
                          <div className="text-xs text-muted-foreground">
                            {template.couponStableId}
                          </div>
                        </div>
                      </label>
                      {programForm.selectedCouponIds.includes(
                        template.couponStableId,
                      ) && (
                        <label className="flex items-center gap-2 text-xs text-muted-foreground">
                          x
                          <input
                            type="number"
                            min={1}
                            className="w-20 rounded-md border px-2 py-1 text-sm text-foreground"
                            value={
                              programForm.couponQuantities[
                                template.couponStableId
                              ] ?? '1'
                            }
                            onChange={(e) =>
                              setProgramForm((prev) => ({
                                ...prev,
                                couponQuantities: {
                                  ...prev.couponQuantities,
                                  [template.couponStableId]: e.target.value,
                                },
                              }))
                            }
                          />
                        </label>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </div>
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

      {issueTarget && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
          <div className="w-full max-w-md rounded-xl border bg-background p-6 shadow-xl">
            <div className="space-y-2">
              <div className="text-lg font-semibold">后台发放礼包</div>
              <div className="text-sm text-muted-foreground">
                当前礼包：{issueTarget.programName}
              </div>
            </div>
            <div className="mt-4 space-y-3 text-sm">
              <label className="space-y-1">
                <span className="text-muted-foreground">用户 StableId</span>
                <input
                  className="w-full rounded-md border px-3 py-2"
                  value={issueForm.userStableId}
                  onChange={(e) =>
                    setIssueForm((prev) => ({
                      ...prev,
                      userStableId: e.target.value,
                    }))
                  }
                />
              </label>
              <div className="text-xs text-muted-foreground">或</div>
              <label className="space-y-1">
                <span className="text-muted-foreground">手机号</span>
                <input
                  className="w-full rounded-md border px-3 py-2"
                  value={issueForm.phone}
                  onChange={(e) =>
                    setIssueForm((prev) => ({
                      ...prev,
                      phone: e.target.value,
                    }))
                  }
                />
              </label>
              {issueForm.error && (
                <div className="text-sm text-red-600">
                  错误：{issueForm.error}
                </div>
              )}
            </div>
            <div className="mt-5 flex justify-end gap-3">
              <button
                onClick={() => handleCloseIssue()}
                className="rounded-md border px-4 py-2 text-sm hover:bg-accent"
              >
                取消
              </button>
              <button
                onClick={() => void handleIssueProgram()}
                disabled={issueForm.saving}
                className="rounded-md border px-4 py-2 text-sm hover:bg-accent disabled:opacity-60"
              >
                {issueForm.saving ? '发放中…' : '确认发放'}
              </button>
            </div>
          </div>
        </div>
      )}
    </main>
  );
}
