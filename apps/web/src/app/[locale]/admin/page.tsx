// apps/web/src/app/[locale]/admin/page.tsx
"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { useParams } from "next/navigation";
import type { Locale } from "@/lib/order/shared";
import { apiFetch } from "@/lib/api-client";

// ========== 基本类型 ========== //

export type Holiday = {
  id: string;
  date: string;
  reason: string;
};

export type MenuOptionChoice = {
  stableId: string;
  templateGroupStableId: string;
  nameEn: string;
  nameZh?: string | null;
  priceDeltaCents: number;
  isAvailable: boolean;
  tempUnavailableUntil: string | null;
  sortOrder: number;
};

export type MenuOptionGroup = {
  itemStableId: string;
  templateGroupStableId: string;

  minSelect: number;
  maxSelect: number | null;
  sortOrder: number;
  isEnabled: boolean;

  template: {
    stableId: string;
    nameEn: string;
    nameZh?: string | null;
    isAvailable: boolean;
    tempUnavailableUntil: string | null;
    defaultMinSelect: number;
    defaultMaxSelect: number | null;
    options: MenuOptionChoice[];
  };
};

export type MenuItem = {
  stableId: string;
  categoryStableId: string;
  nameEn: string;
  nameZh?: string | null;
  basePriceCents: number;
  isAvailable: boolean;
  isVisible: boolean;
  tempUnavailableUntil: string | null;
  sortOrder: number;
  imageUrl?: string | null;
  ingredientsEn?: string | null;
  ingredientsZh?: string | null;
  optionGroups: MenuOptionGroup[];
};

export type MenuCategory = {
  stableId: string;
  sortOrder: number;
  nameEn: string;
  nameZh?: string | null;
  isActive: boolean;
  items: MenuItem[];
};

type FullMenuResponse = MenuCategory[];

// —— 和 /admin/hours 页保持一致的类型 —— //
type BusinessHourDto = {
  weekday: number; // 0=Sunday ... 6=Saturday
  openMinutes: number | null;
  closeMinutes: number | null;
  isClosed: boolean;
};

type BusinessConfigDto = {
  id: number;
  storeName: string | null;
  timezone: string;
  isTemporarilyClosed: boolean;
  temporaryCloseReason: string | null;
  deliveryBaseFeeCents: number;
  priorityPerKmCents: number;
  salesTaxRate: number;
};

type BusinessConfigResponse = {
  config: BusinessConfigDto;
  hours: BusinessHourDto[];
  holidays: Holiday[];
};

const WEEKDAY_LABELS_ZH = ["周日", "周一", "周二", "周三", "周四", "周五", "周六"];
const WEEKDAY_LABELS_EN = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];

function SectionCard({
  title,
  children,
  actions,
}: {
  title: string;
  children: React.ReactNode;
  actions?: React.ReactNode;
}) {
  return (
    <section className="space-y-4 rounded-2xl border bg-white/80 p-6 shadow-sm">
      <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
        <h2 className="text-xl font-semibold text-slate-900">{title}</h2>
        {actions}
      </div>
      {children}
    </section>
  );
}

function minutesToTimeString(mins: number | null | undefined): string {
  if (mins == null || Number.isNaN(mins)) return "";
  const hh = Math.floor(mins / 60);
  const mm = mins % 60;
  return `${hh.toString().padStart(2, "0")}:${mm.toString().padStart(2, "0")}`;
}

function formatMoneyDelta(cents: number): string {
  const v = (cents ?? 0) / 100;
  const abs = Math.abs(v).toFixed(2);
  if (v > 0) return `+$${abs}`;
  if (v < 0) return `-$${abs}`;
  return `$0.00`;
}

function effectiveAvailable(isAvailable: boolean, tempUntil: string | null): boolean {
  if (!isAvailable) return false;
  if (!tempUntil) return true;
  return new Date(tempUntil).getTime() <= Date.now();
}

function availabilityTone(isAvailable: boolean, tempUntil: string | null): "good" | "warn" | "off" {
  if (!isAvailable) return "off";
  if (tempUntil && !effectiveAvailable(true, tempUntil)) return "warn";
  return "good";
}

function availabilityLabel(isZh: boolean, isAvailable: boolean, tempUntil: string | null): string {
  if (!isAvailable) return isZh ? "下架" : "Off";
  if (tempUntil && !effectiveAvailable(true, tempUntil)) return isZh ? "今日下架" : "Off today";
  return isZh ? "上架" : "On";
}

function TonePill({
  tone,
  children,
}: {
  tone: "good" | "warn" | "off";
  children: React.ReactNode;
}) {
  const cls =
    tone === "good"
      ? "bg-emerald-50 text-emerald-700"
      : tone === "warn"
        ? "bg-amber-50 text-amber-700"
        : "bg-slate-100 text-slate-600";

  return <span className={`rounded-full px-3 py-1 text-xs font-medium ${cls}`}>{children}</span>;
}

export default function AdminDashboard() {
  const { locale } = useParams<{ locale: Locale }>();
  const isZh = locale === "zh";

  const [hours, setHours] = useState<BusinessHourDto[]>([]);
  const [holidays, setHolidays] = useState<Holiday[]>([]);
  const [hoursLoading, setHoursLoading] = useState(true);
  const [hoursError, setHoursError] = useState<string | null>(null);

  const weekdayLabels = useMemo(() => (isZh ? WEEKDAY_LABELS_ZH : WEEKDAY_LABELS_EN), [isZh]);

  const [menu, setMenu] = useState<FullMenuResponse>([]);
  const [menuLoading, setMenuLoading] = useState(true);
  const [menuError, setMenuError] = useState<string | null>(null);

  const { totalActiveItems, totalInactiveItems } = useMemo(() => {
    let active = 0;
    let inactive = 0;

    for (const category of menu) {
      for (const item of category.items) {
        const effectiveActive = category.isActive && item.isVisible && item.isAvailable;
        if (effectiveActive) active += 1;
        else inactive += 1;
      }
    }

    return { totalActiveItems: active, totalInactiveItems: inactive };
  }, [menu]);

  useEffect(() => {
    let cancelled = false;

    async function loadBusinessConfig() {
      setHoursLoading(true);
      setHoursError(null);
      try {
        const res = await apiFetch<BusinessConfigResponse>("/admin/business/config");
        if (cancelled) return;

        setHours([...res.hours].sort((a, b) => a.weekday - b.weekday));
        setHolidays((res.holidays ?? []).slice().sort((a, b) => a.date.localeCompare(b.date)));
      } catch (e) {
        console.error(e);
        if (!cancelled) {
          setHoursError(isZh ? "加载营业时间配置失败，请稍后重试。" : "Failed to load business configuration. Please try again.");
        }
      } finally {
        if (!cancelled) setHoursLoading(false);
      }
    }

    void loadBusinessConfig();
    return () => {
      cancelled = true;
    };
  }, [isZh]);

  async function reloadMenu(): Promise<void> {
    setMenuLoading(true);
    setMenuError(null);
    try {
      const res = await apiFetch<FullMenuResponse>("/admin/menu/full");

      const normalized = res
        .slice()
        .sort((a, b) => a.sortOrder - b.sortOrder)
        .map((category) => ({
          ...category,
          items: category.items
            .slice()
            .sort((a, b) => a.sortOrder - b.sortOrder)
            .map((item) => ({
              ...item,
              optionGroups: item.optionGroups
                .slice()
                .sort((a, b) => a.sortOrder - b.sortOrder)
                .map((group) => ({
                  ...group,
                  template: {
                    ...group.template,
                    options: group.template.options.slice().sort((a, b) => a.sortOrder - b.sortOrder),
                  },
                })),
            })),
        }));

      setMenu(normalized);
    } catch (e) {
      console.error(e);
      setMenuError(isZh ? "加载菜单失败，请稍后重试。" : "Failed to load menu. Please try again.");
    } finally {
      setMenuLoading(false);
    }
  }

  useEffect(() => {
    let cancelled = false;
    async function load() {
      try {
        await reloadMenu();
      } finally {
        if (cancelled) return;
      }
    }
    void load();
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isZh]);

  async function toggleCategory(categoryStableId: string): Promise<void> {
    const category = menu.find((c) => c.stableId === categoryStableId);
    if (!category) return;

    const nextIsActive = !category.isActive;

    try {
      const updated = await apiFetch<{ stableId: string; isActive: boolean }>(
        `/admin/menu/categories/${categoryStableId}`,
        {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ isActive: nextIsActive }),
        },
      );

      setMenu((prev) => prev.map((c) => (c.stableId === updated.stableId ? { ...c, isActive: updated.isActive } : c)));
    } catch (error) {
      console.error(error);
    }
  }

  async function toggleMenuItem(categoryStableId: string, itemStableId: string): Promise<void> {
    const category = menu.find((c) => c.stableId === categoryStableId);
    const item = category?.items.find((i) => i.stableId === itemStableId);
    if (!item) return;

    const nextMode = item.isAvailable ? "PERMANENT_OFF" : "ON";

    try {
      const updated = await apiFetch<{
        stableId: string;
        isAvailable: boolean;
        isVisible: boolean;
        tempUnavailableUntil: string | null;
      }>(`/admin/menu/items/${itemStableId}/availability`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ mode: nextMode }),
      });

      setMenu((prev) =>
        prev.map((c) =>
          c.stableId !== categoryStableId
            ? c
            : {
                ...c,
                items: c.items.map((i) =>
                  i.stableId === updated.stableId
                    ? {
                        ...i,
                        isAvailable: updated.isAvailable,
                        isVisible: updated.isVisible,
                        tempUnavailableUntil: updated.tempUnavailableUntil,
                      }
                    : i,
                ),
              },
        ),
      );
    } catch (error) {
      console.error(error);
    }
  }

  async function toggleTemplateGroup(templateGroupStableId: string, currentlyOn: boolean): Promise<void> {
    const nextMode = currentlyOn ? "PERMANENT_OFF" : "ON";
    try {
      await apiFetch(`/admin/menu/option-group-templates/${templateGroupStableId}/availability`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ mode: nextMode }),
      });
      await reloadMenu();
    } catch (e) {
      console.error(e);
    }
  }

  async function toggleOption(optionStableId: string, currentlyOn: boolean): Promise<void> {
    const nextMode = currentlyOn ? "PERMANENT_OFF" : "ON";
    try {
      await apiFetch(`/admin/menu/options/${optionStableId}/availability`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ mode: nextMode }),
      });
      await reloadMenu();
    } catch (e) {
      console.error(e);
    }
  }

  return (
    <div className="space-y-8">
      <div>
        <p className="text-sm font-semibold uppercase tracking-[0.3em] text-slate-500">Admin</p>
        <h1 className="mt-2 text-3xl font-semibold text-slate-900">运营管理控制台</h1>
        <p className="mt-2 max-w-3xl text-sm text-slate-600">
          管理营业时间、节假日休假、菜单、餐品选项、上下架状态和其他日常运营事项。
          这里展示的是当前生效配置，详细编辑请进入对应功能页。
        </p>
      </div>

      <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
        <div className="rounded-2xl border bg-white/80 p-5 shadow-sm">
          <p className="text-sm text-slate-500">活跃餐品</p>
          <p className="mt-2 text-3xl font-semibold text-emerald-600">{menuLoading ? "…" : totalActiveItems}</p>
        </div>
        <div className="rounded-2xl border bg-white/80 p-5 shadow-sm">
          <p className="text-sm text-slate-500">下架餐品</p>
          <p className="mt-2 text-3xl font-semibold text-amber-600">{menuLoading ? "…" : totalInactiveItems}</p>
        </div>
        <div className="rounded-2xl border bg-white/80 p-5 shadow-sm">
          <p className="text-sm text-slate-500">计划休假</p>
          <p className="mt-2 text-3xl font-semibold text-slate-900">{hoursLoading ? "…" : holidays.length}</p>
        </div>
      </div>

      <SectionCard
        title="营业时间设置"
        actions={
          <Link href={`/${locale}/admin/hours`} className="text-xs font-medium text-emerald-700 hover:text-emerald-600">
            {isZh ? "详细编辑营业时间" : "Edit hours in detail"}
          </Link>
        }
      >
        {hoursLoading ? (
          <p className="text-sm text-slate-500">{isZh ? "营业时间加载中…" : "Loading business hours…"}</p>
        ) : hoursError ? (
          <p className="text-sm text-red-600">{hoursError}</p>
        ) : hours.length === 0 ? (
          <p className="text-sm text-slate-500">{isZh ? "暂无营业时间配置。" : "No business hours configured."}</p>
        ) : (
          <div className="grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-3">
            {hours.map((h) => (
              <div key={h.weekday} className="rounded-xl border p-4 shadow-sm">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-sm font-semibold text-slate-900">{weekdayLabels[h.weekday] ?? h.weekday}</p>
                    <p className="text-xs text-slate-500">{isZh ? "营业时间 / 休息" : "Open hours / Closed"}</p>
                  </div>
                  <span
                    className={`rounded-full px-3 py-1 text-xs font-medium ${
                      h.isClosed ? "bg-slate-100 text-slate-600" : "bg-emerald-50 text-emerald-700"
                    }`}
                  >
                    {h.isClosed ? (isZh ? "休息" : "Closed") : isZh ? "营业" : "Open"}
                  </span>
                </div>

                <div className="mt-4 text-sm text-slate-800">
                  {h.isClosed ? (
                    <span className="text-xs text-slate-500">{isZh ? "当天不营业" : "Closed this day"}</span>
                  ) : (
                    <span>
                      {minutesToTimeString(h.openMinutes)} - {minutesToTimeString(h.closeMinutes)}
                    </span>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}
      </SectionCard>

      <SectionCard
        title="节假日与临时休假"
        actions={
          <Link href={`/${locale}/admin/hours`} className="text-xs font-medium text-emerald-700 hover:text-emerald-600">
            {isZh ? "在营业时间页管理节假日" : "Manage holidays on hours page"}
          </Link>
        }
      >
        {hoursLoading ? (
          <p className="text-sm text-slate-500">{isZh ? "节假日加载中…" : "Loading holidays…"}</p>
        ) : holidays.length === 0 ? (
          <p className="text-sm text-slate-500">{isZh ? "暂无休假计划。" : "No holidays planned."}</p>
        ) : (
          <div className="divide-y rounded-xl border">
            {holidays.map((holiday) => (
              <div key={holiday.id} className="flex flex-col gap-1 px-4 py-3 sm:flex-row sm:items-center sm:justify-between">
                <div>
                  <p className="font-medium text-slate-900">{holiday.date}</p>
                  {holiday.reason ? <p className="text-sm text-slate-500">{holiday.reason}</p> : null}
                </div>
              </div>
            ))}
          </div>
        )}
      </SectionCard>

      <SectionCard title="菜单与上下架管理">
        {menuLoading ? (
          <p className="text-sm text-slate-500">{isZh ? "菜单加载中…" : "Loading menu…"}</p>
        ) : menuError ? (
          <p className="text-sm text-red-600">{menuError}</p>
        ) : menu.length === 0 ? (
          <p className="text-sm text-slate-500">{isZh ? "暂无菜单数据。" : "No menu configured yet."}</p>
        ) : (
          <div className="space-y-4">
            {menu.map((category) => {
              const categoryName = isZh && category.nameZh ? category.nameZh : category.nameEn;

              return (
                <div key={category.stableId} className="rounded-xl border p-4 shadow-sm">
                  <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                    <div>
                      <p className="text-base font-semibold text-slate-900">{categoryName}</p>
                      <p className="text-xs text-slate-500">
                        状态：{category.isActive ? "在售" : "下架"} · {category.items.length} 款餐品
                      </p>
                    </div>

                    <button
                      onClick={() => void toggleCategory(category.stableId)}
                      className={`rounded-full px-3 py-1 text-xs font-medium ${
                        category.isActive ? "bg-emerald-50 text-emerald-700" : "bg-slate-100 text-slate-600"
                      }`}
                      type="button"
                    >
                      {category.isActive ? "在售" : "下架"}
                    </button>
                  </div>

                  <div className="mt-3 space-y-3">
                    {category.items.map((item) => {
                      const itemName = isZh && item.nameZh ? item.nameZh : item.nameEn;
                      const price = item.basePriceCents / 100;
                      const effectiveActive = category.isActive && item.isVisible && item.isAvailable;

                      return (
                        <div key={item.stableId} className="rounded-lg border p-3">
                          <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                            <div>
                              <p className="font-medium text-slate-900">{itemName}</p>
                              <p className="text-sm text-slate-500">${price.toFixed(2)}</p>
                            </div>

                            <button
                              onClick={() => void toggleMenuItem(category.stableId, item.stableId)}
                              className={`rounded-full px-3 py-1 text-xs font-medium ${
                                effectiveActive ? "bg-emerald-50 text-emerald-700" : "bg-amber-50 text-amber-700"
                              }`}
                              type="button"
                            >
                              {effectiveActive ? "在售" : "下架"}
                            </button>
                          </div>

                          {item.optionGroups.length > 0 ? (
                            <div className="mt-3 space-y-2">
                              {item.optionGroups.map((group) => {
                                const tg = group.template;
                                const groupName = isZh && tg.nameZh ? tg.nameZh : tg.nameEn;

                                const groupOn = effectiveAvailable(tg.isAvailable, tg.tempUnavailableUntil);
                                const groupTone = availabilityTone(tg.isAvailable, tg.tempUnavailableUntil);

                                return (
                                  <div key={tg.stableId} className="rounded-lg border bg-slate-50 p-3">
                                    <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
                                      <div className="min-w-0">
                                        <div className="flex items-center gap-2">
                                          <p className="truncate text-sm font-semibold text-slate-900">{groupName}</p>
                                          <TonePill tone={groupTone}>
                                            {availabilityLabel(isZh, tg.isAvailable, tg.tempUnavailableUntil)}
                                          </TonePill>
                                        </div>
                                        <p className="mt-1 text-xs text-slate-500">
                                          {isZh ? "组选项上下架为全局生效（模板组）" : "Group availability is global (template group)."}
                                        </p>
                                      </div>

                                      <button
                                        type="button"
                                        onClick={() => void toggleTemplateGroup(tg.stableId, groupOn)}
                                        className={`rounded-full px-3 py-1 text-xs font-medium ${
                                          groupOn
                                            ? "bg-emerald-50 text-emerald-700 hover:bg-emerald-100"
                                            : "bg-slate-100 text-slate-700 hover:bg-slate-200"
                                        }`}
                                      >
                                        {groupOn ? (isZh ? "下架该组选项" : "Turn off group") : isZh ? "上架该组选项" : "Turn on group"}
                                      </button>
                                    </div>

                                    {tg.options.length === 0 ? (
                                      <p className="mt-2 text-xs text-slate-500">{isZh ? "该组选项暂无子选项。" : "No choices in this group."}</p>
                                    ) : (
                                      <div className="mt-3 divide-y rounded-md border bg-white">
                                        {tg.options.map((opt) => {
                                          const optName = isZh && opt.nameZh ? opt.nameZh : opt.nameEn;
                                          const optOn = effectiveAvailable(opt.isAvailable, opt.tempUnavailableUntil);
                                          const optTone = availabilityTone(opt.isAvailable, opt.tempUnavailableUntil);

                                          return (
                                            <div
                                              key={opt.stableId}
                                              className="flex flex-col gap-2 px-3 py-2 sm:flex-row sm:items-center sm:justify-between"
                                            >
                                              <div className="min-w-0">
                                                <div className="flex items-center gap-2">
                                                  <p className="truncate text-sm font-medium text-slate-900">{optName}</p>
                                                  <TonePill tone={optTone}>
                                                    {availabilityLabel(isZh, opt.isAvailable, opt.tempUnavailableUntil)}
                                                  </TonePill>
                                                </div>
                                                <p className="mt-1 text-xs text-slate-500">
                                                  {isZh ? "加价" : "Delta"}: {formatMoneyDelta(opt.priceDeltaCents)}
                                                </p>
                                              </div>

                                              <button
                                                type="button"
                                                onClick={() => void toggleOption(opt.stableId, optOn)}
                                                className={`rounded-full px-3 py-1 text-xs font-medium ${
                                                  optOn
                                                    ? "bg-emerald-50 text-emerald-700 hover:bg-emerald-100"
                                                    : "bg-slate-100 text-slate-700 hover:bg-slate-200"
                                                }`}
                                              >
                                                {optOn ? (isZh ? "下架" : "Off") : isZh ? "上架" : "On"}
                                              </button>
                                            </div>
                                          );
                                        })}
                                      </div>
                                    )}
                                  </div>
                                );
                              })}
                            </div>
                          ) : (
                            <p className="mt-2 text-xs text-slate-500">{isZh ? "此餐品暂无选项。" : "No options for this item."}</p>
                          )}
                        </div>
                      );
                    })}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </SectionCard>

      <SectionCard title="门店服务与其他功能">
        <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
          <div className="rounded-xl border p-4">
            <p className="text-sm font-semibold text-slate-900">配送 / 自取</p>
            <p className="mt-2 text-sm text-slate-500">控制是否接收线上配送与到店自取订单，适用于恶劣天气、门店维护等场景。</p>
            <div className="mt-3 flex gap-2">
              <button className="flex-1 rounded-md border bg-emerald-50 px-3 py-2 text-sm font-medium text-emerald-700" type="button">
                开启
              </button>
              <button className="flex-1 rounded-md border px-3 py-2 text-sm font-medium text-slate-600" type="button">
                暂停
              </button>
            </div>
          </div>

          <div className="rounded-xl border p-4">
            <p className="text-sm font-semibold text-slate-900">运营公告</p>
            <p className="mt-2 text-sm text-slate-500">设置首页公告栏，用于提示节假日营业安排、价格调整或新品上线。</p>
            <div className="mt-3">
              <textarea className="w-full rounded-md border px-3 py-2 text-sm" rows={3} defaultValue="本周末 18:00 提前打烊，线上订单截止 17:30。" />
              <div className="mt-2 flex justify-end">
                <button className="rounded-md border bg-slate-900 px-4 py-2 text-sm font-semibold text-white" type="button">
                  保存公告
                </button>
              </div>
            </div>
          </div>
        </div>
      </SectionCard>
    </div>
  );
}
