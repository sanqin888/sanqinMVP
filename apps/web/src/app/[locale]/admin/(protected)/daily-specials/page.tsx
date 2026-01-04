"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useParams } from "next/navigation";
import type { Locale } from "@/lib/order/shared";
import { apiFetch } from "@/lib/api-client";
import type {
  AdminMenuCategoryDto,
  DailySpecialDto,
  SpecialPricingMode,
} from "@shared/menu";

type ItemChoice = {
  stableId: string;
  label: string;
  categoryLabel: string;
};

type DailySpecialDraft = {
  stableId: string | null;
  weekday: number;
  itemStableId: string;
  pricingMode: SpecialPricingMode;
  overridePriceCents: string;
  discountDeltaCents: string;
  discountPercent: string;
  startDate: string;
  endDate: string;
  startMinutes: string;
  endMinutes: string;
  isEnabled: boolean;
  sortOrder: string;
};

const DAILY_SPECIAL_WEEKDAYS = [
  { value: 1, labelEn: "Mon", labelZh: "周一" },
  { value: 2, labelEn: "Tue", labelZh: "周二" },
  { value: 3, labelEn: "Wed", labelZh: "周三" },
  { value: 4, labelEn: "Thu", labelZh: "周四" },
  { value: 5, labelEn: "Fri", labelZh: "周五" },
  { value: 6, labelEn: "Sat", labelZh: "周六" },
  { value: 7, labelEn: "Sun", labelZh: "周日" },
];

function createDailySpecialDraft(weekday: number): DailySpecialDraft {
  return {
    stableId: null,
    weekday,
    itemStableId: "",
    pricingMode: "OVERRIDE_PRICE",
    overridePriceCents: "",
    discountDeltaCents: "",
    discountPercent: "",
    startDate: "",
    endDate: "",
    startMinutes: "",
    endMinutes: "",
    isEnabled: true,
    sortOrder: "0",
  };
}

function buildDailySpecialDrafts(
  specials: DailySpecialDto[],
): Record<number, DailySpecialDraft[]> {
  const grouped: Record<number, DailySpecialDraft[]> = {
    1: [],
    2: [],
    3: [],
    4: [],
    5: [],
    6: [],
    7: [],
  };
  specials.forEach((special) => {
    if (!grouped[special.weekday]) return;
    grouped[special.weekday].push({
      stableId: special.stableId,
      weekday: special.weekday,
      itemStableId: special.itemStableId,
      pricingMode: special.pricingMode,
      overridePriceCents:
        typeof special.overridePriceCents === "number"
          ? String(special.overridePriceCents)
          : "",
      discountDeltaCents:
        typeof special.discountDeltaCents === "number"
          ? String(special.discountDeltaCents)
          : "",
      discountPercent:
        typeof special.discountPercent === "number"
          ? String(special.discountPercent)
          : "",
      startDate: special.startDate ?? "",
      endDate: special.endDate ?? "",
      startMinutes:
        typeof special.startMinutes === "number"
          ? String(special.startMinutes)
          : "",
      endMinutes:
        typeof special.endMinutes === "number"
          ? String(special.endMinutes)
          : "",
      isEnabled: special.isEnabled,
      sortOrder: String(special.sortOrder ?? 0),
    });
  });
  DAILY_SPECIAL_WEEKDAYS.forEach(({ value }) => {
    grouped[value] = (grouped[value] ?? []).sort((a, b) => {
      const aSort = Number(a.sortOrder) || 0;
      const bSort = Number(b.sortOrder) || 0;
      return aSort - bSort;
    });
  });
  return grouped;
}

function parseOptionalInt(value: string): number | null {
  const trimmed = value.trim();
  if (!trimmed) return null;
  const parsed = Number(trimmed);
  return Number.isFinite(parsed) ? Math.trunc(parsed) : null;
}

export default function DailySpecialsPage() {
  const { locale } = useParams<{ locale: Locale }>();
  const isZh = locale === "zh";

  const [categories, setCategories] = useState<AdminMenuCategoryDto[]>([]);
  const [dailySpecialDrafts, setDailySpecialDrafts] = useState<
    Record<number, DailySpecialDraft[]>
  >({
    1: [],
    2: [],
    3: [],
    4: [],
    5: [],
    6: [],
    7: [],
  });
  const [activeWeekday, setActiveWeekday] = useState(1);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);

  const itemChoices = useMemo<ItemChoice[]>(() => {
    return categories.flatMap((category) =>
      category.items.map((item) => ({
        stableId: item.stableId,
        label: `${item.nameEn}${item.nameZh ? ` / ${item.nameZh}` : ""}`,
        categoryLabel: isZh
          ? category.nameZh ?? category.nameEn
          : category.nameEn,
      })),
    );
  }, [categories, isZh]);

  const itemChoicesByCategory = useMemo(() => {
    const map = new Map<string, ItemChoice[]>();
    itemChoices.forEach((item) => {
      const list = map.get(item.categoryLabel) ?? [];
      list.push(item);
      map.set(item.categoryLabel, list);
    });
    return map;
  }, [itemChoices]);

  useEffect(() => {
    let cancelled = false;

    async function load() {
      setLoading(true);
      setLoadError(null);
      try {
        const [menuRes, dailySpecialsRes] = await Promise.all([
          apiFetch<{ categories: AdminMenuCategoryDto[] }>("/admin/menu/full"),
          apiFetch<{ specials: DailySpecialDto[] }>(
            "/admin/menu/daily-specials",
          ),
        ]);
        if (cancelled) return;
        setCategories(menuRes.categories ?? []);
        setDailySpecialDrafts(
          buildDailySpecialDrafts(dailySpecialsRes.specials ?? []),
        );
      } catch (error) {
        console.error(error);
        setLoadError(
          isZh ? "加载每日特价失败，请稍后重试。" : "Failed to load daily specials.",
        );
      } finally {
        if (!cancelled) setLoading(false);
      }
    }

    void load();

    return () => {
      cancelled = true;
    };
  }, [isZh]);

  function updateDailySpecialDraft(
    weekday: number,
    index: number,
    patch: Partial<DailySpecialDraft>,
  ) {
    setDailySpecialDrafts((prev) => {
      const list = prev[weekday] ?? [];
      const next = list.map((entry, entryIndex) =>
        entryIndex === index ? { ...entry, ...patch } : entry,
      );
      return { ...prev, [weekday]: next };
    });
  }

  function addDailySpecialDraft(weekday: number) {
    setDailySpecialDrafts((prev) => ({
      ...prev,
      [weekday]: [...(prev[weekday] ?? []), createDailySpecialDraft(weekday)],
    }));
  }

  function removeDailySpecialDraft(weekday: number, index: number) {
    setDailySpecialDrafts((prev) => ({
      ...prev,
      [weekday]: (prev[weekday] ?? []).filter((_, i) => i !== index),
    }));
  }

  async function handleSave() {
    setSaveError(null);
    setSaving(true);

    try {
      const specialsPayload = DAILY_SPECIAL_WEEKDAYS.flatMap(({ value }) =>
        (dailySpecialDrafts[value] ?? [])
          .filter((entry) => entry.itemStableId.trim())
          .map((entry) => ({
            stableId: entry.stableId || null,
            weekday: entry.weekday,
            itemStableId: entry.itemStableId.trim(),
            pricingMode: entry.pricingMode,
            overridePriceCents: parseOptionalInt(entry.overridePriceCents),
            discountDeltaCents: parseOptionalInt(entry.discountDeltaCents),
            discountPercent: parseOptionalInt(entry.discountPercent),
            startDate: entry.startDate.trim() || null,
            endDate: entry.endDate.trim() || null,
            startMinutes: parseOptionalInt(entry.startMinutes),
            endMinutes: parseOptionalInt(entry.endMinutes),
            isEnabled: entry.isEnabled,
            sortOrder: parseOptionalInt(entry.sortOrder) ?? 0,
            disallowCoupons: true,
          })),
      );

      const response = await apiFetch<{ specials: DailySpecialDto[] }>(
        "/admin/menu/daily-specials/bulk",
        {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ specials: specialsPayload }),
        },
      );

      setDailySpecialDrafts(buildDailySpecialDrafts(response.specials ?? []));
    } catch (error) {
      console.error(error);
      setSaveError(
        error instanceof Error ? error.message : String(error),
      );
    } finally {
      setSaving(false);
    }
  }

  const activeDailySpecials = dailySpecialDrafts[activeWeekday] ?? [];

  return (
    <div className="mx-auto max-w-5xl space-y-6 p-6">
      <header className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.3em] text-slate-500">
            {isZh ? "运营" : "Admin"}
          </p>
          <h1 className="mt-2 text-2xl font-semibold text-slate-900">
            {isZh ? "每日特价" : "Daily specials"}
          </h1>
          <p className="mt-2 text-sm text-slate-600">
            {isZh
              ? "配置周一到周日的特价菜。特价只作用于主菜，选项加价不参与。"
              : "Configure Monday–Sunday specials. Specials apply to the main dish only; options remain full price."}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Link
            href={`/${locale}/admin`}
            className="rounded-md border border-slate-200 px-3 py-2 text-sm hover:bg-slate-50"
          >
            {isZh ? "返回后台" : "Back"}
          </Link>
          <button
            type="button"
            onClick={() => void handleSave()}
            disabled={saving}
            className="rounded-md bg-amber-600 px-3 py-2 text-sm text-white disabled:opacity-60"
          >
            {saving
              ? isZh
                ? "保存中…"
                : "Saving…"
              : isZh
                ? "保存特价设置"
                : "Save specials"}
          </button>
        </div>
      </header>

      {loading ? (
        <p className="text-sm text-slate-500">
          {isZh ? "加载中…" : "Loading…"}
        </p>
      ) : loadError ? (
        <div className="rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-700">
          {loadError}
        </div>
      ) : (
        <section className="rounded-2xl border border-amber-200 bg-amber-50/40 p-5 space-y-4">
          {saveError ? (
            <div className="rounded-lg border border-red-200 bg-red-50 p-3 text-xs text-red-700">
              {saveError}
            </div>
          ) : null}

          <div className="flex flex-wrap gap-2">
            {DAILY_SPECIAL_WEEKDAYS.map((day) => (
              <button
                key={day.value}
                type="button"
                onClick={() => setActiveWeekday(day.value)}
                className={`rounded-full px-4 py-1 text-sm font-medium ${
                  activeWeekday === day.value
                    ? "bg-amber-600 text-white"
                    : "bg-white text-amber-700 border border-amber-200"
                }`}
              >
                {isZh ? day.labelZh : day.labelEn}
              </button>
            ))}
          </div>

          {activeDailySpecials.length === 0 ? (
            <p className="text-xs text-slate-600">
              {isZh ? "暂无特价菜。" : "No specials yet."}
            </p>
          ) : (
            <div className="space-y-3">
              {activeDailySpecials.map((entry, index) => {
                const showOverride = entry.pricingMode === "OVERRIDE_PRICE";
                const showDelta = entry.pricingMode === "DISCOUNT_DELTA";
                const showPercent = entry.pricingMode === "DISCOUNT_PERCENT";

                return (
                  <div
                    key={`${entry.stableId ?? "new"}-${index}`}
                    className="rounded-lg border border-amber-200 bg-white p-3"
                  >
                    <div className="grid grid-cols-1 gap-3 md:grid-cols-6">
                      <label className="space-y-1 md:col-span-2">
                        <div className="text-xs text-slate-600">
                          {isZh ? "菜品" : "Menu item"}
                        </div>
                        <select
                          value={entry.itemStableId}
                          onChange={(event) =>
                            updateDailySpecialDraft(entry.weekday, index, {
                              itemStableId: event.target.value,
                            })
                          }
                          className="w-full rounded-md border border-slate-200 px-3 py-2 text-sm"
                        >
                          <option value="">
                            {isZh ? "选择菜品" : "Select item"}
                          </option>
                          {Array.from(itemChoicesByCategory.entries()).map(
                            ([categoryLabel, items]) => (
                              <optgroup
                                key={categoryLabel}
                                label={categoryLabel}
                              >
                                {items.map((item) => (
                                  <option
                                    key={item.stableId}
                                    value={item.stableId}
                                  >
                                    {item.label}
                                  </option>
                                ))}
                              </optgroup>
                            ),
                          )}
                        </select>
                      </label>

                      <label className="space-y-1">
                        <div className="text-xs text-slate-600">
                          {isZh ? "定价模式" : "Pricing"}
                        </div>
                        <select
                          value={entry.pricingMode}
                          onChange={(event) =>
                            updateDailySpecialDraft(entry.weekday, index, {
                              pricingMode: event.target.value as SpecialPricingMode,
                            })
                          }
                          className="w-full rounded-md border border-slate-200 px-3 py-2 text-sm"
                        >
                          <option value="OVERRIDE_PRICE">
                            {isZh ? "指定特价" : "Override price"}
                          </option>
                          <option value="DISCOUNT_DELTA">
                            {isZh ? "减固定金额" : "Discount delta"}
                          </option>
                          <option value="DISCOUNT_PERCENT">
                            {isZh ? "折扣百分比" : "Discount %"}
                          </option>
                        </select>
                      </label>

                      {showOverride ? (
                        <label className="space-y-1">
                          <div className="text-xs text-slate-600">
                            {isZh ? "特价 (分)" : "Special price (cents)"}
                          </div>
                          <input
                            value={entry.overridePriceCents}
                            onChange={(event) =>
                              updateDailySpecialDraft(entry.weekday, index, {
                                overridePriceCents: event.target.value,
                              })
                            }
                            className="w-full rounded-md border border-slate-200 px-3 py-2 text-sm"
                            inputMode="numeric"
                          />
                        </label>
                      ) : null}

                      {showDelta ? (
                        <label className="space-y-1">
                          <div className="text-xs text-slate-600">
                            {isZh ? "减免 (分)" : "Discount delta (cents)"}
                          </div>
                          <input
                            value={entry.discountDeltaCents}
                            onChange={(event) =>
                              updateDailySpecialDraft(entry.weekday, index, {
                                discountDeltaCents: event.target.value,
                              })
                            }
                            className="w-full rounded-md border border-slate-200 px-3 py-2 text-sm"
                            inputMode="numeric"
                          />
                        </label>
                      ) : null}

                      {showPercent ? (
                        <label className="space-y-1">
                          <div className="text-xs text-slate-600">
                            {isZh ? "折扣 (%)" : "Discount (%)"}
                          </div>
                          <input
                            value={entry.discountPercent}
                            onChange={(event) =>
                              updateDailySpecialDraft(entry.weekday, index, {
                                discountPercent: event.target.value,
                              })
                            }
                            className="w-full rounded-md border border-slate-200 px-3 py-2 text-sm"
                            inputMode="numeric"
                          />
                        </label>
                      ) : null}

                      <label className="space-y-1">
                        <div className="text-xs text-slate-600">
                          {isZh ? "排序" : "Sort"}
                        </div>
                        <input
                          value={entry.sortOrder}
                          onChange={(event) =>
                            updateDailySpecialDraft(entry.weekday, index, {
                              sortOrder: event.target.value,
                            })
                          }
                          className="w-full rounded-md border border-slate-200 px-3 py-2 text-sm"
                          inputMode="numeric"
                        />
                      </label>

                      <label className="flex items-center gap-2 text-xs text-slate-600">
                        <input
                          type="checkbox"
                          checked={entry.isEnabled}
                          onChange={(event) =>
                            updateDailySpecialDraft(entry.weekday, index, {
                              isEnabled: event.target.checked,
                            })
                          }
                        />
                        {isZh ? "启用" : "Enabled"}
                      </label>
                    </div>

                    <div className="mt-3 flex justify-end">
                      <button
                        type="button"
                        onClick={() =>
                          removeDailySpecialDraft(entry.weekday, index)
                        }
                        className="rounded-md border border-slate-200 px-3 py-1 text-xs text-slate-600 hover:bg-slate-50"
                      >
                        {isZh ? "移除" : "Remove"}
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
          )}

          <div>
            <button
              type="button"
              onClick={() => addDailySpecialDraft(activeWeekday)}
              className="rounded-md border border-amber-200 px-3 py-2 text-sm text-amber-700 hover:bg-amber-100"
            >
              {isZh ? "新增特价菜" : "Add special"}
            </button>
          </div>
        </section>
      )}
    </div>
  );
}
