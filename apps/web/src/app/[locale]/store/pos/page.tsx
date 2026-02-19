// apps/web/src/app/[locale]/store/pos/page.tsx
"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useRouter, useParams } from "next/navigation";
import type { Locale } from "@/lib/i18n/locales";
import type { PublicMenuResponse as PublicMenuApiResponse, OptionChoiceDto } from "@shared/menu";
import {
  buildLocalizedMenuFromDb,
  type PublicMenuCategory,
} from "@/lib/menu/menu-transformer";
import { TAX_RATE } from "@/lib/order/shared";
import { apiFetch } from "@/lib/api/client";
import {
  fetchPosCustomerOrderingStatus,
  pauseCustomerOrderingFromPos,
  resumeCustomerOrderingFromPos,
  type PosCustomerOrderingStatus,
} from "@/lib/api/pos";
import {
  POS_DISPLAY_STORAGE_KEY,
  clearPosDisplaySnapshot,
  type PosDisplaySnapshot,
} from "@/lib/pos-display";
import { StoreBoardWidget } from "@/components/store/StoreBoardWidget";
import { formatStoreTime } from "@/lib/time/tz";

type PosCartEntry = {
  lineId: string;
  stableId: string;
  quantity: number;
  customUnitPriceCents?: number;
  options?: Record<string, string[]>;
};

type SelectedOptionLine = {
  label: string;
  labelZh: string;
  labelEn: string;
  priceCents: number;
};

type StoreStatusRuleSource =
  | "REGULAR_HOURS"
  | "HOLIDAY"
  | "CLOSED_ALL_DAY"
  | "TEMPORARY_CLOSE";

type StoreStatus = {
  isOpen: boolean;
  isTemporarilyClosed: boolean;
  temporaryCloseReason: string | null;
  ruleSource: StoreStatusRuleSource;
  timezone: string;
  nextOpenAt?: string | null;
  today?: {
    date: string;
    isHoliday: boolean;
    holidayName: string | null;
  };
};


type PosStatusSocketClient = {
  on: (event: string, handler: (payload: PosCustomerOrderingStatus) => void) => void;
  off: (event: string, handler: (payload: PosCustomerOrderingStatus) => void) => void;
  disconnect: () => void;
};

type SocketIoBrowserGlobal = {
  io: (
    uri: string,
    options?: {
      path?: string;
      withCredentials?: boolean;
      transports?: Array<"websocket" | "polling">;
    },
  ) => PosStatusSocketClient;
};

const POS_CUSTOMER_ORDERING_STATUS_UPDATED_EVENT =
  "CUSTOMER_ORDERING_STATUS_UPDATED";

async function loadSocketIoFromCdn(): Promise<SocketIoBrowserGlobal["io"] | null> {
  if (typeof window === "undefined") return null;

  const existing = (window as typeof window & { io?: SocketIoBrowserGlobal["io"] }).io;
  if (typeof existing === "function") {
    return existing;
  }

  const scriptId = "pos-socket-io-cdn";
  const existingScript = document.getElementById(scriptId) as HTMLScriptElement | null;

  await new Promise<void>((resolve, reject) => {
    if (existingScript) {
      if ((window as typeof window & { io?: SocketIoBrowserGlobal["io"] }).io) {
        resolve();
        return;
      }
      existingScript.addEventListener("load", () => resolve(), { once: true });
      existingScript.addEventListener(
        "error",
        () => reject(new Error("Failed to load Socket.IO client script")),
        { once: true },
      );
      return;
    }

    const script = document.createElement("script");
    script.id = scriptId;
    script.src = "https://cdn.socket.io/4.8.1/socket.io.min.js";
    script.async = true;
    script.crossOrigin = "anonymous";
    script.addEventListener("load", () => resolve(), { once: true });
    script.addEventListener(
      "error",
      () => reject(new Error("Failed to load Socket.IO client script")),
      { once: true },
    );
    document.head.appendChild(script);
  });

  const io = (window as typeof window & { io?: SocketIoBrowserGlobal["io"] }).io;
  return typeof io === "function" ? io : null;
}

const STRINGS = {
  zh: {
    title: "门店点单 · POS",
    subtitle: "触摸屏点单界面 · 大按钮方便操作。",
    pickup: "到店自取",
    dineIn: "堂食",
    fulfillmentLabel: "取餐方式",
    categoriesAll: "全部",
    cartTitle: "本单菜品",
    emptyCart: "尚未选择菜品。",
    subtotal: "小计",
    tax: "税费 (HST)",
    total: "合计",
    clearCart: "清空",
    placeOrder: "下单",
    placing: "下单中…",
    qtyLabel: "份数",
    tapToAdd: "点击添加",
    chooseOptions: "请选择必选项",
    addToCart: "加入本单",
    priceLabel: "价格",
    optionsRequired: "请先选择所有必选项",
    optionLimit: (min: number, max: number | null) =>
      max === null || max === min
        ? `至少选 ${min} 项`
        : `请选择 ${min}-${max} 项`,
    successTitle: "下单成功",
    successBody: "单号与取餐码已显示在看板。",
    close: "关闭",
    errorGeneric: "下单失败，请稍后重试。",
    optionDialogTitle: "选择餐品选项",
    optionDialogSubtitle: "完成所有必选项后可加入本单。",
    storeStatusOpen: "顾客端营业中",
    storeStatusClosed: "顾客端暂停接单",
    storeStatusHoliday: "节假日休息",
    storeStatusTemporaryClosed: "当前门店已暂停接单。",
    storeStatusClosedBySchedule: "当前不在营业时间内，暂时不支持新建订单。",
    storeStatusNextOpenPrefix: "下次营业时间：",
    storeStatusLoading: "正在获取门店状态…",
    storeStatusError: "门店状态获取失败，请以店内实际情况为准。",
    menuManage: "菜单管理",
    orderManage: "订单管理",
    summary: "当日小结",
    memberManage: "会员管理",
    pauseActionLabel: "暂停顾客端接单",
    resumeActionLabel: "恢复顾客端营业",
    pausing: "设置中…",
    resuming: "恢复中…",
    autoResumeAtPrefix: "自动恢复时间：",
  },
  en: {
    title: "Store POS",
    subtitle: "Touch-friendly POS screen with large buttons.",
    pickup: "Pickup",
    dineIn: "Dine-in",
    fulfillmentLabel: "Fulfillment",
    categoriesAll: "All",
    cartTitle: "Current order",
    emptyCart: "No items selected.",
    subtotal: "Subtotal",
    tax: "Tax (HST)",
    total: "Total",
    clearCart: "Clear",
    placeOrder: "Place order",
    placing: "Placing…",
    qtyLabel: "Qty",
    tapToAdd: "Tap to add",
    chooseOptions: "Select required options",
    addToCart: "Add to order",
    priceLabel: "Price",
    optionsRequired: "Please complete required options",
    optionLimit: (min: number, max: number | null) =>
      max === null || max === min
        ? `Select at least ${min}`
        : `Select ${min}-${max}`,
    successTitle: "Order created",
    successBody: "Order number and pickup code are shown on the board.",
    close: "Close",
    errorGeneric: "Failed to place order. Please try again.",
    optionDialogTitle: "Choose item options",
    optionDialogSubtitle: "Finish required options before adding to order.",
    storeStatusOpen: "Customer ordering: on",
    storeStatusClosed: "Customer ordering: paused",
    storeStatusHoliday: "Closed for holiday",
    storeStatusTemporaryClosed:
      "The store is temporarily not accepting new orders.",
    storeStatusClosedBySchedule:
      "The store is currently closed and cannot accept new orders.",
    storeStatusNextOpenPrefix: "Next opening time: ",
    storeStatusLoading: "Checking store status…",
    storeStatusError:
      "Unable to load store status. Please confirm with the store.",
    menuManage: "Menu management",
    orderManage: "Order management",
    summary: "Daily summary",
    memberManage: "Member management",
    pauseActionLabel: "Pause customer ordering",
    resumeActionLabel: "Resume customer ordering",
    pausing: "Updating…",
    resuming: "Resuming…",
    autoResumeAtPrefix: "Auto resume at: ",
  },
} as const;

function formatMoney(cents: number): string {
  return `$${(cents / 100).toFixed(2)}`;
}

export default function StorePosPage() {
  const params = useParams<{ locale?: string }>();
  const locale = (params?.locale === "zh" ? "zh" : "en") as Locale;
  const isZh = locale === "zh";
  const router = useRouter();
  const t = STRINGS[locale];

  const [menuCategories, setMenuCategories] = useState<PublicMenuCategory[]>(
    [],
  );

  const [activeCategoryId, setActiveCategoryId] = useState<string>("all");
  const [cart, setCart] = useState<PosCartEntry[]>([]);
  const [isPlacing, setIsPlacing] = useState(false);
  const [lastOrderInfo, setLastOrderInfo] = useState<{
    orderNumber: string;
    pickupCode?: string | null;
  } | null>(null);

  const [storeStatus, setStoreStatus] = useState<StoreStatus | null>(null);
  const [storeStatusLoading, setStoreStatusLoading] = useState(false);
  const [storeStatusError, setStoreStatusError] = useState<string | null>(null);
  const [customerOrderingStatus, setCustomerOrderingStatus] =
    useState<PosCustomerOrderingStatus | null>(null);
  const [customerStatusLoading, setCustomerStatusLoading] = useState(false);
  const [customerStatusSaving, setCustomerStatusSaving] = useState(false);
  const [showPauseMenu, setShowPauseMenu] = useState(false);

  useEffect(() => {
    let cancelled = false;

    async function loadMenu() {
      try {
        const dbMenu = await apiFetch<PublicMenuApiResponse>("/menu/public", {
          cache: "no-store",
        });
        if (cancelled) return;

        // 1. 获取正常的分类列表（这里面的 items 已经包含了 activeSpecial 信息）
        const localized = buildLocalizedMenuFromDb(
          dbMenu.categories ?? [],
          locale,
        );
        // 2. 直接设置原分类列表
        setMenuCategories(localized);

      } catch (error) {
        console.error("Failed to load POS menu", error);
      }
    }

    void loadMenu();

    return () => {
      cancelled = true;
    };
  }, [isZh, locale]);

  useEffect(() => {
    let cancelled = false;

    async function loadStoreStatus() {
      try {
        setStoreStatusLoading(true);
        setStoreStatusError(null);
        const data = await apiFetch<StoreStatus>("/public/store-status");
        if (cancelled) return;
        setStoreStatus(data);
      } catch (error) {
        console.error("Failed to load store status", error);
        if (cancelled) return;
        setStoreStatusError(
          isZh
            ? "门店状态加载失败，请以店内实际情况为准。"
            : "Failed to load store status. Please check the store status manually.",
        );
      } finally {
        if (!cancelled) {
          setStoreStatusLoading(false);
        }
      }
    }

    void loadStoreStatus();

    const intervalId = window.setInterval(loadStoreStatus, 60_000);

    return () => {
      cancelled = true;
      window.clearInterval(intervalId);
    };
  }, [isZh]);

  useEffect(() => {
    let cancelled = false;
    let socket: PosStatusSocketClient | null = null;

    async function startStatusPush() {
      try {
        setCustomerStatusLoading(true);
        const initialStatus = await fetchPosCustomerOrderingStatus();
        if (cancelled) return;
        setCustomerOrderingStatus(initialStatus);
      } catch (error) {
        console.error("Failed to load initial customer ordering status", error);
      } finally {
        if (!cancelled) {
          setCustomerStatusLoading(false);
        }
      }

      try {
        const io = await loadSocketIoFromCdn();
        if (cancelled || !io) return;

        socket = io(`${window.location.origin}/pos`, {
          path: "/socket.io",
          withCredentials: true,
          transports: ["websocket", "polling"],
        });

        const handleStatusUpdated = (payload: PosCustomerOrderingStatus) => {
          if (cancelled) return;
          setCustomerOrderingStatus(payload);
        };

        socket.on(POS_CUSTOMER_ORDERING_STATUS_UPDATED_EVENT, handleStatusUpdated);
      } catch (error) {
        console.error("Failed to subscribe customer ordering status push", error);
      }
    }

    void startStatusPush();

    return () => {
      cancelled = true;
      if (socket) {
        socket.disconnect();
      }
    };
  }, []);

  const isCustomerPaused = customerOrderingStatus?.isTemporarilyClosed ?? false;
  const isStoreOpenNow = storeStatus?.isOpen ?? false;
  const isCustomerOrderingOpen = !isCustomerPaused && isStoreOpenNow;

  const customerStatusLabel = (() => {
    if (isCustomerPaused) {
      return t.storeStatusClosed;
    }

    if (isStoreOpenNow) {
      return t.storeStatusOpen;
    }

    if (storeStatus?.today?.isHoliday) {
      return t.storeStatusHoliday;
    }

    return t.storeStatusClosedBySchedule;
  })();

  let storeStatusDetail: string | null = null;
  if (storeStatus && isCustomerPaused) {
    if (storeStatus.temporaryCloseReason?.trim()) {
      storeStatusDetail = isZh
        ? `当前顾客端暂停接单：${storeStatus.temporaryCloseReason}`
        : `Customer ordering is paused: ${storeStatus.temporaryCloseReason}`;
    } else {
      storeStatusDetail = t.storeStatusTemporaryClosed;
    }
  }

  const allMenuItems = useMemo(
    () => menuCategories.flatMap((cat) => cat.items),
    [menuCategories],
  );

  const menuItemMap = useMemo(
    () => new Map(allMenuItems.map((item) => [item.stableId, item])),
    [allMenuItems],
  );

  const menuItemMapByName = useMemo(() => {
    const map = new Map<string, PublicMenuCategory["items"][number]>();
    allMenuItems.forEach((item) => {
      const names = [item.name, item.nameEn, item.nameZh]
        .filter((name): name is string => Boolean(name?.trim()))
        .map((name) => name.trim());
      names.forEach((name) => map.set(name, item));
    });
    return map;
  }, [allMenuItems]);

  const resolveLinkedItem = useCallback(
    (option: OptionChoiceDto) => {
      if (option.targetItemStableId) {
        const byId = menuItemMap.get(option.targetItemStableId);
        if (byId) return byId;
      }

      const nameKey = locale === "zh" && option.nameZh ? option.nameZh : option.nameEn;
      if (nameKey) {
        const byName = menuItemMapByName.get(nameKey.trim());
        if (byName) return byName;
      }

      return undefined;
    },
    [locale, menuItemMap, menuItemMapByName],
  );

  const buildGroupSegment = useCallback(
    (
      group: NonNullable<
        PublicMenuCategory["items"][number]["optionGroups"]
      >[number],
      index: number,
    ) =>
      group.bindingStableId ?? `${group.templateGroupStableId}-${index}`,
    [],
  );

  const buildPathKey = useCallback((segments: string[]) => segments.join("__"), []);

  const collectSelectedOptionLines = useCallback(
    (
      item: PublicMenuCategory["items"][number],
      selected: Record<string, string[]>,
      basePath: string[],
      visited: Set<string>,
    ): SelectedOptionLine[] => {
      const lines: SelectedOptionLine[] = [];
      (item.optionGroups ?? []).forEach((group, groupIndex) => {
        const groupPath = [...basePath, buildGroupSegment(group, groupIndex)];
        const groupKey = buildPathKey(groupPath);
        if (visited.has(groupKey)) return;
        visited.add(groupKey);

        const selectedIds = selected[groupKey] ?? [];
        if (selectedIds.length === 0) return;

        selectedIds.forEach((optionId) => {
          const option = group.options.find((opt) => opt.optionStableId === optionId);
          if (!option) return;
          lines.push({
            label: option.nameZh ?? option.nameEn,
            labelZh: option.nameZh ?? option.nameEn,
            labelEn: option.nameEn,
            priceCents: option.priceDeltaCents,
          });

          const linkedItem = resolveLinkedItem(option);
          if (!linkedItem?.optionGroups?.length) return;
          lines.push(
            ...collectSelectedOptionLines(
              linkedItem,
              selected,
              [...groupPath, `option-${option.optionStableId}`],
              visited,
            ),
          );
        });
      });
      return lines;
    },
    [buildGroupSegment, buildPathKey, resolveLinkedItem],
  );

  const cartWithDetails = useMemo(() => {
    return cart
      .map((entry) => {
        const item = allMenuItems.find((i) => i.stableId === entry.stableId);
        if (!item) return null;

        const selectedOptionLines = entry.options
          ? collectSelectedOptionLines(
              item,
              entry.options,
              ["root", item.stableId],
              new Set<string>(),
            )
          : [];
        const optionDeltaCents = selectedOptionLines.reduce(
          (sum, line) => sum + line.priceCents,
          0,
        );
        const unitPriceCents = Math.round(item.price * 100) + optionDeltaCents;
        const effectiveUnitPriceCents =
          typeof entry.customUnitPriceCents === "number"
            ? entry.customUnitPriceCents
            : unitPriceCents;

        return {
          ...entry,
          item,
          optionLines: selectedOptionLines,
          unitPriceCents: effectiveUnitPriceCents,
          lineTotalCents: effectiveUnitPriceCents * entry.quantity,
        };
      })
      .filter((x): x is NonNullable<typeof x> => Boolean(x));
  }, [cart, allMenuItems, collectSelectedOptionLines]);

  const subtotalCents = useMemo(
    () => cartWithDetails.reduce((sum, item) => sum + item.lineTotalCents, 0),
    [cartWithDetails],
  );
  const taxCents = Math.round(subtotalCents * TAX_RATE);
  const totalCents = subtotalCents + taxCents;

  const hasItems = cartWithDetails.length > 0;

  const visibleItems = useMemo(() => {
    if (activeCategoryId === "all") {
      return menuCategories.flatMap((cat) => cat.items);
    }
    const cat = menuCategories.find((c) => c.stableId === activeCategoryId);
    return cat ? cat.items : [];
  }, [menuCategories, activeCategoryId]);


  useEffect(() => {
    if (typeof window === "undefined") return;
    try {
      const raw = window.localStorage.getItem(POS_DISPLAY_STORAGE_KEY);
      if (!raw) return;
      const parsed = JSON.parse(raw) as PosDisplaySnapshot;
      const restoredItems = (parsed.items ?? []).map((item) => ({
        quantity:
          Number.isFinite(item.quantity) && item.quantity > 0
            ? item.quantity
            : 1,
        lineId: item.lineId ?? `line-${Date.now()}-${Math.random()}`,
        stableId: item.stableId,
        customUnitPriceCents:
          typeof item.customUnitPriceCents === "number"
            ? item.customUnitPriceCents
            : typeof item.unitPriceCents === "number"
              ? item.unitPriceCents
              : Math.round((item.lineTotalCents ?? 0) / Math.max(item.quantity ?? 1, 1)),
        options: item.options,
      }));
      if (restoredItems.length > 0) {
        setCart(restoredItems);
      }
    } catch (err) {
      console.warn("Failed to restore POS cart snapshot:", err);
    }
  }, []);

  const clearCart = () => {
    setCart([]);
    clearPosDisplaySnapshot();
  };

  const [activeItem, setActiveItem] = useState<{
    item: PublicMenuCategory["items"][number];
    selected: Record<string, string[]>;
    quantity: number;
  } | null>(null);
  const [editingLineId, setEditingLineId] = useState<string | null>(null);

  const closeDialog = () => {
    setActiveItem(null);
  };

  const openOptionDialog = (item: PublicMenuCategory["items"][number]) => {
    setActiveItem({
      item,
      selected: {},
      quantity: 1,
    });
  };

  const updateCartLinePrice = (lineId: string, raw: string) => {
    const normalized = raw.replace(/[^\d.]/g, "");
    const parsed = Number(normalized);
    if (!Number.isFinite(parsed) || parsed < 0) return;
    setCart((prev) =>
      prev.map((entry) =>
        entry.lineId === lineId
          ? { ...entry, customUnitPriceCents: Math.round(parsed * 100) }
          : entry,
      ),
    );
  };

  const appendKeypadValue = (key: string) => {
    if (!editingLineId) return;
    setCart((prev) =>
      prev.map((entry) => {
        if (entry.lineId !== editingLineId) return entry;
        const currentCents = entry.customUnitPriceCents ?? 0;

        if (key === "clear") {
          return { ...entry, customUnitPriceCents: 0 };
        }
        if (key === "back") {
          return { ...entry, customUnitPriceCents: Math.floor(currentCents / 10) };
        }
        if (key === "00") {
          return { ...entry, customUnitPriceCents: currentCents * 100 };
        }

        const digit = Number(key);
        if (!Number.isInteger(digit) || digit < 0 || digit > 9) return entry;

        return {
          ...entry,
          customUnitPriceCents: currentCents * 10 + digit,
        };
      }),
    );
  };

  // ✅ 核心修复：更新选项选择逻辑，支持父子级互斥和级联取消
  const updateOptionSelection = (
    groupId: string,
    optionId: string,
    maxSelect: number | null,
    groupOptions: OptionChoiceDto[] = [],
  ) => {
    if (!activeItem) return;

    setActiveItem((prev) => {
      if (!prev) return prev;

      const currentSelectedIds = prev.selected[groupId] ?? [];
      const targetOption = groupOptions.find(
        (o) => o.optionStableId === optionId,
      );
      if (!targetOption) return prev;

      const isTargetChild =
        (targetOption.parentOptionStableIds?.length ?? 0) > 0;

      let nextSelectedIds: string[];

      if (isTargetChild) {
        // 子选项逻辑：简单切换
        if (currentSelectedIds.includes(optionId)) {
          nextSelectedIds = currentSelectedIds.filter((id) => id !== optionId);
        } else {
          nextSelectedIds = [...currentSelectedIds, optionId];
        }
      } else {
        // 父选项逻辑
        const currentParentIds = currentSelectedIds.filter((id) => {
          const opt = groupOptions.find((o) => o.optionStableId === id);
          return !opt?.parentOptionStableIds?.length;
        });

        const isAlreadySelected = currentSelectedIds.includes(optionId);

        if (isAlreadySelected) {
          // 取消父项 -> 同时移除该父项的所有子项
          nextSelectedIds = currentSelectedIds.filter((id) => id !== optionId);
          const childrenToRemove = targetOption.childOptionStableIds ?? [];
          nextSelectedIds = nextSelectedIds.filter(
            (id) => !childrenToRemove.includes(id),
          );
        } else {
          // 选中新父项
          if (maxSelect === 1) {
            // 单选：直接替换
            nextSelectedIds = [optionId];
          } else if (
            typeof maxSelect === "number" &&
            currentParentIds.length >= maxSelect
          ) {
            // 达到最大值：移除最早的一个父项及其子项
            const parentToRemove = currentParentIds[0];
            const parentToRemoveOpt = groupOptions.find(
              (o) => o.optionStableId === parentToRemove,
            );
            const childrenToRemove =
              parentToRemoveOpt?.childOptionStableIds ?? [];

            nextSelectedIds = currentSelectedIds.filter(
              (id) => id !== parentToRemove && !childrenToRemove.includes(id),
            );
            nextSelectedIds.push(optionId);
          } else {
            // 未达上限：直接添加
            nextSelectedIds = [...currentSelectedIds, optionId];
          }
        }
      }

      return {
        ...prev,
        selected: {
          ...prev.selected,
          [groupId]: nextSelectedIds,
        },
      };
    });
  };

  const activeOptionGroups = useMemo(() => {
    if (!activeItem) return [] as Array<{
      group: NonNullable<PublicMenuCategory["items"][number]["optionGroups"]>[number];
      key: string;
      path: string[];
    }>;

    const collect = (
      item: PublicMenuCategory["items"][number],
      basePath: string[],
      visited: Set<string>,
    ) => {
      const collected: Array<{
        group: NonNullable<PublicMenuCategory["items"][number]["optionGroups"]>[number];
        key: string;
        path: string[];
      }> = [];

      (item.optionGroups ?? []).forEach((group, groupIndex) => {
        const groupPath = [...basePath, buildGroupSegment(group, groupIndex)];
        const groupKey = buildPathKey(groupPath);
        if (visited.has(groupKey)) return;
        visited.add(groupKey);

        collected.push({ group, key: groupKey, path: groupPath });

        const selectedIds = activeItem.selected[groupKey] ?? [];
        if (selectedIds.length === 0) return;

        selectedIds.forEach((optionId) => {
          const option = group.options.find((opt) => opt.optionStableId === optionId);
          if (!option) return;
          const linkedItem = resolveLinkedItem(option);
          if (!linkedItem?.optionGroups?.length) return;
          collected.push(
            ...collect(
              linkedItem,
              [...groupPath, `option-${option.optionStableId}`],
              visited,
            ),
          );
        });
      });

      return collected;
    };

    return collect(activeItem.item, ["root", activeItem.item.stableId], new Set<string>());
  }, [activeItem, buildGroupSegment, buildPathKey, resolveLinkedItem]);

  const requiredGroupsMissing =
    activeOptionGroups.filter(({ group, key }) => {
      if (group.minSelect <= 0) return false;
      const selectedCount = activeItem?.selected[key]?.length ?? 0;
      return selectedCount < group.minSelect;
    });
  const canAddToCart = Boolean(activeItem) && requiredGroupsMissing.length === 0;

  const addActiveItemToCart = () => {
    if (!activeItem || !canAddToCart) return;
    const lineId = `line-${Date.now()}-${Math.random()}`;
    const optionDeltaCents = activeOptionGroups.reduce((sum, { group, key }) => {
      const selected = activeItem.selected[key] ?? [];
      return sum + group.options
        .filter((option) => selected.includes(option.optionStableId))
        .reduce((groupSum, option) => groupSum + option.priceDeltaCents, 0);
    }, 0);
    const unitPriceCents = Math.round(activeItem.item.price * 100) + optionDeltaCents;

    setCart((prev) => [
      ...prev,
      {
        lineId,
        stableId: activeItem.item.stableId,
        quantity: activeItem.quantity,
        customUnitPriceCents: unitPriceCents,
        options: activeItem.selected,
      },
    ]);
    closeDialog();
  };

  useEffect(() => {
    if (typeof window === "undefined") return;

    const snapshot: PosDisplaySnapshot = {
      items: cartWithDetails.map((entry) => ({
        lineId: entry.lineId,
        stableId: entry.stableId,
        nameZh: entry.item.nameZh ?? entry.item.nameEn,
        nameEn: entry.item.nameEn,
        quantity: entry.quantity,
        unitPriceCents: entry.unitPriceCents,
        customUnitPriceCents: entry.customUnitPriceCents,
        lineTotalCents: entry.lineTotalCents,
        options: entry.options,
        optionLines: entry.optionLines,
      })),
      subtotalCents,
      taxCents,
      totalCents,
    };

    try {
      if (snapshot.items.length === 0) {
        window.localStorage.removeItem(POS_DISPLAY_STORAGE_KEY);
      } else {
        window.localStorage.setItem(
          POS_DISPLAY_STORAGE_KEY,
          JSON.stringify(snapshot),
        );
      }
    } catch (err) {
      console.warn("Failed to write POS display snapshot:", err);
    }
  }, [cartWithDetails, subtotalCents, taxCents, totalCents]);

  const handlePlaceOrder = () => {
    if (!hasItems) return;
    setIsPlacing(true);
    router.push(`/${locale}/store/pos/payment`);
  };

  const pauseOptions: Array<{ label: string; payload: { durationMinutes?: number; untilTomorrow?: boolean } }> = [
    { label: isZh ? "15分钟" : "15 min", payload: { durationMinutes: 15 } },
    { label: isZh ? "30分钟" : "30 min", payload: { durationMinutes: 30 } },
    { label: isZh ? "1小时" : "1 hour", payload: { durationMinutes: 60 } },
    { label: isZh ? "2小时" : "2 hours", payload: { durationMinutes: 120 } },
    { label: isZh ? "3小时" : "3 hours", payload: { durationMinutes: 180 } },
    { label: isZh ? "至明天" : "Until tomorrow", payload: { untilTomorrow: true } },
  ];

  const handlePauseCustomerOrdering = async (payload: {
    durationMinutes?: number;
    untilTomorrow?: boolean;
  }) => {
    try {
      setCustomerStatusSaving(true);
      const data = await pauseCustomerOrderingFromPos(payload);
      setCustomerOrderingStatus(data);
      setShowPauseMenu(false);
    } catch (error) {
      console.error("Failed to pause customer ordering", error);
    } finally {
      setCustomerStatusSaving(false);
    }
  };

  const handleResumeCustomerOrdering = async () => {
    try {
      setCustomerStatusSaving(true);
      const data = await resumeCustomerOrderingFromPos();
      setCustomerOrderingStatus(data);
      setShowPauseMenu(false);
    } catch (error) {
      console.error("Failed to resume customer ordering", error);
    } finally {
      setCustomerStatusSaving(false);
    }
  };

  return (
    <main className="min-h-screen bg-slate-900 text-slate-50">
      <header className="flex items-center justify-between px-6 py-4 border-b border-slate-700">
        <div>
          <h1 className="text-2xl font-semibold">{t.title}</h1>
          <p className="text-sm text-slate-300">{t.subtitle}</p>
          {storeStatusDetail && (
            <p className="mt-1 max-w-xl text-xs text-rose-200">
              {storeStatusDetail}
            </p>
          )}
          {storeStatusError && (
            <p className="mt-1 max-w-xl text-[11px] text-amber-300">
              {storeStatusError}
            </p>
          )}
          {isCustomerPaused && customerOrderingStatus?.autoResumeAt && (
            <p className="mt-1 max-w-xl text-[11px] text-amber-200">
              {t.autoResumeAtPrefix}
              {formatStoreTime(
                customerOrderingStatus.autoResumeAt,
                storeStatus?.timezone ?? "America/Toronto",
                isZh ? "zh" : "en",
              )}
            </p>
          )}
        </div>
        <div className="flex items-center gap-2">
          <Link
            href={`/${locale}/store/pos/summary`}
            className="rounded-full border border-slate-600 bg-slate-800 px-6 py-2 text-base font-semibold text-slate-100 hover:border-slate-400 hover:text-white"
          >
            {t.summary}
          </Link>
          <Link
            href={`/${locale}/store/pos/membership`}
            className="rounded-full border border-slate-600 bg-slate-800 px-6 py-2 text-base font-semibold text-slate-100 hover:border-slate-400 hover:text-white"
          >
            {t.memberManage}
          </Link>
          <Link
            href={`/${locale}/store/pos/menu`}
            className="rounded-full border border-slate-600 bg-slate-800 px-6 py-2 text-base font-semibold text-slate-100 hover:border-slate-400 hover:text-white"
          >
            {t.menuManage}
          </Link>
          <Link
            href={`/${locale}/store/pos/orders`}
            className="rounded-full border border-slate-600 bg-slate-800 px-6 py-2 text-base font-semibold text-slate-100 hover:border-slate-400 hover:text-white"
          >
            {t.orderManage}
          </Link>
          {storeStatusLoading || customerStatusLoading ? (
            <span className="rounded-full border border-slate-600 bg-slate-800 px-6 py-2 text-base font-semibold text-slate-200">
              {t.storeStatusLoading}
            </span>
          ) : (
            <div className="relative">
              <button
                type="button"
                onClick={() => {
                  if (isCustomerPaused) {
                    void handleResumeCustomerOrdering();
                  } else {
                    setShowPauseMenu((prev) => !prev);
                  }
                }}
                disabled={customerStatusSaving}
                className={`rounded-full border px-6 py-2 text-base font-semibold ${
                  isCustomerOrderingOpen
                    ? "border-emerald-400/60 bg-emerald-500/10 text-emerald-200"
                    : "border-rose-400/60 bg-rose-500/10 text-rose-200"
                } ${customerStatusSaving ? "opacity-70" : ""}`}
              >
                {customerStatusSaving
                  ? isCustomerPaused
                    ? t.resuming
                    : t.pausing
                  : customerStatusLabel}
              </button>
              {!isCustomerPaused && showPauseMenu && (
                <div className="absolute right-0 z-30 mt-2 w-52 rounded-2xl border border-slate-600 bg-slate-800 p-2 shadow-xl">
                  <div className="px-2 py-1 text-xs text-slate-300">{t.pauseActionLabel}</div>
                  {pauseOptions.map((option) => (
                    <button
                      key={option.label}
                      type="button"
                      onClick={() => void handlePauseCustomerOrdering(option.payload)}
                      className="block w-full rounded-xl px-3 py-2 text-left text-sm text-slate-100 hover:bg-slate-700"
                    >
                      {option.label}
                    </button>
                  ))}
                </div>
              )}
            </div>
          )}
        </div>
      </header>

      <section className="flex gap-4 p-4 h-[calc(100vh-4rem)]">
        {/* 左侧：菜单（大按钮） */}
        <div className="relative flex-1 flex flex-col min-w-0">
          <div className="flex gap-2 mb-3">
            <button
              type="button"
              onClick={() => setActiveCategoryId("all")}
              className={`px-4 py-2 rounded-2xl text-sm font-medium ${
                activeCategoryId === "all"
                  ? "bg-slate-100 text-slate-900"
                  : "bg-slate-800 text-slate-100"
              }`}
            >
              {t.categoriesAll}
            </button>
            {menuCategories.map((cat) => (
              <button
                key={cat.stableId}
                type="button"
                onClick={() => setActiveCategoryId(cat.stableId)}
                className={`px-4 py-2 rounded-2xl text-sm font-medium ${
                  activeCategoryId === cat.stableId
                    ? "bg-slate-100 text-slate-900"
                    : "bg-slate-800 text-slate-100"
                }`}
              >
                {cat.name}
              </button>
            ))}
          </div>

          <div className="flex-1 overflow-auto pr-1">
            <div className="grid gap-3 lg:grid-cols-2 xl:grid-cols-3 auto-rows-[150px]">
              {visibleItems.map((item) => {
                const unitPriceCents = Math.round(item.price * 100);
                const isDailySpecial = Boolean(item.activeSpecial);
                return (
                  <div
                    key={item.stableId}
                    role="button"
                    tabIndex={0}
                    onClick={() => {
                      if (!item.optionGroups || item.optionGroups.length === 0) {
                        const lineId = `line-${Date.now()}-${Math.random()}`;
                        setCart((prev) => [
                          ...prev,
                          {
                            lineId,
                            stableId: item.stableId,
                            quantity: 1,
                            customUnitPriceCents: Math.round(item.price * 100),
                          },
                        ]);
                        return;
                      }
                      openOptionDialog(item);
                    }}
                    onKeyDown={(e) => {
                      if (e.key === "Enter" || e.key === " ") {
                        e.preventDefault();
                        if (!item.optionGroups || item.optionGroups.length === 0) {
                          const lineId = `line-${Date.now()}-${Math.random()}`;
                          setCart((prev) => [
                            ...prev,
                            {
                              lineId,
                              stableId: item.stableId,
                              quantity: 1,
                              customUnitPriceCents: Math.round(item.price * 100),
                            },
                          ]);
                          return;
                        }
                        openOptionDialog(item);
                      }
                    }}
                    className="flex flex-col justify-between rounded-3xl bg-slate-800 hover:bg-slate-700 active:scale-[0.99] transition-transform p-3 text-left"
                  >
                    <div className="flex items-start justify-between gap-2">
                      <div className="space-y-1">
                        {isDailySpecial ? (
                          <span className="inline-flex rounded-full bg-amber-500/90 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-white">
                            {isZh ? "特价" : "Daily special"}
                          </span>
                        ) : null}
                        <div className="font-semibold text-lg leading-snug">
                          {item.name}
                        </div>
                      </div>
                      <div className="text-base font-bold">
                        {formatMoney(unitPriceCents)}
                      </div>
                    </div>

                    <div className="flex items-center justify-between mt-2">
                      <span className="text-[11px] text-slate-400">
                        {item.optionGroups && item.optionGroups.length > 0
                          ? t.chooseOptions
                          : t.tapToAdd}
                      </span>
                    </div>
                  </div>
                );
              })}
            </div>
          {editingLineId && (
            <div className="pointer-events-auto absolute bottom-4 left-4 z-20 w-[22rem] rounded-2xl border border-slate-600 bg-slate-900/95 p-3 shadow-2xl">
              <div className="mb-2 text-xs text-slate-300">
                {isZh ? "价格快捷输入" : "Quick price keypad"}
              </div>
              <div className="grid grid-cols-3 gap-3">
                {["1", "2", "3", "4", "5", "6", "7", "8", "9", "00", "0", "back"].map((key) => (
                  <button
                    key={key}
                    type="button"
                    onMouseDown={(event) => event.preventDefault()}
                    onClick={() => appendKeypadValue(key)}
                    className="h-16 rounded-xl bg-slate-800 text-xl font-semibold text-slate-100 hover:bg-slate-700"
                  >
                    {key === "back" ? "⌫" : key}
                  </button>
                ))}
                <button
                  type="button"
                  onMouseDown={(event) => event.preventDefault()}
                  onClick={() => appendKeypadValue("clear")}
                  className="col-span-3 h-14 rounded-xl bg-rose-500/20 text-base font-semibold text-rose-200 hover:bg-rose-500/30"
                >
                  {isZh ? "清空价格" : "Clear price"}
                </button>
              </div>
            </div>
          )}

          </div>
        </div>

        {/* 右侧：购物车部分 */}
        <div className="w-full max-w-md flex flex-col rounded-3xl bg-slate-800/80 border border-slate-700 p-4">
          <h2 className="text-lg font-semibold mb-2">{t.cartTitle}</h2>

          <div className="flex-1 overflow-auto pr-1">
            {cartWithDetails.length === 0 ? (
              <div className="mt-8 text-center text-slate-400 text-sm">
                {t.emptyCart}
              </div>
            ) : (
              <ul className="space-y-2">
                {cartWithDetails.map((item) => (
                  <li key={item.lineId} className="rounded-2xl bg-slate-900/60 px-3 py-2">
                    <div className="flex items-center justify-between gap-2">
                      <div className="flex-1 text-sm font-medium">
                        <span>{item.item.name}</span>
                        <span className="mx-2 text-xs text-slate-400">*{item.quantity}</span>
                        <input
                          type="text"
                          inputMode="decimal"
                          value={(item.unitPriceCents / 100).toFixed(2)}
                          onFocus={() => setEditingLineId(item.lineId)}
                          onBlur={() =>
                            setEditingLineId((prev) => (prev === item.lineId ? null : prev))
                          }
                          onChange={(e) => updateCartLinePrice(item.lineId, e.target.value)}
                          className="h-8 w-24 rounded-xl border border-slate-600 bg-slate-800 px-2 text-right text-sm text-slate-100"
                        />
                      </div>
                    </div>

                    {item.optionLines.length > 0 && (
                      <div className="mt-1 space-y-1 pl-1">
                        {item.optionLines.map((optionLine, idx) => (
                          <div
                            key={`${item.lineId}-${optionLine.labelZh}-${optionLine.labelEn}-${idx}`}
                            className="flex items-center justify-between text-xs text-slate-400"
                          >
                            <span>{isZh ? optionLine.labelZh : optionLine.labelEn}</span>
                            <span>
                              {optionLine.priceCents >= 0 ? "+" : "-"}
                              {formatMoney(Math.abs(optionLine.priceCents))}
                            </span>
                          </div>
                        ))}
                      </div>
                    )}

                    <div className="mt-2 flex items-center justify-end gap-2">
                      <button
                        type="button"
                        onClick={() => {
                          setCart((prev) =>
                            prev
                              .map((entry) =>
                                entry.lineId === item.lineId
                                  ? { ...entry, quantity: entry.quantity - 1 }
                                  : entry,
                              )
                              .filter((entry) => entry.quantity > 0),
                          );
                        }}
                        className="w-8 h-8 rounded-full bg-slate-800 flex items-center justify-center text-lg leading-none"
                      >
                        −
                      </button>
                      <span className="min-w-[1.5rem] text-center text-sm font-semibold">
                        {item.quantity}
                      </span>
                      <button
                        type="button"
                        onClick={() => {
                          setCart((prev) =>
                            prev.map((entry) =>
                              entry.lineId === item.lineId
                                ? { ...entry, quantity: entry.quantity + 1 }
                                : entry,
                            ),
                          );
                        }}
                        className="w-8 h-8 rounded-full bg-emerald-500 text-slate-900 flex items-center justify-center text-lg leading-none"
                      >
                        +
                      </button>
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </div>


          <div className="mt-4 border-t border-slate-700 pt-3 space-y-1 text-sm">
            <div className="flex justify-between">
              <span className="text-slate-300">{t.subtotal}</span>
              <span>{formatMoney(subtotalCents)}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-slate-300">{t.tax}</span>
              <span>{formatMoney(taxCents)}</span>
            </div>
            <div className="flex justify-between text-base font-semibold">
              <span>{t.total}</span>
              <span>{formatMoney(totalCents)}</span>
            </div>
          </div>

          <div className="mt-4 flex gap-3">
            <button
              type="button"
              onClick={clearCart}
              className="flex-1 h-12 rounded-2xl border border-slate-600 text-sm font-medium hover:bg-slate-700"
            >
              {t.clearCart}
            </button>
            <button
              type="button"
              disabled={!hasItems || isPlacing}
              onClick={handlePlaceOrder}
              className={`flex-[1.5] h-12 rounded-2xl text-sm font-semibold ${
                !hasItems || isPlacing
                  ? "bg-slate-500 text-slate-200"
                  : "bg-emerald-500 text-slate-900 hover:bg-emerald-400"
              }`}
            >
              {isPlacing ? t.placing : t.placeOrder}
            </button>
          </div>
        </div>
      </section>

      <StoreBoardWidget locale={locale} />

      {lastOrderInfo && (
        <div className="fixed inset-0 z-40 flex items-center justify-center bg-black/50">
          <div className="w-full max-w-sm rounded-3xl bg-slate-900 border border-slate-700 p-6 text-center">
            <h3 className="text-lg font-semibold mb-2">{t.successTitle}</h3>
            <p className="text-sm text-slate-300 mb-3">{t.successBody}</p>
            <div className="mb-4 space-y-1 text-sm">
              <div>
                {isZh ? "订单号：" : "Order:"}{" "}
                <span className="font-mono font-semibold">
                  {lastOrderInfo.orderNumber}
                </span>
              </div>
              {lastOrderInfo.pickupCode && (
                <div>
                  {isZh ? "取餐码：" : "Pickup code:"}{" "}
                  <span className="font-mono font-bold text-2xl">
                    {lastOrderInfo.pickupCode}
                  </span>
                </div>
              )}
            </div>
            <button
              type="button"
              onClick={() => setLastOrderInfo(null)}
              className="mt-2 inline-flex items-center justify-center px-4 py-2 rounded-2xl bg-slate-100 text-slate-900 text-sm font-medium hover:bg-white"
            >
              {t.close}
            </button>
          </div>
        </div>
      )}

      {activeItem && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 px-4">
          <div className="w-full max-w-2xl rounded-3xl bg-slate-900 border border-slate-700 p-6 text-slate-100">
            <div className="flex items-start justify-between gap-4">
              <div>
                <h3 className="text-xl font-semibold">{t.optionDialogTitle}</h3>
                <p className="text-sm text-slate-300">
                  {t.optionDialogSubtitle}
                </p>
              </div>
              <button
                type="button"
                onClick={() => setActiveItem(null)}
                className="rounded-full border border-slate-600 px-3 py-1 text-xs text-slate-200 hover:border-slate-400"
              >
                {t.close}
              </button>
            </div>

            <div className="mt-4 space-y-4 max-h-[60vh] overflow-auto pr-1">
              {activeOptionGroups.map(({ group, key }) => {
                const groupName =
                  locale === "zh" && group.template.nameZh
                    ? group.template.nameZh
                    : group.template.nameEn;
                const selection = activeItem.selected[key] ?? [];
                const minSelect = group.minSelect ?? 0;
                const maxSelect = group.maxSelect ?? null;

                return (
                  <div
                    key={key}
                    className="rounded-2xl border border-slate-700 bg-slate-800/70 p-4"
                  >
                    <div className="flex items-center justify-between">
                      <div>
                        <div className="text-base font-semibold">
                          {groupName}
                        </div>
                        <div className="text-xs text-slate-400">
                          {t.optionLimit(minSelect, maxSelect)}
                        </div>
                      </div>
                      {minSelect > 0 && selection.length < minSelect && (
                        <span className="rounded-full border border-rose-400/70 bg-rose-500/10 px-2 py-0.5 text-[11px] text-rose-200">
                          {t.optionsRequired}
                        </span>
                      )}
                    </div>

                    {/* ✅ 修复渲染逻辑：先渲染父选项，再渲染子选项 */}
                    <div className="mt-3 grid gap-2 sm:grid-cols-2">
                      {group.options
                        // 1. 过滤：只显示顶层选项 (没有 parentOptionStableIds 的)
                        .filter(
                          (opt) =>
                            !opt.parentOptionStableIds ||
                            opt.parentOptionStableIds.length === 0,
                        )
                        .map((parentOption) => {
                          const selected = selection.includes(
                            parentOption.optionStableId,
                          );
                          const optionName =
                            locale === "zh" && parentOption.nameZh
                              ? parentOption.nameZh
                              : parentOption.nameEn;

                          const priceDeltaLabel =
                            parentOption.priceDeltaCents > 0
                              ? `+${formatMoney(parentOption.priceDeltaCents)}`
                              : parentOption.priceDeltaCents < 0
                                ? `-${formatMoney(
                                    Math.abs(parentOption.priceDeltaCents),
                                  )}`
                                : "";

                          // 2. 查找该父项的子选项
                          const childOptions = group.options.filter((child) =>
                            parentOption.childOptionStableIds?.includes(
                              child.optionStableId,
                            ),
                          );

                          return (
                            <div
                              key={parentOption.optionStableId}
                              className="flex flex-col gap-2"
                            >
                              {/* 父选项按钮 */}
                              <button
                                type="button"
                                onClick={() =>
                                  updateOptionSelection(
                                    key,
                                    parentOption.optionStableId,
                                    maxSelect,
                                    group.options, // 👈 传入完整选项列表
                                  )
                                }
                                className={`rounded-2xl border px-3 py-3 text-left text-sm transition ${
                                  selected
                                    ? "border-emerald-400 bg-emerald-500/10 text-emerald-100"
                                    : "border-slate-600 bg-slate-900 text-slate-200 hover:border-slate-400"
                                }`}
                              >
                                <div className="flex items-center justify-between gap-2">
                                  <span>{optionName}</span>
                                  {priceDeltaLabel && (
                                    <span className="text-xs text-slate-300">
                                      {priceDeltaLabel}
                                    </span>
                                  )}
                                </div>
                              </button>

                              {/* 3. 子选项渲染：仅当父项选中且有子项时显示 */}
                              {selected && childOptions.length > 0 && (
                                <div className="ml-4 flex flex-col gap-2 border-l-2 border-slate-700 pl-3">
                                  {childOptions.map((child) => {
                                    const childSelected = selection.includes(
                                      child.optionStableId,
                                    );
                                    const childName =
                                      locale === "zh" && child.nameZh
                                        ? child.nameZh
                                        : child.nameEn;
                                    const childPrice =
                                      child.priceDeltaCents > 0
                                        ? `+${formatMoney(child.priceDeltaCents)}`
                                        : "";

                                    return (
                                      <button
                                        key={child.optionStableId}
                                        type="button"
                                        onClick={() =>
                                          updateOptionSelection(
                                            key,
                                            child.optionStableId,
                                            maxSelect,
                                            group.options,
                                          )
                                        }
                                        className={`rounded-xl border px-3 py-2 text-left text-xs transition ${
                                          childSelected
                                            ? "border-emerald-400/70 bg-emerald-500/20 text-emerald-100"
                                            : "border-slate-700 bg-slate-800 text-slate-300 hover:bg-slate-700"
                                        }`}
                                      >
                                        <div className="flex items-center justify-between">
                                          <span>{childName}</span>
                                          {childPrice && (
                                            <span>{childPrice}</span>
                                          )}
                                        </div>
                                      </button>
                                    );
                                  })}
                                </div>
                              )}
                            </div>
                          );
                        })}
                    </div>
                  </div>
                );
              })}
            </div>

            {requiredGroupsMissing.length > 0 && (
              <div className="mt-4 rounded-2xl border border-rose-400/70 bg-rose-500/10 px-3 py-2 text-xs text-rose-200">
                {t.optionsRequired}
              </div>
            )}

            <div className="mt-5 flex flex-wrap items-center justify-between gap-3">
              <div className="flex items-center gap-3">
                <span className="text-sm text-slate-300">{t.qtyLabel}</span>
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={() =>
                      setActiveItem((prev) =>
                        prev
                          ? {
                              ...prev,
                              quantity: Math.max(1, prev.quantity - 1),
                            }
                          : prev,
                      )
                    }
                    className="w-8 h-8 rounded-full bg-slate-800 flex items-center justify-center text-lg leading-none"
                  >
                    −
                  </button>
                  <span className="min-w-[2ch] text-center text-base font-semibold">
                    {activeItem.quantity}
                  </span>
                  <button
                    type="button"
                    onClick={() =>
                      setActiveItem((prev) =>
                        prev ? { ...prev, quantity: prev.quantity + 1 } : prev,
                      )
                    }
                    className="w-8 h-8 rounded-full bg-emerald-500 text-slate-900 flex items-center justify-center text-lg leading-none"
                  >
                    +
                  </button>
                </div>
              </div>
              <button
                type="button"
                disabled={!canAddToCart}
                onClick={addActiveItemToCart}
                className={`h-11 rounded-2xl px-6 text-sm font-semibold ${
                  canAddToCart
                    ? "bg-emerald-500 text-slate-900 hover:bg-emerald-400"
                    : "bg-slate-600 text-slate-300"
                }`}
              >
                {t.addToCart}
              </button>
            </div>
          </div>
        </div>
      )}

    </main>
  );
}
