'use client';

import { useEffect, useMemo, useState } from 'react';
import { useParams } from 'next/navigation';
import type { Locale } from '@/lib/i18n/locales';
import { apiFetch } from '@/lib/api/client';
import type { AdminMenuCategoryDto } from '@shared/menu';

type RuleType =
  | 'PERCENTAGE_OFF'
  | 'FIXED_AMOUNT_OFF'
  | 'BUY_X_GET_Y'
  | 'FREE_ITEM'
  | 'LOYALTY_MULTIPLIER';
type RuleStatus = 'DRAFT' | 'ACTIVE' | 'PAUSED' | 'ENDED';
type StackingPolicy = 'EXCLUSIVE' | 'STACKABLE';
type PromotionChannel = 'web' | 'in_store' | 'ubereats';

type RuleDto = {
  stableId: string;
  titleZh: string;
  titleEn: string | null;
  description: string | null;
  type: RuleType;
  status: RuleStatus;
  priority: number;
  stackingPolicy: StackingPolicy;
  excludesCoupons: boolean;
  excludesItemPromotions: boolean;
  channels: PromotionChannel[];
  validFrom: string | null;
  validTo: string | null;
  weekdays: number[];
  startMinutes: number | null;
  endMinutes: number | null;
  config: Record<string, unknown>;
};

type Draft = {
  stableId: string | null;
  titleZh: string;
  titleEn: string;
  description: string;
  type: RuleType;
  status: RuleStatus;
  priority: string;
  stackingPolicy: StackingPolicy;
  excludesCoupons: boolean;
  excludesItemPromotions: boolean;
  channels: PromotionChannel[];
  validFrom: string;
  validTo: string;
  weekdays: number[];
  startTime: string;
  endTime: string;
  discountPercent: string;
  discountAmount: string;
  minSpend: string;
  targetItemStableIds: string[];
  buyItemStableIds: string[];
  buyQuantity: string;
  getItemStableIds: string[];
  getQuantity: string;
  rewardPercent: string;
  freeItemStableIds: string[];
  freeQuantity: string;
  multiplier: string;
};

const RULE_TYPES: Array<{ value: RuleType; zh: string; en: string }> = [
  { value: 'PERCENTAGE_OFF', zh: '百分比优惠', en: 'Percentage off' },
  { value: 'FIXED_AMOUNT_OFF', zh: '固定金额优惠', en: 'Fixed amount off' },
  { value: 'BUY_X_GET_Y', zh: '买 X 赠/减 Y', en: 'Buy X get Y' },
  { value: 'FREE_ITEM', zh: '赠品', en: 'Free item' },
  { value: 'LOYALTY_MULTIPLIER', zh: '积分倍数', en: 'Loyalty multiplier' },
];

const WEEKDAYS = [
  { value: 1, zh: '一', en: 'Mon' },
  { value: 2, zh: '二', en: 'Tue' },
  { value: 3, zh: '三', en: 'Wed' },
  { value: 4, zh: '四', en: 'Thu' },
  { value: 5, zh: '五', en: 'Fri' },
  { value: 6, zh: '六', en: 'Sat' },
  { value: 7, zh: '日', en: 'Sun' },
];

function emptyDraft(): Draft {
  return {
    stableId: null,
    titleZh: '',
    titleEn: '',
    description: '',
    type: 'PERCENTAGE_OFF',
    status: 'DRAFT',
    priority: '175',
    stackingPolicy: 'EXCLUSIVE',
    excludesCoupons: false,
    excludesItemPromotions: false,
    channels: ['web', 'in_store'],
    validFrom: '',
    validTo: '',
    weekdays: [],
    startTime: '',
    endTime: '',
    discountPercent: '10',
    discountAmount: '5.00',
    minSpend: '',
    targetItemStableIds: [],
    buyItemStableIds: [],
    buyQuantity: '1',
    getItemStableIds: [],
    getQuantity: '1',
    rewardPercent: '100',
    freeItemStableIds: [],
    freeQuantity: '1',
    multiplier: '2',
  };
}

function isoToDate(value: string | null): string {
  if (!value) return '';
  return value.slice(0, 10);
}

function minutesToTime(value: number | null): string {
  if (value === null) return '';
  return `${String(Math.floor(value / 60)).padStart(2, '0')}:${String(value % 60).padStart(2, '0')}`;
}

function timeToMinutes(value: string): number | null {
  if (!value) return null;
  const [hour, minute] = value.split(':').map(Number);
  if (!Number.isInteger(hour) || !Number.isInteger(minute)) return null;
  return hour * 60 + minute;
}

function centsToMoney(value: unknown): string {
  return typeof value === 'number' && Number.isFinite(value)
    ? (value / 100).toFixed(2)
    : '';
}

function moneyToCents(value: string): number | null {
  if (!value.trim()) return null;
  const amount = Number(value);
  return Number.isFinite(amount) ? Math.round(amount * 100) : null;
}

function readNumber(config: Record<string, unknown>, key: string, fallback = '') {
  const value = config[key];
  return typeof value === 'number' && Number.isFinite(value) ? String(value) : fallback;
}

function readStringArray(config: Record<string, unknown>, key: string): string[] {
  const value = config[key];
  return Array.isArray(value)
    ? value.filter((item): item is string => typeof item === 'string')
    : [];
}

function draftFromRule(rule: RuleDto): Draft {
  const config = rule.config ?? {};
  return {
    stableId: rule.stableId,
    titleZh: rule.titleZh,
    titleEn: rule.titleEn ?? '',
    description: rule.description ?? '',
    type: rule.type,
    status: rule.status,
    priority: String(rule.priority),
    stackingPolicy: rule.stackingPolicy,
    excludesCoupons: rule.excludesCoupons,
    excludesItemPromotions: rule.excludesItemPromotions,
    channels: rule.channels,
    validFrom: isoToDate(rule.validFrom),
    validTo: isoToDate(rule.validTo),
    weekdays: rule.weekdays,
    startTime: minutesToTime(rule.startMinutes),
    endTime: minutesToTime(rule.endMinutes),
    discountPercent: readNumber(config, 'discountPercent', '10'),
    discountAmount: centsToMoney(config.discountCents) || '5.00',
    minSpend: centsToMoney(config.minSpendCents),
    targetItemStableIds: readStringArray(config, 'targetItemStableIds'),
    buyItemStableIds: readStringArray(config, 'buyItemStableIds'),
    buyQuantity: readNumber(config, 'buyQuantity', '1'),
    getItemStableIds: readStringArray(config, 'getItemStableIds'),
    getQuantity: readNumber(config, 'getQuantity', '1'),
    rewardPercent: readNumber(config, 'discountPercent', '100'),
    freeItemStableIds: readStringArray(config, 'itemStableIds'),
    freeQuantity: readNumber(config, 'quantity', '1'),
    multiplier: readNumber(config, 'multiplier', '2'),
  };
}

function positiveNumber(value: string, fallback: number): number {
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
}

function buildConfig(draft: Draft): Record<string, unknown> {
  const minSpendCents = moneyToCents(draft.minSpend);
  const withMinSpend = (base: Record<string, unknown>) =>
    minSpendCents === null ? base : { ...base, minSpendCents };

  switch (draft.type) {
    case 'PERCENTAGE_OFF':
      return withMinSpend({
        discountPercent: positiveNumber(draft.discountPercent, 10),
        targetItemStableIds: draft.targetItemStableIds,
      });
    case 'FIXED_AMOUNT_OFF':
      return withMinSpend({
        discountCents: moneyToCents(draft.discountAmount) ?? 0,
        targetItemStableIds: draft.targetItemStableIds,
      });
    case 'BUY_X_GET_Y':
      return withMinSpend({
        buyItemStableIds: draft.buyItemStableIds,
        buyQuantity: Math.max(1, Math.round(positiveNumber(draft.buyQuantity, 1))),
        getItemStableIds: draft.getItemStableIds,
        getQuantity: Math.max(1, Math.round(positiveNumber(draft.getQuantity, 1))),
        discountPercent: positiveNumber(draft.rewardPercent, 100),
      });
    case 'FREE_ITEM':
      return withMinSpend({
        itemStableIds: draft.freeItemStableIds,
        quantity: Math.max(1, Math.round(positiveNumber(draft.freeQuantity, 1))),
      });
    case 'LOYALTY_MULTIPLIER':
      return withMinSpend({ multiplier: positiveNumber(draft.multiplier, 2) });
  }
}

function ItemSelector({
  label,
  selected,
  items,
  onChange,
  hint,
}: {
  label: string;
  selected: string[];
  items: Array<{ stableId: string; label: string }>;
  onChange: (value: string[]) => void;
  hint?: string;
}) {
  const selectedSet = new Set(selected);
  return (
    <label className="block space-y-2 text-sm font-medium text-slate-700">
      <span>{label}</span>
      {hint ? <span className="ml-2 text-xs font-normal text-slate-500">{hint}</span> : null}
      <select
        multiple
        value={selected}
        onChange={(event) =>
          onChange(Array.from(event.currentTarget.selectedOptions, (option) => option.value))
        }
        className="min-h-40 w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm"
      >
        {items.map((item) => (
          <option key={item.stableId} value={item.stableId}>
            {selectedSet.has(item.stableId) ? '✓ ' : ''}{item.label}
          </option>
        ))}
      </select>
    </label>
  );
}

export default function AutomaticPromotionsPage() {
  const { locale } = useParams<{ locale: Locale }>();
  const isZh = locale === 'zh';
  const [rules, setRules] = useState<RuleDto[]>([]);
  const [categories, setCategories] = useState<AdminMenuCategoryDto[]>([]);
  const [draft, setDraft] = useState<Draft>(() => emptyDraft());
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);

  const menuItems = useMemo(
    () =>
      categories.flatMap((category) =>
        category.items.map((item) => ({
          stableId: item.stableId,
          label: `${item.nameEn}${item.nameZh ? ` / ${item.nameZh}` : ''}`,
        })),
      ),
    [categories],
  );

  async function reload() {
    const [ruleList, menu] = await Promise.all([
      apiFetch<RuleDto[]>('/admin/promotions/rules'),
      apiFetch<{ categories: AdminMenuCategoryDto[] }>('/admin/menu/full'),
    ]);
    setRules(ruleList);
    setCategories(menu.categories ?? []);
  }

  useEffect(() => {
    let cancelled = false;
    async function load() {
      setLoading(true);
      setError(null);
      try {
        const [ruleList, menu] = await Promise.all([
          apiFetch<RuleDto[]>('/admin/promotions/rules'),
          apiFetch<{ categories: AdminMenuCategoryDto[] }>('/admin/menu/full'),
        ]);
        if (cancelled) return;
        setRules(ruleList);
        setCategories(menu.categories ?? []);
      } catch (err) {
        console.error(err);
        if (!cancelled) setError(isZh ? '加载促销活动失败。' : 'Failed to load promotions.');
      } finally {
        if (!cancelled) setLoading(false);
      }
    }
    void load();
    return () => {
      cancelled = true;
    };
  }, [isZh]);

  function patch(patchValue: Partial<Draft>) {
    setSaved(false);
    setDraft((current) => ({ ...current, ...patchValue }));
  }

  function toggleWeekday(day: number) {
    patch({
      weekdays: draft.weekdays.includes(day)
        ? draft.weekdays.filter((value) => value !== day)
        : [...draft.weekdays, day].sort((a, b) => a - b),
    });
  }

  function toggleChannel(channel: PromotionChannel) {
    patch({
      channels: draft.channels.includes(channel)
        ? draft.channels.filter((value) => value !== channel)
        : [...draft.channels, channel],
    });
  }

  async function save() {
    setSaving(true);
    setSaved(false);
    setError(null);
    try {
      const body = {
        titleZh: draft.titleZh.trim(),
        titleEn: draft.titleEn.trim() || null,
        description: draft.description.trim() || null,
        type: draft.type,
        status: draft.status,
        priority: Math.max(101, Math.round(Number(draft.priority) || 175)),
        stackingPolicy: draft.stackingPolicy,
        excludesCoupons: draft.excludesCoupons,
        excludesItemPromotions: draft.excludesItemPromotions,
        channels: draft.channels,
        validFrom: draft.validFrom || null,
        validTo: draft.validTo || null,
        weekdays: draft.weekdays,
        startMinutes: timeToMinutes(draft.startTime),
        endMinutes: timeToMinutes(draft.endTime),
        config: buildConfig(draft),
      };
      const savedRule = draft.stableId
        ? await apiFetch<RuleDto>(`/admin/promotions/rules/${draft.stableId}`, {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(body),
          })
        : await apiFetch<RuleDto>('/admin/promotions/rules', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(body),
          });
      await reload();
      setDraft(draftFromRule(savedRule));
      setSaved(true);
    } catch (err) {
      console.error(err);
      setError(isZh ? '保存失败，请检查活动规则。' : 'Save failed. Check the promotion rules.');
    } finally {
      setSaving(false);
    }
  }

  async function remove() {
    if (!draft.stableId) return;
    if (!window.confirm(isZh ? '确认结束并删除这个活动？' : 'End and delete this promotion?')) return;
    setSaving(true);
    setError(null);
    try {
      await apiFetch(`/admin/promotions/rules/${draft.stableId}`, { method: 'DELETE' });
      await reload();
      setDraft(emptyDraft());
    } catch (err) {
      console.error(err);
      setError(isZh ? '删除失败。' : 'Delete failed.');
    } finally {
      setSaving(false);
    }
  }

  if (loading) {
    return <main className="mx-auto max-w-7xl p-6 text-sm text-slate-500">{isZh ? '加载中…' : 'Loading…'}</main>;
  }

  return (
    <main className="mx-auto grid max-w-7xl gap-6 p-6 lg:grid-cols-[320px_minmax(0,1fr)]">
      <aside className="space-y-4">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-xl font-bold text-slate-900">{isZh ? '自动优惠与积分' : 'Automatic & loyalty'}</h1>
            <p className="mt-1 text-xs text-slate-500">{isZh ? '由 Promotion Engine 统一计算' : 'Resolved by Promotion Engine'}</p>
          </div>
          <button onClick={() => setDraft(emptyDraft())} className="rounded-lg bg-slate-900 px-3 py-2 text-sm font-medium text-white">
            {isZh ? '新建' : 'New'}
          </button>
        </div>
        <div className="space-y-2">
          {rules.length === 0 ? (
            <div className="rounded-xl border border-dashed border-slate-300 p-4 text-sm text-slate-500">{isZh ? '暂无活动' : 'No promotions yet'}</div>
          ) : rules.map((rule) => (
            <button
              key={rule.stableId}
              onClick={() => setDraft(draftFromRule(rule))}
              className={`w-full rounded-xl border p-4 text-left ${draft.stableId === rule.stableId ? 'border-amber-400 bg-amber-50' : 'border-slate-200 bg-white hover:border-slate-300'}`}
            >
              <div className="flex items-start justify-between gap-2">
                <span className="font-semibold text-slate-900">{isZh ? rule.titleZh : rule.titleEn || rule.titleZh}</span>
                <span className="rounded-full bg-slate-100 px-2 py-0.5 text-[11px] text-slate-600">{rule.status}</span>
              </div>
              <div className="mt-2 text-xs text-slate-500">{RULE_TYPES.find((item) => item.value === rule.type)?.[isZh ? 'zh' : 'en']}</div>
            </button>
          ))}
        </div>
      </aside>

      <section className="space-y-6 rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
        <div className="grid gap-4 md:grid-cols-2">
          <label className="text-sm font-medium text-slate-700">{isZh ? '中文名称' : 'Chinese title'}<input value={draft.titleZh} onChange={(e) => patch({ titleZh: e.target.value })} className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2" /></label>
          <label className="text-sm font-medium text-slate-700">{isZh ? '英文名称' : 'English title'}<input value={draft.titleEn} onChange={(e) => patch({ titleEn: e.target.value })} className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2" /></label>
          <label className="text-sm font-medium text-slate-700">{isZh ? '活动类型' : 'Type'}<select value={draft.type} onChange={(e) => patch({ type: e.target.value as RuleType })} className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2">{RULE_TYPES.map((item) => <option key={item.value} value={item.value}>{isZh ? item.zh : item.en}</option>)}</select></label>
          <label className="text-sm font-medium text-slate-700">{isZh ? '状态' : 'Status'}<select value={draft.status} onChange={(e) => patch({ status: e.target.value as RuleStatus })} className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2"><option value="DRAFT">DRAFT</option><option value="ACTIVE">ACTIVE</option><option value="PAUSED">PAUSED</option><option value="ENDED">ENDED</option></select></label>
        </div>

        <label className="block text-sm font-medium text-slate-700">{isZh ? '说明' : 'Description'}<textarea value={draft.description} onChange={(e) => patch({ description: e.target.value })} rows={2} className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2" /></label>

        <div className="grid gap-4 md:grid-cols-3">
          <label className="text-sm font-medium text-slate-700">{isZh ? '优先级' : 'Priority'}<input type="number" min={101} max={1000} value={draft.priority} onChange={(e) => patch({ priority: e.target.value })} className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2" /><span className="mt-1 block text-xs font-normal text-slate-500">{isZh ? '101–1000；每日特价固定优先于此类活动。' : '101–1000; Daily Specials always resolve before these rules.'}</span></label>
          <label className="text-sm font-medium text-slate-700">{isZh ? '叠加方式' : 'Stacking'}<select value={draft.stackingPolicy} onChange={(e) => patch({ stackingPolicy: e.target.value as StackingPolicy })} className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2"><option value="EXCLUSIVE">EXCLUSIVE</option><option value="STACKABLE">STACKABLE</option></select></label>
          <label className="text-sm font-medium text-slate-700">{isZh ? '最低消费 ($)' : 'Minimum spend ($)'}<input inputMode="decimal" value={draft.minSpend} onChange={(e) => patch({ minSpend: e.target.value })} className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2" /></label>
        </div>

        <div className="rounded-xl border border-slate-200 bg-slate-50 p-4">
          <h2 className="font-semibold text-slate-900">{isZh ? '优惠内容' : 'Benefit'}</h2>
          <div className="mt-4 grid gap-4 md:grid-cols-2">
            {draft.type === 'PERCENTAGE_OFF' && <><label className="text-sm font-medium text-slate-700">{isZh ? '优惠百分比' : 'Discount %'}<input type="number" min={1} max={100} value={draft.discountPercent} onChange={(e) => patch({ discountPercent: e.target.value })} className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2" /></label><ItemSelector label={isZh ? '适用商品' : 'Target items'} hint={isZh ? '不选 = 全单商品' : 'None = all items'} selected={draft.targetItemStableIds} items={menuItems} onChange={(value) => patch({ targetItemStableIds: value })} /></>}
            {draft.type === 'FIXED_AMOUNT_OFF' && <><label className="text-sm font-medium text-slate-700">{isZh ? '优惠金额 ($)' : 'Discount ($)'}<input inputMode="decimal" value={draft.discountAmount} onChange={(e) => patch({ discountAmount: e.target.value })} className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2" /></label><ItemSelector label={isZh ? '适用商品' : 'Target items'} hint={isZh ? '不选 = 全单商品' : 'None = all items'} selected={draft.targetItemStableIds} items={menuItems} onChange={(value) => patch({ targetItemStableIds: value })} /></>}
            {draft.type === 'BUY_X_GET_Y' && <><ItemSelector label={isZh ? '购买商品' : 'Buy items'} selected={draft.buyItemStableIds} items={menuItems} onChange={(value) => patch({ buyItemStableIds: value })} /><ItemSelector label={isZh ? '奖励商品' : 'Get items'} selected={draft.getItemStableIds} items={menuItems} onChange={(value) => patch({ getItemStableIds: value })} /><label className="text-sm font-medium text-slate-700">Buy X<input type="number" min={1} value={draft.buyQuantity} onChange={(e) => patch({ buyQuantity: e.target.value })} className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2" /></label><label className="text-sm font-medium text-slate-700">Get Y<input type="number" min={1} value={draft.getQuantity} onChange={(e) => patch({ getQuantity: e.target.value })} className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2" /></label><label className="text-sm font-medium text-slate-700">{isZh ? '奖励优惠 %' : 'Reward discount %'}<input type="number" min={1} max={100} value={draft.rewardPercent} onChange={(e) => patch({ rewardPercent: e.target.value })} className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2" /></label></>}
            {draft.type === 'FREE_ITEM' && <><ItemSelector label={isZh ? '赠品商品' : 'Free items'} hint={isZh ? '当前规则只对购物车中已存在的赠品行免单，不会自动向购物车加菜。' : 'This rule discounts matching items already in the cart; it does not auto-add an item.'} selected={draft.freeItemStableIds} items={menuItems} onChange={(value) => patch({ freeItemStableIds: value })} /><label className="text-sm font-medium text-slate-700">{isZh ? '赠送数量' : 'Free quantity'}<input type="number" min={1} value={draft.freeQuantity} onChange={(e) => patch({ freeQuantity: e.target.value })} className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2" /></label></>}
            {draft.type === 'LOYALTY_MULTIPLIER' && <label className="text-sm font-medium text-slate-700">{isZh ? '积分倍数' : 'Points multiplier'}<input type="number" min={1} max={10} step="0.1" value={draft.multiplier} onChange={(e) => patch({ multiplier: e.target.value })} className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2" /></label>}
          </div>
        </div>

        <div className="grid gap-4 md:grid-cols-2">
          <label className="text-sm font-medium text-slate-700">{isZh ? '开始日期' : 'Start date'}<input type="date" value={draft.validFrom} onChange={(e) => patch({ validFrom: e.target.value })} className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2" /></label>
          <label className="text-sm font-medium text-slate-700">{isZh ? '结束日期' : 'End date'}<input type="date" value={draft.validTo} onChange={(e) => patch({ validTo: e.target.value })} className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2" /></label>
          <label className="text-sm font-medium text-slate-700">{isZh ? '开始时间' : 'Start time'}<input type="time" value={draft.startTime} onChange={(e) => patch({ startTime: e.target.value })} className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2" /></label>
          <label className="text-sm font-medium text-slate-700">{isZh ? '结束时间' : 'End time'}<input type="time" value={draft.endTime} onChange={(e) => patch({ endTime: e.target.value })} className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2" /></label>
        </div>

        <div>
          <div className="text-sm font-medium text-slate-700">{isZh ? '适用星期（不选 = 每天）' : 'Weekdays (none = every day)'}</div>
          <div className="mt-2 flex flex-wrap gap-2">{WEEKDAYS.map((day) => <button key={day.value} type="button" onClick={() => toggleWeekday(day.value)} className={`rounded-full border px-3 py-1.5 text-sm ${draft.weekdays.includes(day.value) ? 'border-amber-500 bg-amber-50 text-amber-900' : 'border-slate-300 bg-white text-slate-600'}`}>{isZh ? `周${day.zh}` : day.en}</button>)}</div>
        </div>

        <div>
          <div className="text-sm font-medium text-slate-700">{isZh ? '渠道' : 'Channels'}</div>
          <div className="mt-2 flex flex-wrap gap-3">
            {(['web', 'in_store', 'ubereats'] as PromotionChannel[]).map((channel) => <label key={channel} className="flex items-center gap-2 text-sm text-slate-700"><input type="checkbox" checked={draft.channels.includes(channel)} onChange={() => toggleChannel(channel)} />{channel === 'web' ? 'Web' : channel === 'in_store' ? 'POS' : 'Uber Eats'}</label>)}
          </div>
          {draft.channels.includes('ubereats') ? <p className="mt-2 text-xs font-medium text-amber-700">{isZh ? 'Uber Eats 已使用平台订单价格；只有明确需要 SanQ 二次优惠时才启用此渠道。' : 'Uber Eats already supplies platform order prices. Enable this only when a SanQ-side additional promotion is intentional.'}</p> : null}
        </div>

        <div className="flex flex-wrap gap-4 rounded-xl border border-slate-200 p-4">
          <label className="flex items-center gap-2 text-sm text-slate-700"><input type="checkbox" checked={draft.excludesCoupons} onChange={(e) => patch({ excludesCoupons: e.target.checked })} />{isZh ? '应用后排除优惠券' : 'Exclude coupons when applied'}</label>
          <label className="flex items-center gap-2 text-sm text-slate-700"><input type="checkbox" checked={draft.excludesItemPromotions} onChange={(e) => patch({ excludesItemPromotions: e.target.checked })} />{isZh ? '与商品特价互斥' : 'Conflict with item specials'}</label>
        </div>

        {error ? <p className="rounded-lg bg-red-50 px-4 py-3 text-sm text-red-700">{error}</p> : null}
        {saved ? <p className="rounded-lg bg-emerald-50 px-4 py-3 text-sm text-emerald-700">{isZh ? '已保存。' : 'Saved.'}</p> : null}
        <div className="flex items-center justify-between gap-3">
          <div>{draft.stableId ? <button type="button" disabled={saving} onClick={() => void remove()} className="rounded-lg border border-red-300 px-4 py-2 text-sm font-medium text-red-700 disabled:opacity-50">{isZh ? '结束并删除' : 'End & delete'}</button> : null}</div>
          <button type="button" disabled={saving || !draft.titleZh.trim() || draft.channels.length === 0} onClick={() => void save()} className="rounded-lg bg-slate-900 px-5 py-2.5 text-sm font-semibold text-white disabled:opacity-50">{saving ? (isZh ? '保存中…' : 'Saving…') : (isZh ? '保存活动' : 'Save promotion')}</button>
        </div>
      </section>
    </main>
  );
}
