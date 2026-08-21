'use client';

import { useEffect, useMemo, useState } from 'react';
import { useParams } from 'next/navigation';
import type { Locale } from '@/lib/i18n/locales';
import { apiFetch } from '@/lib/api/client';
import type {
  AdminMenuCategoryDto,
  DailySpecialDto,
  SpecialPricingMode,
} from '@shared/menu';

type Draft = {
  stableId: string | null;
  weekday: number;
  itemStableId: string;
  pricingMode: SpecialPricingMode;
  overridePriceCents: string;
  discountDeltaCents: string;
  discountPercent: string;
  startDate: string;
  endDate: string;
  startTime: string;
  endTime: string;
  disallowCoupons: boolean;
  isEnabled: boolean;
  sortOrder: string;
};

const WEEKDAYS = [
  { value: 1, zh: '周一', en: 'Mon' },
  { value: 2, zh: '周二', en: 'Tue' },
  { value: 3, zh: '周三', en: 'Wed' },
  { value: 4, zh: '周四', en: 'Thu' },
  { value: 5, zh: '周五', en: 'Fri' },
  { value: 6, zh: '周六', en: 'Sat' },
  { value: 7, zh: '周日', en: 'Sun' },
];

function emptyDraft(weekday: number): Draft {
  return {
    stableId: null,
    weekday,
    itemStableId: '',
    pricingMode: 'OVERRIDE_PRICE',
    overridePriceCents: '',
    discountDeltaCents: '',
    discountPercent: '',
    startDate: '',
    endDate: '',
    startTime: '',
    endTime: '',
    disallowCoupons: true,
    isEnabled: true,
    sortOrder: '0',
  };
}

function isoToDateInput(value: string | null): string {
  if (!value) return '';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '';
  const year = date.getUTCFullYear();
  const month = String(date.getUTCMonth() + 1).padStart(2, '0');
  const day = String(date.getUTCDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

function minutesToTimeInput(value: number | null): string {
  if (value === null || !Number.isFinite(value)) return '';
  const hours = Math.floor(value / 60);
  const minutes = value % 60;
  return `${String(hours).padStart(2, '0')}:${String(minutes).padStart(2, '0')}`;
}

function timeInputToMinutes(value: string): number | null {
  const trimmed = value.trim();
  if (!trimmed) return null;
  const [hoursRaw, minutesRaw] = trimmed.split(':');
  const hours = Number(hoursRaw);
  const minutes = Number(minutesRaw);
  if (
    !Number.isInteger(hours) ||
    !Number.isInteger(minutes) ||
    hours < 0 ||
    hours > 23 ||
    minutes < 0 ||
    minutes > 59
  ) {
    return null;
  }
  return hours * 60 + minutes;
}

function optionalInt(value: string): number | null {
  const trimmed = value.trim();
  if (!trimmed) return null;
  const parsed = Number(trimmed);
  return Number.isFinite(parsed) ? Math.trunc(parsed) : null;
}

function groupDrafts(specials: DailySpecialDto[]): Record<number, Draft[]> {
  const grouped: Record<number, Draft[]> = {
    1: [],
    2: [],
    3: [],
    4: [],
    5: [],
    6: [],
    7: [],
  };

  for (const special of specials) {
    if (!grouped[special.weekday]) continue;
    grouped[special.weekday].push({
      stableId: special.stableId,
      weekday: special.weekday,
      itemStableId: special.itemStableId,
      pricingMode: special.pricingMode,
      overridePriceCents:
        special.overridePriceCents === null ? '' : String(special.overridePriceCents),
      discountDeltaCents:
        special.discountDeltaCents === null ? '' : String(special.discountDeltaCents),
      discountPercent:
        special.discountPercent === null ? '' : String(special.discountPercent),
      startDate: isoToDateInput(special.startDate),
      endDate: isoToDateInput(special.endDate),
      startTime: minutesToTimeInput(special.startMinutes),
      endTime: minutesToTimeInput(special.endMinutes),
      disallowCoupons: special.disallowCoupons,
      isEnabled: special.isEnabled,
      sortOrder: String(special.sortOrder ?? 0),
    });
  }

  for (const day of WEEKDAYS) {
    grouped[day.value].sort(
      (left, right) => Number(left.sortOrder) - Number(right.sortOrder),
    );
  }
  return grouped;
}

export default function PromotionsSpecialsPage() {
  const { locale } = useParams<{ locale: Locale }>();
  const isZh = locale === 'zh';
  const [categories, setCategories] = useState<AdminMenuCategoryDto[]>([]);
  const [drafts, setDrafts] = useState<Record<number, Draft[]>>(() =>
    groupDrafts([]),
  );
  const [activeWeekday, setActiveWeekday] = useState(1);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    let cancelled = false;
    async function load() {
      setLoading(true);
      setError(null);
      try {
        const [menu, specials] = await Promise.all([
          apiFetch<{ categories: AdminMenuCategoryDto[] }>('/admin/menu/full'),
          apiFetch<{ specials: DailySpecialDto[] }>('/admin/menu/daily-specials'),
        ]);
        if (cancelled) return;
        setCategories(menu.categories ?? []);
        setDrafts(groupDrafts(specials.specials ?? []));
      } catch (err) {
        console.error(err);
        if (!cancelled) {
          setError(
            isZh ? '加载商品特价失败，请稍后重试。' : 'Failed to load item specials.',
          );
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    }
    void load();
    return () => {
      cancelled = true;
    };
  }, [isZh]);

  const choicesByCategory = useMemo(
    () =>
      categories.map((category) => ({
        categoryStableId: category.stableId,
        label: isZh ? category.nameZh ?? category.nameEn : category.nameEn,
        items: category.items.map((item) => ({
          stableId: item.stableId,
          label: `${item.nameEn}${item.nameZh ? ` / ${item.nameZh}` : ''}`,
        })),
      })),
    [categories, isZh],
  );

  function updateDraft(weekday: number, index: number, patch: Partial<Draft>) {
    setSaved(false);
    setDrafts((previous) => ({
      ...previous,
      [weekday]: (previous[weekday] ?? []).map((draft, draftIndex) =>
        draftIndex === index ? { ...draft, ...patch } : draft,
      ),
    }));
  }

  function addDraft() {
    setSaved(false);
    setDrafts((previous) => ({
      ...previous,
      [activeWeekday]: [
        ...(previous[activeWeekday] ?? []),
        emptyDraft(activeWeekday),
      ],
    }));
  }

  function removeDraft(index: number) {
    setSaved(false);
    setDrafts((previous) => ({
      ...previous,
      [activeWeekday]: (previous[activeWeekday] ?? []).filter(
        (_, draftIndex) => draftIndex !== index,
      ),
    }));
  }

  async function save() {
    setSaving(true);
    setSaved(false);
    setError(null);
    try {
      const specials = WEEKDAYS.flatMap(({ value }) =>
        (drafts[value] ?? [])
          .filter((draft) => draft.itemStableId.trim())
          .map((draft) => ({
            stableId: draft.stableId,
            weekday: draft.weekday,
            itemStableId: draft.itemStableId.trim(),
            pricingMode: draft.pricingMode,
            overridePriceCents: optionalInt(draft.overridePriceCents),
            discountDeltaCents: optionalInt(draft.discountDeltaCents),
            discountPercent: optionalInt(draft.discountPercent),
            startDate: draft.startDate || null,
            endDate: draft.endDate || null,
            startMinutes: timeInputToMinutes(draft.startTime),
            endMinutes: timeInputToMinutes(draft.endTime),
            disallowCoupons: draft.disallowCoupons,
            isEnabled: draft.isEnabled,
            sortOrder: optionalInt(draft.sortOrder) ?? 0,
          })),
      );

      const response = await apiFetch<{ specials: DailySpecialDto[] }>(
        '/admin/menu/daily-specials/bulk',
        {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ specials }),
        },
      );
      setDrafts(groupDrafts(response.specials ?? []));
      setSaved(true);
    } catch (err) {
      console.error(err);
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setSaving(false);
    }
  }

  const activeDrafts = drafts[activeWeekday] ?? [];

  return (
    <main className="mx-auto flex max-w-6xl flex-col gap-6 p-6">
      <header className="flex flex-wrap items-start justify-between gap-4">
        <div className="space-y-2">
          <h1 className="text-2xl font-semibold text-slate-900">
            {isZh ? '商品特价' : 'Item specials'}
          </h1>
          <p className="max-w-3xl text-sm text-slate-600">
            {isZh
              ? '配置按星期生效的商品特价，并可限制活动日期、每日时段以及是否允许与优惠券叠加。日期按门店时区解释。'
              : 'Configure weekday item specials with optional date ranges, daily time windows, and coupon stacking. Dates are interpreted in the store timezone.'}
          </p>
        </div>
        <button
          type="button"
          onClick={() => void save()}
          disabled={saving || loading}
          className="rounded-md bg-amber-600 px-4 py-2 text-sm font-medium text-white disabled:opacity-60"
        >
          {saving ? (isZh ? '保存中…' : 'Saving…') : isZh ? '保存设置' : 'Save'}
        </button>
      </header>

      {error ? (
        <div className="rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-700">
          {error}
        </div>
      ) : null}
      {saved ? (
        <div className="rounded-lg border border-emerald-200 bg-emerald-50 p-3 text-sm text-emerald-700">
          {isZh ? '商品特价已保存。' : 'Item specials saved.'}
        </div>
      ) : null}

      <div className="flex flex-wrap gap-2">
        {WEEKDAYS.map((day) => (
          <button
            key={day.value}
            type="button"
            onClick={() => setActiveWeekday(day.value)}
            className={`rounded-full px-4 py-2 text-sm font-medium ${
              activeWeekday === day.value
                ? 'bg-amber-600 text-white'
                : 'border border-amber-200 bg-white text-amber-800'
            }`}
          >
            {isZh ? day.zh : day.en}
          </button>
        ))}
      </div>

      {loading ? (
        <p className="text-sm text-slate-500">{isZh ? '加载中…' : 'Loading…'}</p>
      ) : (
        <section className="space-y-4">
          {activeDrafts.map((draft, index) => (
            <article
              key={`${draft.stableId ?? 'new'}-${index}`}
              className="rounded-2xl border border-amber-200 bg-white p-5 shadow-sm"
            >
              <div className="grid gap-4 lg:grid-cols-4">
                <label className="space-y-1 lg:col-span-2">
                  <span className="text-xs font-medium text-slate-600">
                    {isZh ? '菜品' : 'Menu item'}
                  </span>
                  <select
                    value={draft.itemStableId}
                    onChange={(event) =>
                      updateDraft(activeWeekday, index, {
                        itemStableId: event.target.value,
                      })
                    }
                    className="w-full rounded-md border border-slate-200 px-3 py-2 text-sm"
                  >
                    <option value="">{isZh ? '选择菜品' : 'Select item'}</option>
                    {choicesByCategory.map((category) => (
                      <optgroup key={category.categoryStableId} label={category.label}>
                        {category.items.map((item) => (
                          <option key={item.stableId} value={item.stableId}>
                            {item.label}
                          </option>
                        ))}
                      </optgroup>
                    ))}
                  </select>
                </label>

                <label className="space-y-1">
                  <span className="text-xs font-medium text-slate-600">
                    {isZh ? '定价方式' : 'Pricing'}
                  </span>
                  <select
                    value={draft.pricingMode}
                    onChange={(event) =>
                      updateDraft(activeWeekday, index, {
                        pricingMode: event.target.value as SpecialPricingMode,
                      })
                    }
                    className="w-full rounded-md border border-slate-200 px-3 py-2 text-sm"
                  >
                    <option value="OVERRIDE_PRICE">
                      {isZh ? '指定特价' : 'Override price'}
                    </option>
                    <option value="DISCOUNT_DELTA">
                      {isZh ? '减固定金额' : 'Fixed amount off'}
                    </option>
                    <option value="DISCOUNT_PERCENT">
                      {isZh ? '百分比折扣' : 'Percent off'}
                    </option>
                  </select>
                </label>

                <label className="space-y-1">
                  <span className="text-xs font-medium text-slate-600">
                    {draft.pricingMode === 'OVERRIDE_PRICE'
                      ? isZh
                        ? '特价（分）'
                        : 'Price (cents)'
                      : draft.pricingMode === 'DISCOUNT_DELTA'
                        ? isZh
                          ? '减免（分）'
                          : 'Amount off (cents)'
                        : isZh
                          ? '折扣（%）'
                          : 'Percent off'}
                  </span>
                  <input
                    type="number"
                    min={0}
                    max={draft.pricingMode === 'DISCOUNT_PERCENT' ? 100 : undefined}
                    value={
                      draft.pricingMode === 'OVERRIDE_PRICE'
                        ? draft.overridePriceCents
                        : draft.pricingMode === 'DISCOUNT_DELTA'
                          ? draft.discountDeltaCents
                          : draft.discountPercent
                    }
                    onChange={(event) => {
                      const value = event.target.value;
                      updateDraft(
                        activeWeekday,
                        index,
                        draft.pricingMode === 'OVERRIDE_PRICE'
                          ? { overridePriceCents: value }
                          : draft.pricingMode === 'DISCOUNT_DELTA'
                            ? { discountDeltaCents: value }
                            : { discountPercent: value },
                      );
                    }}
                    className="w-full rounded-md border border-slate-200 px-3 py-2 text-sm"
                  />
                </label>
              </div>

              <div className="mt-4 grid gap-4 md:grid-cols-2 lg:grid-cols-4">
                <label className="space-y-1">
                  <span className="text-xs font-medium text-slate-600">
                    {isZh ? '开始日期（可选）' : 'Start date (optional)'}
                  </span>
                  <input
                    type="date"
                    value={draft.startDate}
                    onChange={(event) =>
                      updateDraft(activeWeekday, index, { startDate: event.target.value })
                    }
                    className="w-full rounded-md border border-slate-200 px-3 py-2 text-sm"
                  />
                </label>
                <label className="space-y-1">
                  <span className="text-xs font-medium text-slate-600">
                    {isZh ? '结束日期（可选）' : 'End date (optional)'}
                  </span>
                  <input
                    type="date"
                    value={draft.endDate}
                    onChange={(event) =>
                      updateDraft(activeWeekday, index, { endDate: event.target.value })
                    }
                    className="w-full rounded-md border border-slate-200 px-3 py-2 text-sm"
                  />
                </label>
                <label className="space-y-1">
                  <span className="text-xs font-medium text-slate-600">
                    {isZh ? '每日开始时间（可选）' : 'Daily start (optional)'}
                  </span>
                  <input
                    type="time"
                    value={draft.startTime}
                    onChange={(event) =>
                      updateDraft(activeWeekday, index, { startTime: event.target.value })
                    }
                    className="w-full rounded-md border border-slate-200 px-3 py-2 text-sm"
                  />
                </label>
                <label className="space-y-1">
                  <span className="text-xs font-medium text-slate-600">
                    {isZh ? '每日结束时间（可选）' : 'Daily end (optional)'}
                  </span>
                  <input
                    type="time"
                    value={draft.endTime}
                    onChange={(event) =>
                      updateDraft(activeWeekday, index, { endTime: event.target.value })
                    }
                    className="w-full rounded-md border border-slate-200 px-3 py-2 text-sm"
                  />
                </label>
              </div>

              <div className="mt-4 flex flex-wrap items-center gap-5 border-t border-slate-100 pt-4 text-sm text-slate-700">
                <label className="flex items-center gap-2">
                  <input
                    type="checkbox"
                    checked={draft.isEnabled}
                    onChange={(event) =>
                      updateDraft(activeWeekday, index, { isEnabled: event.target.checked })
                    }
                  />
                  {isZh ? '启用' : 'Enabled'}
                </label>
                <label className="flex items-center gap-2">
                  <input
                    type="checkbox"
                    checked={!draft.disallowCoupons}
                    onChange={(event) =>
                      updateDraft(activeWeekday, index, {
                        disallowCoupons: !event.target.checked,
                      })
                    }
                  />
                  {isZh ? '允许与优惠券叠加' : 'Allow coupon stacking'}
                </label>
                <label className="flex items-center gap-2">
                  <span>{isZh ? '排序' : 'Sort'}</span>
                  <input
                    type="number"
                    value={draft.sortOrder}
                    onChange={(event) =>
                      updateDraft(activeWeekday, index, { sortOrder: event.target.value })
                    }
                    className="w-20 rounded-md border border-slate-200 px-2 py-1"
                  />
                </label>
                <button
                  type="button"
                  onClick={() => removeDraft(index)}
                  className="ml-auto rounded-md border border-slate-200 px-3 py-1 text-sm text-slate-600 hover:bg-slate-50"
                >
                  {isZh ? '移除' : 'Remove'}
                </button>
              </div>
            </article>
          ))}

          <button
            type="button"
            onClick={addDraft}
            className="rounded-md border border-amber-300 px-4 py-2 text-sm font-medium text-amber-800 hover:bg-amber-50"
          >
            {isZh ? '新增商品特价' : 'Add item special'}
          </button>
        </section>
      )}
    </main>
  );
}
