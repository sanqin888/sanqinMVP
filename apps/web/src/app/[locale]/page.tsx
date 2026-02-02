// apps/web/src/app/[locale]/page.tsx
"use client";

import Image from "next/image";
import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";
import { useRouter, useSearchParams, useParams } from "next/navigation";
import {
  HOSTED_CHECKOUT_CURRENCY,
  SelectedOptionSnapshot,
} from "@/lib/order/shared";
import type { Locale } from "@/lib/i18n/locales";
import { UI_STRINGS } from "@/lib/i18n/dictionaries";
import {
  buildLocalizedDailySpecials,
  buildLocalizedEntitlementItems,
  buildLocalizedMenuFromDb,
  type LocalizedDailySpecial,
  type LocalizedMenuItem,
  type PublicMenuCategory,
} from "@/lib/menu/menu-transformer";
import type {
  MenuEntitlementsResponse,
  PublicMenuResponse as PublicMenuApiResponse,
  MenuOptionGroupWithOptionsDto,
  OptionChoiceDto,
} from "@shared/menu";
import { usePersistentCart } from "@/lib/cart";
import { apiFetch } from "@/lib/api/client";
import { signOut, useSession } from "@/lib/auth-session";

type StoreStatus = {
  publicNotice: string | null;
  publicNoticeEn: string | null;
  today: {
    isClosed: boolean;
    openMinutes: number | null;
    closeMinutes: number | null;
  };
};

export default function LocalOrderPage() {
  const params = useParams<{ locale?: string }>();
  const locale = (params?.locale === "zh" ? "zh" : "en") as Locale;

  const router = useRouter();
  const searchParams = useSearchParams();
  const q = searchParams?.toString();

  const { data: session } = useSession();
  const isMemberLoggedIn = Boolean(session?.user?.userStableId);
  const memberName = session?.user?.email ?? null;

  const strings = UI_STRINGS[locale];

  // —— 菜单：从后端 public API 读取 —— //
  const [menu, setMenu] = useState<PublicMenuCategory[]>([]);
  const [menuLoading, setMenuLoading] = useState(true);
  const [menuError, setMenuError] = useState<string | null>(null);
  const [dailySpecials, setDailySpecials] = useState<LocalizedDailySpecial[]>(
    [],
  );
  const [cartNotice] = useState<string | null>(null);
  const [entitlements, setEntitlements] =
    useState<MenuEntitlementsResponse | null>(null);
  const [entitlementsError, setEntitlementsError] = useState<string | null>(
    null,
  );
  const [storeStatus, setStoreStatus] = useState<StoreStatus | null>(null);
  const [storeStatusLoading, setStoreStatusLoading] = useState(true);
  const [storeStatusError, setStoreStatusError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;

    async function loadMenu() {
      setMenuLoading(true);
      setMenuError(null);

      try {
        const dbMenu = await apiFetch<PublicMenuApiResponse>("/menu/public", {
          cache: "no-store",
        });
        if (cancelled) return;

        const localized = buildLocalizedMenuFromDb(
          dbMenu.categories ?? [],
          locale,
        );
        setMenu(localized);
        setDailySpecials(
          buildLocalizedDailySpecials(
            dbMenu.dailySpecials ?? [],
            localized,
            locale,
          ),
        );
      } catch (err) {
        console.error(err);
        if (cancelled) return;

        setMenu([]);
        setDailySpecials([]);
        setMenuError(
          locale === "zh"
            ? "菜单从服务器加载失败，请稍后重试或联系门店。"
            : "Failed to load menu from server. Please try again later or contact the store.",
        );
      } finally {
        if (!cancelled) {
          setMenuLoading(false);
        }
      }
    }

    void loadMenu();

    return () => {
      cancelled = true;
    };
  }, [locale]);

  useEffect(() => {
    let cancelled = false;

    async function loadEntitlements() {
      if (!isMemberLoggedIn) {
        setEntitlements(null);
        setEntitlementsError(null);
        return;
      }

      try {
        const data = await apiFetch<MenuEntitlementsResponse>(
          "/promotions/entitlements",
          {
            cache: "no-store",
          },
        );
        if (cancelled) return;
        setEntitlements(data);
        setEntitlementsError(null);
      } catch (err) {
        console.error(err);
        if (cancelled) return;
        setEntitlements(null);
        setEntitlementsError(
          locale === "zh"
            ? "专享套餐加载失败，请稍后重试。"
            : "Failed to load member exclusives. Please try again later.",
        );
      }
    }

    void loadEntitlements();

    return () => {
      cancelled = true;
    };
  }, [isMemberLoggedIn, locale]);

  useEffect(() => {
    let cancelled = false;

    async function loadStoreStatus() {
      setStoreStatusLoading(true);
      setStoreStatusError(null);
      try {
        const data = await apiFetch<StoreStatus>("/public/store-status", {
          cache: "no-store",
        });
        if (cancelled) return;
        setStoreStatus(data);
      } catch (err) {
        console.error(err);
        if (cancelled) return;
        setStoreStatus(null);
        setStoreStatusError(
          locale === "zh"
            ? "营业时间加载失败，请稍后重试。"
            : "Failed to load store hours. Please try again later.",
        );
      } finally {
        if (!cancelled) {
          setStoreStatusLoading(false);
        }
      }
    }

    void loadStoreStatus();

    return () => {
      cancelled = true;
    };
  }, [locale]);

  const { addItem, totalQuantity, items: cartItems, removeItemsByStableId } =
    usePersistentCart();
  const [activeItem, setActiveItem] = useState<LocalizedMenuItem | null>(null);
  const [selectedQuantity, setSelectedQuantity] = useState(1);

  // 选中的选项：Record<PathKey, OptionStableId[]>
  const [selectedOptions, setSelectedOptions] = useState<
    Record<string, string[]>
  >({});

  // 子选项：Record<ParentOptionPathKey, ChildOptionStableId[]>
  const [selectedChildOptions, setSelectedChildOptions] = useState<
    Record<string, string[]>
  >({});

  const entitlementItems = useMemo(
    () =>
      buildLocalizedEntitlementItems(
        entitlements?.unlockedItems ?? [],
        locale,
      ),
    [entitlements, locale],
  );

  const mergedMenu = useMemo(() => {
    if (entitlementItems.length === 0) return menu;
    return [
      {
        stableId: "exclusive-combos",
        name: locale === "zh" ? "专享套餐" : "Exclusive combos",
        items: entitlementItems,
      },
      ...menu,
    ];
  }, [entitlementItems, locale, menu]);

  // Map: ID -> Item
  const menuItemMap = useMemo(
    () =>
      new Map(
        mergedMenu.flatMap((category) =>
          category.items.map((item) => [item.stableId, item]),
        ),
      ),
    [mergedMenu],
  );

  // Map: Name -> Item (Fallback)
  const menuItemMapByName = useMemo(() => {
    const map = new Map<string, LocalizedMenuItem>();
    mergedMenu.forEach((category) => {
      category.items.forEach((item) => {
        if (item.name) map.set(item.name.trim(), item);
        // 同时建立中英文映射，增加匹配几率
        if (item.nameEn) map.set(item.nameEn.trim(), item);
        if (item.nameZh) map.set(item.nameZh.trim(), item);
      });
    });
    return map;
  }, [mergedMenu]);

  // ✅ 核心辅助函数：查找选项关联的餐品
  // 优先级 1: targetItemStableId (最准确)
  // 优先级 2: Name matching (回退方案)
  const resolveLinkedItem = useCallback(
    (option: OptionChoiceDto): LocalizedMenuItem | undefined => {
      // 1. Try by ID
      if (option.targetItemStableId) {
        const byId = menuItemMap.get(option.targetItemStableId);
        if (byId) return byId;
      }

      // 2. Try by Name (Localized)
      const nameKey =
        locale === "zh" && option.nameZh ? option.nameZh : option.nameEn;
      if (nameKey) {
        const byName = menuItemMapByName.get(nameKey.trim());
        if (byName) return byName;
      }

      return undefined;
    },
    [locale, menuItemMap, menuItemMapByName],
  );

  const buildPathKey = useCallback((segments: string[]) => segments.join("__"), []);

  const buildGroupSegment = useCallback(
    (group: MenuOptionGroupWithOptionsDto, index: number) =>
      group.bindingStableId ?? `${group.templateGroupStableId}-${index}`,
    [],
  );

  const buildOptionSegment = useCallback(
    (option: OptionChoiceDto) => `option-${option.optionStableId}`,
    [],
  );

  const buildOptionPathKey = useCallback(
    (groupPathKey: string, optionStableId: string) =>
      `${groupPathKey}__option-${optionStableId}`,
    [],
  );

  useEffect(() => {
    if (cartItems.length === 0) return;
    if (menuLoading || menu.length === 0 || menuError) return;
    if (isMemberLoggedIn && !entitlements && !entitlementsError) return;
    const allowedStableIds = new Set(
      menu.flatMap((category) =>
        category.items.map((item) => item.stableId),
      ),
    );
    entitlementItems.forEach((item) => allowedStableIds.add(item.stableId));

    const invalidItems = cartItems.filter(
      (item) => !allowedStableIds.has(item.productStableId),
    );
    if (invalidItems.length === 0) return;

    removeItemsByStableId(
      invalidItems.map((item) => item.productStableId),
    );
  }, [
    cartItems,
    entitlements,
    entitlementsError,
    entitlementItems,
    isMemberLoggedIn,
    menu,
    menuError,
    menuLoading,
    removeItemsByStableId,
  ]);

  const closeOptionsModal = () => {
    setActiveItem(null);
    setSelectedOptions({});
    setSelectedChildOptions({});
    setSelectedQuantity(1);
  };

  const handleOptionToggle = (
    groupPathKey: string,
    optionStableId: string,
    minSelect: number,
    maxSelect: number | null,
  ) => {
    let removedParentKeys: string[] = [];
    setSelectedOptions((prev) => {
      const current = new Set(prev[groupPathKey] ?? []);

      if (maxSelect === 1) {
        if (current.has(optionStableId)) {
          if (minSelect > 0) {
            return prev;
          }
          removedParentKeys = [buildOptionPathKey(groupPathKey, optionStableId)];
          const next = { ...prev };
          delete next[groupPathKey];
          return next;
        }
        removedParentKeys = Array.from(current).map((id) =>
          buildOptionPathKey(groupPathKey, id),
        );
        return { ...prev, [groupPathKey]: [optionStableId] };
      }

      if (current.has(optionStableId)) {
        current.delete(optionStableId);
        removedParentKeys = [buildOptionPathKey(groupPathKey, optionStableId)];
      } else {
        if (typeof maxSelect === "number" && current.size >= maxSelect) {
          return prev;
        }
        current.add(optionStableId);
      }

      if (current.size === 0) {
        const next = { ...prev };
        delete next[groupPathKey];
        return next;
      }

      return { ...prev, [groupPathKey]: Array.from(current) };
    });

    if (removedParentKeys.length > 0) {
      setSelectedChildOptions((prev) => {
        const next = { ...prev };
        removedParentKeys.forEach((parentKey) => {
          delete next[parentKey];
        });
        return next;
      });
    }
  };

  const handleChildOptionToggle = (
    parentOptionPathKey: string,
    childOptionStableId: string,
  ) => {
    setSelectedChildOptions((prev) => {
      const current = new Set(prev[parentOptionPathKey] ?? []);
      if (current.has(childOptionStableId)) {
        current.delete(childOptionStableId);
      } else {
        current.add(childOptionStableId);
      }
      if (current.size === 0) {
        const next = { ...prev };
        delete next[parentOptionPathKey];
        return next;
      }
      return { ...prev, [parentOptionPathKey]: Array.from(current) };
    });
  };

  const collectActiveGroups = useCallback(
    (
      item: LocalizedMenuItem,
      basePath: string[],
      visited: Set<string>,
    ): Array<{ group: MenuOptionGroupWithOptionsDto; path: string[] }> => {
      const groups = item.optionGroups ?? [];
      const collected: Array<{
        group: MenuOptionGroupWithOptionsDto;
        path: string[];
      }> = [];

      groups.forEach((group, groupIndex) => {
        const groupPath = [...basePath, buildGroupSegment(group, groupIndex)];
        const groupKey = buildPathKey(groupPath);
        if (visited.has(groupKey)) return;
        visited.add(groupKey);
        collected.push({ group, path: groupPath });

        const selectedIds = selectedOptions[groupKey] ?? [];
        if (selectedIds.length === 0) return;

        group.options.forEach((option) => {
          if (!selectedIds.includes(option.optionStableId)) return;
          const linkedItem = resolveLinkedItem(option);
          if (!linkedItem?.optionGroups?.length) return;
          const optionPath = [...groupPath, buildOptionSegment(option)];
          collected.push(
            ...collectActiveGroups(linkedItem, optionPath, visited),
          );
        });
      });

      return collected;
    },
    [
      buildGroupSegment,
      buildOptionSegment,
      buildPathKey,
      resolveLinkedItem,
      selectedOptions,
    ],
  );

  const activeOptionGroups = useMemo(() => {
    if (!activeItem) return [];
    return collectActiveGroups(
      activeItem,
      ["root", activeItem.stableId],
      new Set<string>(),
    );
  }, [activeItem, collectActiveGroups]);

  // 更新：使用 activeOptionGroups 来计算缺失的必选项
  const requiredGroupsMissing = useMemo(() => {
    return activeOptionGroups.filter(({ group, path }) => {
      const selectedCount = selectedOptions[buildPathKey(path)]?.length;
      return group.minSelect > 0 && (selectedCount ?? 0) < group.minSelect;
    });
  }, [activeOptionGroups, buildPathKey, selectedOptions]);

  // 更新：使用 activeOptionGroups 来计算价格和详情
  const selectedOptionsDetails = useMemo(() => {
    const details: Array<{
      groupName: string;
      optionName: string;
      priceDeltaCents: number;
    }> = [];
    
    activeOptionGroups.forEach(({ group, path }) => {
      const groupKey = buildPathKey(path);
      const selectedIds = selectedOptions[groupKey] ?? [];
      const optionById = new Map(
        group.options.map((option) => [option.optionStableId, option]),
      );
      const groupName =
        locale === "zh" && group.template.nameZh
          ? group.template.nameZh
          : group.template.nameEn;
      selectedIds.forEach((optionId) => {
        const option = optionById.get(optionId);
        if (!option) return;
        const optionName =
          locale === "zh" && option.nameZh ? option.nameZh : option.nameEn;
        details.push({
          groupName,
          optionName,
          priceDeltaCents: option.priceDeltaCents,
        });
      });

      selectedIds.forEach((optionId) => {
        const parentPathKey = buildOptionPathKey(groupKey, optionId);
        const childSelectedIds = selectedChildOptions[parentPathKey] ?? [];
        childSelectedIds.forEach((childId) => {
          const childOption = optionById.get(childId);
          if (!childOption) return;
          const optionName =
            locale === "zh" && childOption.nameZh
              ? childOption.nameZh
              : childOption.nameEn;
          details.push({
            groupName,
            optionName,
            priceDeltaCents: childOption.priceDeltaCents,
          });
        });
      });
    });
    return details;
  }, [
    activeOptionGroups,
    buildOptionPathKey,
    buildPathKey,
    locale,
    selectedChildOptions,
    selectedOptions,
  ]);

  const optionsPriceCents = useMemo(
    () =>
      selectedOptionsDetails.reduce(
        (sum, option) => sum + option.priceDeltaCents,
        0,
      ),
    [selectedOptionsDetails],
  );

  const optionSnapshotLookup = useMemo(() => {
  const lookup = new Map<string, SelectedOptionSnapshot>();

  // ✅ 用递归收集到的所有 active groups（包含套餐嵌套组选项）
  activeOptionGroups.forEach(({ group }) => {
    group.options.forEach((option) => {
      const name =
        locale === "zh" && option.nameZh ? option.nameZh : option.nameEn;

      lookup.set(option.optionStableId, {
        id: option.optionStableId,
        name: name ?? "",
        priceDeltaCents: option.priceDeltaCents ?? 0,
      });
    });
  });

  return lookup;
 }, [activeOptionGroups, locale]);

  const buildOptionSnapshots = useCallback(
    (selections: Record<string, string[]>): Record<string, SelectedOptionSnapshot[]> =>
      Object.fromEntries(
        Object.entries(selections).map(([groupKey, optionIds]) => [
          groupKey,
          optionIds.map((optionId) => {
            const snapshot = optionSnapshotLookup.get(optionId);
            return snapshot ?? { id: optionId, name: "", priceDeltaCents: 0 };
          }),
        ]),
      ),
    [optionSnapshotLookup],
  );

  const canAddToCart =
    activeItem && requiredGroupsMissing.length === 0 && menuLoading === false;

  const currencyFormatter = useMemo(
    () =>
      new Intl.NumberFormat(locale === "zh" ? "zh-Hans-CA" : "en-CA", {
        style: "currency",
        currency: HOSTED_CHECKOUT_CURRENCY,
        minimumFractionDigits: 2,
        maximumFractionDigits: 2,
      }),
    [locale],
  );

  // ... (保持 checkoutHref, membershipHref 等逻辑不变)
  const checkoutHref = q ? `/${locale}/checkout?${q}` : `/${locale}/checkout`;
  const orderHref = q ? `/${locale}?${q}` : `/${locale}`;
  const membershipHref = isMemberLoggedIn
    ? `/${locale}/membership`
    : `/${locale}/membership/login?redirect=${encodeURIComponent(orderHref)}`;
  const membershipLabel = locale === "zh" 
    ? (isMemberLoggedIn ? (memberName ? `会员中心（${memberName}）` : "会员中心") : "会员登录 / 注册")
    : (isMemberLoggedIn ? (memberName ? `Member center (${memberName})` : "Member center") : "Member login / sign up");
  const logoutLabel = locale === "zh" ? "退出登录" : "Log out";
  
  const handleLogout = () => {
    void signOut().then(() => router.push(`/${locale}`));
  };

  const isTempUnavailable = (tempUnavailableUntil?: string | null) => {
    if (!tempUnavailableUntil) return false;
    const parsed = Date.parse(tempUnavailableUntil);
    if (!Number.isFinite(parsed)) return false;
    return parsed > Date.now();
  };

  const formatMinutes = (mins: number | null | undefined) => {
    if (mins == null || Number.isNaN(mins)) return "";
    const hours = Math.floor(mins / 60);
    const minutes = mins % 60;
    return `${hours.toString().padStart(2, "0")}:${minutes
      .toString()
      .padStart(2, "0")}`;
  };

  const hoursValue = (() => {
    if (storeStatusLoading) return locale === "zh" ? "加载中…" : "Loading…";
    if (storeStatusError || !storeStatus) return locale === "zh" ? "暂无法获取" : "Unavailable";
    if (storeStatus.today.isClosed || storeStatus.today.openMinutes == null || storeStatus.today.closeMinutes == null) {
      return locale === "zh" ? "休息" : "Closed";
    }
    return `${formatMinutes(storeStatus.today.openMinutes)}-${formatMinutes(storeStatus.today.closeMinutes)}`;
  })();

  const publicNoticeText = locale === "zh"
      ? storeStatus?.publicNotice?.trim() ?? ""
      : storeStatus?.publicNoticeEn?.trim() ?? storeStatus?.publicNotice?.trim() ?? "";

  const renderOptionGroup = (
    group: MenuOptionGroupWithOptionsDto,
    basePath: string[],
    groupIndex: number,
  ) => {
    const groupPath = [...basePath, buildGroupSegment(group, groupIndex)];
    const groupKey = buildPathKey(groupPath);
    const selectedCount = selectedOptions[groupKey]?.length ?? 0;
    
    const requirementLabel = (() => {
        if (group.minSelect > 0 && group.maxSelect === 1) return locale === "zh" ? "必选 1 项" : "Required: 1";
        if (group.minSelect > 0 && group.maxSelect) return locale === "zh" ? `必选 ${group.minSelect}-${group.maxSelect} 项` : `Required: ${group.minSelect}-${group.maxSelect}`;
        if (group.minSelect > 0) return locale === "zh" ? `至少选择 ${group.minSelect} 项` : `Pick at least ${group.minSelect}`;
        if (group.maxSelect) return locale === "zh" ? `最多选择 ${group.maxSelect} 项` : `Up to ${group.maxSelect}`;
        return locale === "zh" ? "可选" : "Optional";
    })();

    return (
        <div key={groupKey} className="space-y-3">
            <div className="flex items-center justify-between gap-4">
            <div>
                <h4 className="text-base font-semibold text-slate-900">
                {locale === "zh" && group.template.nameZh ? group.template.nameZh : group.template.nameEn}
                </h4>
                <p className="text-xs text-slate-500">{requirementLabel}</p>
            </div>
            <span className={`text-xs font-semibold ${group.minSelect > 0 && selectedCount < group.minSelect ? "text-rose-500" : "text-slate-400"}`}>
                {locale === "zh" ? `已选 ${selectedCount}` : `${selectedCount} selected`}
            </span>
            </div>

            <div className="grid gap-2 md:grid-cols-2">
            {group.options
              .filter(
                (option) =>
                  !option.parentOptionStableIds ||
                  option.parentOptionStableIds.length === 0,
              )
              .map((option) => {
                // 使用 groupKey 检查选中状态
                const selected =
                  selectedOptions[groupKey]?.includes(option.optionStableId) ??
                  false;
                const optionTempUnavailable = isTempUnavailable(
                  option.tempUnavailableUntil,
                );
                const optionLabel =
                  locale === "zh" && option.nameZh ? option.nameZh : option.nameEn;

                // 使用增强后的查找逻辑
                const linkedItem = resolveLinkedItem(option);

                const childOptions = (option.childOptionStableIds ?? [])
                  .map((childId) =>
                    group.options.find(
                      (child) => child.optionStableId === childId,
                    ),
                  )
                  .filter(
                    (childOption): childOption is NonNullable<
                      typeof childOption
                    > => Boolean(childOption),
                  );

                const parentOptionPathKey = buildOptionPathKey(
                  groupKey,
                  option.optionStableId,
                );

                const priceDelta =
                  option.priceDeltaCents > 0
                    ? `+${currencyFormatter.format(option.priceDeltaCents / 100)}`
                    : option.priceDeltaCents < 0
                      ? `-${currencyFormatter.format(
                          Math.abs(option.priceDeltaCents) / 100,
                        )}`
                      : "";

                return (
                <div key={option.optionStableId} className="flex flex-col gap-2">
                    <button
                        type="button"
                        disabled={optionTempUnavailable}
                        // 使用 groupKey 传递点击事件
                        onClick={() => optionTempUnavailable ? undefined : handleOptionToggle(groupKey, option.optionStableId, group.minSelect, group.maxSelect)}
                        className={`flex items-center justify-between rounded-2xl border px-4 py-3 text-left text-sm transition ${
                            optionTempUnavailable ? "cursor-not-allowed border-slate-200 bg-slate-100 text-slate-400" : 
                            selected ? "border-slate-900 bg-slate-900 text-white" : 
                            "border-slate-200 text-slate-700 hover:border-slate-300 hover:bg-slate-50"
                        }`}
                    >
                    <span className="flex flex-col gap-1">
                        <span className="font-medium">{optionLabel}</span>
                        {optionTempUnavailable ? (
                        <span className="text-xs font-semibold text-amber-600">{locale === "zh" ? "当日售罄" : "Sold out today"}</span>
                        ) : null}
                    </span>
                    {priceDelta ? (
                        <span className={`text-xs font-semibold ${selected ? "text-white/80" : "text-slate-400"}`}>{priceDelta}</span>
                    ) : null}
                    </button>

                    {selected && childOptions.length > 0 ? (
                        <div className="grid gap-2 pl-2 md:grid-cols-2">
                             {childOptions.map((child) => {
                                const childSelected = selectedChildOptions[parentOptionPathKey]?.includes(child.optionStableId) ?? false;
                                const childTempUnavailable = isTempUnavailable(child.tempUnavailableUntil);
                                const childLabel = locale === "zh" && child.nameZh ? child.nameZh : child.nameEn;
                                const childPriceDelta = child.priceDeltaCents > 0 ? `+${currencyFormatter.format(child.priceDeltaCents / 100)}` : child.priceDeltaCents < 0 ? `-${currencyFormatter.format(Math.abs(child.priceDeltaCents) / 100)}` : "";

                                return (
                                    <button key={child.optionStableId} type="button" disabled={childTempUnavailable}
                                        onClick={() => childTempUnavailable ? undefined : handleChildOptionToggle(parentOptionPathKey, child.optionStableId)}
                                        className={`flex flex-col items-start gap-1 rounded-xl border px-3 py-2 text-left text-xs transition ${childTempUnavailable ? "cursor-not-allowed border-slate-200 bg-slate-100 text-slate-400" : childSelected ? "border-slate-900 bg-slate-900 text-white" : "border-slate-200 text-slate-600 hover:border-slate-300 hover:bg-slate-50"}`}
                                    >
                                        <span className="font-medium">{childLabel}</span>
                                        {childTempUnavailable && (
                                          <span className="text-[10px] font-semibold text-amber-600">
                                            {locale === "zh" ? "当日售罄" : "Sold out today"}
                                          </span>
                                        )}
                                        {childPriceDelta && (
                                          <span className={`text-[10px] font-semibold ${childSelected ? "text-white/80" : "text-slate-400"}`}>
                                            {childPriceDelta}
                                          </span>
                                        )}
                                    </button>
                                );
                            })}
                        </div>
                    ) : null}

                    {/* ✅ 嵌套 Item 渲染：递归调用 renderOptionGroup */}
                    {selected && linkedItem && linkedItem.optionGroups && linkedItem.optionGroups.length > 0 ? (
                        <div className="mt-2 ml-2 pl-3 border-l-2 border-slate-100 space-y-4">
                            {linkedItem.optionGroups.map((nestedGroup, nestedIndex) =>
                              renderOptionGroup(
                                nestedGroup,
                                [...groupPath, buildOptionSegment(option)],
                                nestedIndex,
                              ),
                            )}
                        </div>
                    ) : null}
                </div>
                );
            })}
            </div>
        </div>
    );
  };

  return (
    <div className="space-y-12 pb-28">
      <section className="rounded-2xl border border-slate-200 bg-white px-6 py-4 shadow-sm">
        <div className="flex flex-col gap-2">
          <p className="text-sm font-semibold text-slate-900">
            {locale === "zh" ? "今日营业时间" : "Today's hours"}：{hoursValue}
          </p>
          {publicNoticeText ? (
            <p className="text-sm text-slate-600">
              {locale === "zh" ? "网站公告" : "Notice"}：{publicNoticeText}
            </p>
          ) : null}
        </div>
      </section>

      <section className="relative overflow-hidden rounded-3xl bg-white p-8 shadow-sm min-h-[260px] lg:min-h-[320px]">
        <div className="hidden lg:block pointer-events-none absolute top-1/2 -translate-y-1/2 left-[700px] z-0 opacity-100">
          <Image src="/images/hero.png" alt="Illustration" width={320} height={350} className="object-contain" />
        </div>
        <p className="text-sm font-semibold uppercase tracking-[0.3em] text-slate-500">{strings.tagline}</p>
        <div className="mt-6 flex flex-col gap-8 lg:flex-row lg:justify-between">
          <div className="relative z-10 flex flex-col gap-6">
            <div>
              <h1 className="text-3xl font-semibold tracking-tight text-slate-900 md:text-4xl">{strings.heroTitle}</h1>
              <p className="mt-3 max-w-2xl text-base text-slate-600">{strings.heroDescription}</p>
            </div>
            <ol className="flex flex-wrap gap-2 text-xs text-slate-500">
              {strings.orderSteps.map((step) => (
                <li key={step.id} className="inline-flex items-center gap-2 rounded-full bg-slate-100 px-3 py-1 font-medium text-slate-600">
                  <span className="grid h-5 w-5 place-items-center rounded-full bg-slate-900 text-[0.65rem] font-semibold text-white">{step.id}</span>
                  {step.label}
                </li>
              ))}
            </ol>
            <div className="flex flex-wrap gap-2 mt-4">
              <Link href={membershipHref} className="inline-flex items-center gap-2 rounded-full border border-slate-200 px-4 py-2 text-xs font-semibold text-slate-600 transition hover:border-slate-300 hover:bg-slate-50">{membershipLabel}</Link>
              {isMemberLoggedIn ? (
                <button type="button" onClick={handleLogout} className="inline-flex items-center gap-2 rounded-full border border-slate-200 px-4 py-2 text-xs font-semibold text-slate-600 transition hover:border-slate-300 hover:bg-slate-50">{logoutLabel}</button>
              ) : null}
              <Link href={checkoutHref} className="inline-flex items-center gap-2 rounded-full border border-slate-200 px-4 py-2 text-xs font-semibold text-slate-600 transition hover:border-slate-300 hover:bg-slate-50">{strings.cartTitle}</Link>
            </div>
          </div>
          <div className="hidden lg:block lg:w-[220px]" />
        </div>
      </section>

      {/* ===== 菜单区 ===== */}
      <section className="space-y-10">
        {menuLoading ? (
          <p className="text-sm text-slate-500">{locale === "zh" ? "菜单加载中…" : "Loading menu…"}</p>
        ) : (
          <>
            {menuError && <p className="text-xs text-amber-600">{menuError}</p>}
            {entitlementsError && <p className="text-xs text-amber-600">{entitlementsError}</p>}
            {cartNotice && <p className="text-xs text-amber-600">{cartNotice}</p>}

            {mergedMenu.length === 0 ? (
              <p className="text-sm text-slate-500">{locale === "zh" ? "当前暂无可售菜品。" : "No items available at the moment."}</p>
            ) : (
              <>
                {/* ... Daily Specials Logic ... */}
                {dailySpecials.length > 0 && (
                    <div className="space-y-4">
                        <h2 className="text-2xl font-semibold text-slate-900">{locale === "zh" ? "今日特价" : "Today specials"}</h2>
                        <div className="grid gap-4 md:grid-cols-2">
                            {dailySpecials.map(special => {
                                const item = menuItemMap.get(special.itemStableId);
                                if (!item) return null;
                                return (
                                    <article key={special.stableId} 
                                        className={`group flex h-full flex-col justify-between rounded-3xl border border-amber-200 bg-amber-50/40 p-5 shadow-sm transition ${isTempUnavailable(item.tempUnavailableUntil) ? "cursor-not-allowed opacity-70" : "cursor-pointer hover:-translate-y-0.5 hover:shadow-md"}`}
                                        onClick={() => { if (!isTempUnavailable(item.tempUnavailableUntil)) { setActiveItem(item); setSelectedQuantity(1); setSelectedOptions({}); setSelectedChildOptions({}); } }}
                                    >
                                        <div className="flex items-center gap-3">
                                            {item.imageUrl && (
                                              <div className="relative h-12 w-12 shrink-0 overflow-hidden rounded-xl bg-amber-100">
                                                <Image
                                                  src={item.imageUrl}
                                                  alt={item.name}
                                                  fill
                                                  sizes="48px"
                                                  className="object-cover"
                                                />
                                              </div>
                                            )}
                                            <span className="rounded-full bg-amber-500/90 px-2 py-1 text-[11px] font-semibold uppercase tracking-wide text-white">{locale === "zh" ? "特价" : "Special"}</span>
                                            <h3 className="text-lg font-semibold text-slate-900">{special.name}</h3>
                                        </div>
                                        <div className="mt-4 flex items-center justify-between">
                                            <div className="flex items-baseline gap-2">
                                                <span className="text-lg font-semibold text-slate-900">{currencyFormatter.format(special.effectivePriceCents / 100)}</span>
                                                <span className="text-xs text-slate-400 line-through">{currencyFormatter.format(special.basePriceCents / 100)}</span>
                                            </div>
                                        </div>
                                    </article>
                                );
                            })}
                        </div>
                    </div>
                )}

                {/* ... Main Menu Categories ... */}
                {mergedMenu.map((category) => (
                  <div key={category.stableId} className="space-y-4">
                    <h2 className="rounded-2xl bg-black py-3 text-center text-2xl font-semibold text-white">{category.name}</h2>
                    <div className="grid gap-4 md:grid-cols-2">
                      {category.items.map((item) => {
                        const isDailySpecial = Boolean(item.activeSpecial);
                        return (
                          <article
                            key={item.stableId}
                            className={`group flex h-full flex-col justify-between rounded-3xl border border-slate-200 bg-white p-5 shadow-sm transition ${isTempUnavailable(item.tempUnavailableUntil) ? "cursor-not-allowed opacity-70" : "cursor-pointer hover:-translate-y-0.5 hover:shadow-md"}`}
                            onClick={() => {
                              if (isTempUnavailable(item.tempUnavailableUntil)) return;
                              setActiveItem(item);
                              setSelectedQuantity(1);
                              setSelectedOptions({});
                              setSelectedChildOptions({});
                            }}
                          >
                            {item.imageUrl && (
                              <div className="mb-3 overflow-hidden rounded-2xl bg-slate-100">
                                <div className="relative h-64 w-full">
                                  <Image
                                    src={item.imageUrl}
                                    alt={item.name}
                                    fill
                                    sizes="(min-width: 768px) 50vw, 100vw"
                                    className="object-cover transition duration-300 group-hover:scale-105"
                                  />
                                </div>
                              </div>
                            )}
                            <div className="space-y-3">
                                <div className="flex items-start justify-between gap-4">
                                    <div>
                                        <div className="flex items-center gap-2">
                                            {isDailySpecial && <span className="rounded-full bg-amber-500/90 px-2 py-1 text-[10px] font-semibold uppercase tracking-wide text-white">{locale === "zh" ? "特价" : "Special"}</span>}
                                            <h3 className="text-lg font-semibold text-slate-900">{item.name}</h3>
                                        </div>
                                        {item.ingredients && <p className="mt-1 text-xs text-slate-500">{item.ingredients}</p>}
                                    </div>
                                    <div className="flex flex-col items-end gap-2">
                                        <span className="rounded-full bg-slate-900/90 px-3 py-1 text-sm font-semibold text-white">{currencyFormatter.format(item.price)}</span>
                                        {isTempUnavailable(item.tempUnavailableUntil) && <span className="rounded-full bg-amber-100 px-2 py-1 text-xs font-semibold text-amber-700">{locale === "zh" ? "当日售罄" : "Sold out today"}</span>}
                                    </div>
                                </div>
                            </div>
                            <div className="mt-5 flex items-center justify-end">
                                <button type="button" className="inline-flex items-center justify-center rounded-full bg-slate-900 px-4 py-2 text-sm font-semibold text-white hover:bg-slate-700">
                                    {strings.chooseOptions}
                                </button>
                            </div>
                          </article>
                        );
                      })}
                    </div>
                  </div>
                ))}
              </>
            )}
          </>
        )}
      </section>

      {/* ===== 菜品选项弹窗 ===== */}
      {activeItem ? (
        <div className="fixed inset-0 z-50 flex items-end justify-center bg-slate-900/40 p-4 md:items-center">
          <div className="flex max-h-[85vh] w-full max-w-2xl flex-col overflow-hidden rounded-3xl bg-white shadow-xl">
            {/* Header */}
            <div className="flex items-start justify-between gap-4 border-b border-slate-100 px-6 py-5">
              <div>
                <p className="text-xs font-semibold uppercase tracking-[0.3em] text-slate-400">{locale === "zh" ? "菜品选项" : "Dish options"}</p>
                <h3 className="mt-2 text-2xl font-semibold text-slate-900">{activeItem.name}</h3>
                {activeItem.ingredients ? <p className="mt-2 text-sm text-slate-500">{activeItem.ingredients}</p> : null}
              </div>
              <button type="button" onClick={closeOptionsModal} className="rounded-full border border-slate-200 px-3 py-1 text-xs font-semibold text-slate-500 transition hover:border-slate-300 hover:bg-slate-50">{locale === "zh" ? "关闭" : "Close"}</button>
            </div>

            {/* Content: Option Groups */}
            <div className="min-h-0 flex-1 space-y-6 overflow-y-auto px-6 py-5">
              {activeItem.imageUrl ? (
                <div className="overflow-hidden rounded-2xl bg-slate-100">
                  <div className="relative aspect-[5/3] w-full">
                    <Image
                      src={activeItem.imageUrl}
                      alt={activeItem.name}
                      fill
                      sizes="(min-width: 768px) 50vw, 100vw"
                      className="object-cover"
                    />
                  </div>
                </div>
              ) : null}

              {(activeItem.optionGroups ?? []).length === 0 ? (
                <p className="text-sm text-slate-500">{locale === "zh" ? "该菜品暂无可选项。" : "No options available for this dish."}</p>
              ) : (
                // ✅ 使用递归渲染函数
                (activeItem.optionGroups ?? []).map((group, groupIndex) =>
                  renderOptionGroup(
                    group,
                    ["root", activeItem.stableId],
                    groupIndex,
                  ),
                )
              )}
            </div>

            {/* Footer: Totals & Action */}
            <div className="space-y-4 border-t border-slate-100 px-6 py-5">
              {requiredGroupsMissing.length > 0 ? (
                <p className="text-xs text-rose-500">{locale === "zh" ? "请完成所有必选项后再加入购物车。" : "Please complete all required selections before adding to cart."}</p>
              ) : null}

              {selectedOptionsDetails.length > 0 ? (
                <div className="h-30 space-y-2 overflow-y-auto rounded-2xl bg-slate-50 p-4 text-xs text-slate-500">
                  {selectedOptionsDetails.map((option, idx) => (
                    <div key={`${option.groupName}-${option.optionName}-${idx}`} className="flex items-center justify-between">
                      <span>{option.groupName} · {option.optionName}</span>
                      {option.priceDeltaCents !== 0 ? <span>{option.priceDeltaCents > 0 ? "+" : "-"}{currencyFormatter.format(Math.abs(option.priceDeltaCents) / 100)}</span> : null}
                    </div>
                  ))}
                </div>
              ) : null}

              <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                <div className="text-sm text-slate-600">{locale === "zh" ? "当前价格" : "Current price"}: <span className="font-semibold text-slate-900">{currencyFormatter.format((activeItem.price * 100 + optionsPriceCents) / 100)}</span></div>
                <div className="flex items-center gap-3">
                  <div className="inline-flex items-center rounded-full border border-slate-200 bg-white px-2 py-1 shadow-sm">
                    <button type="button" onClick={() => setSelectedQuantity((qty) => Math.max(1, qty - 1))} disabled={selectedQuantity <= 1} className={`flex h-8 w-8 items-center justify-center rounded-full text-lg font-semibold transition ${selectedQuantity <= 1 ? "cursor-not-allowed text-slate-300" : "text-slate-600 hover:bg-slate-100"}`}>−</button>
                    <span className="min-w-[2.5rem] text-center text-sm font-semibold text-slate-700">{selectedQuantity}</span>
                    <button type="button" onClick={() => setSelectedQuantity((qty) => qty + 1)} className="flex h-8 w-8 items-center justify-center rounded-full text-lg font-semibold text-slate-600 transition hover:bg-slate-100">+</button>
                  </div>
                  <button
                    type="button"
                    onClick={() => {
                      if (!activeItem || !canAddToCart) return;
                      addItem(
                        activeItem.stableId,
                        buildOptionSnapshots({
                          ...selectedOptions,
                          ...selectedChildOptions,
                        }),
                        selectedQuantity,
                      );
                      closeOptionsModal();
                    }}
                    disabled={!canAddToCart}
                    className={`inline-flex items-center justify-center rounded-full px-6 py-2 text-sm font-semibold transition ${canAddToCart ? "bg-slate-900 text-white hover:bg-slate-700" : "cursor-not-allowed bg-slate-200 text-slate-400"}`}
                  >
                    {strings.addToCart}
                  </button>
                </div>
              </div>
            </div>
          </div>
        </div>
      ) : null}

      {/* 浮动购物车入口 */}
      <Link href={checkoutHref} className="fixed bottom-6 right-6 z-50 flex items-center gap-3 rounded-full bg-slate-900 px-5 py-3 text-sm font-semibold text-white shadow-xl transition hover:bg-slate-700">
        <span>{strings.floatingCartLabel}</span>
        <span className="grid h-8 w-8 place-items-center rounded-full bg-white text-sm font-semibold text-slate-900">{totalQuantity}</span>
      </Link>
    </div>
  );
}
