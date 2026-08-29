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
  buildLocalizedMenuFromDb,
  type LocalizedDailySpecial,
  type LocalizedMenuItem,
  type PublicMenuCategory,
} from "@/lib/menu/menu-transformer";
import type {
  PublicMenuResponse as PublicMenuApiResponse,
  MenuOptionGroupWithOptionsDto,
  OptionChoiceDto,
} from "@shared/menu";
import { usePersistentCart } from "@/lib/cart";
import { apiFetch } from "@/lib/api/client";
import { useSession } from "@/lib/auth-session";
import { trackClientEvent } from "@/lib/analytics";
import CustomerModalShell, {
  CustomerModalHeader,
} from "@/components/site/CustomerModalShell";
import {
  getDefaultHomepageContent,
  type HomepageContent,
  type HomepageFeaturedItem,
} from "@/lib/homepage-content";

type StoreStatus = {
  publicNotice: string | null;
  publicNoticeEn: string | null;
  today: {
    isClosed: boolean;
    openMinutes: number | null;
    closeMinutes: number | null;
  };
};

type BeforeInstallPromptEvent = Event & {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed"; platform: string }>;
};

function isIosDevice() {
  if (typeof navigator === "undefined") return false;

  return /iphone|ipad|ipod/i.test(navigator.userAgent);
}

function isInStandaloneMode() {
  if (typeof window === "undefined") return false;

  return window.matchMedia?.("(display-mode: standalone)").matches ?? false;
}

export default function LocalOrderPage() {
  const params = useParams<{ locale?: string }>();
  const locale = (params?.locale === "zh" ? "zh" : "en") as Locale;

  const router = useRouter();
  const searchParams = useSearchParams();
  const q = searchParams?.toString();

  const { data: session } = useSession();
  const isMemberLoggedIn = Boolean(
    session?.user?.role === "CUSTOMER" && session.user.userStableId,
  );

  const strings = UI_STRINGS[locale];

  // —— 菜单：从后端 public API 读取 —— //
  const [menu, setMenu] = useState<PublicMenuCategory[]>([]);
  const [menuLoading, setMenuLoading] = useState(true);
  const [menuError, setMenuError] = useState<string | null>(null);
  const [dailySpecials, setDailySpecials] = useState<LocalizedDailySpecial[]>(
    [],
  );
  const [cartNotice] = useState<string | null>(null);
  const [storeStatus, setStoreStatus] = useState<StoreStatus | null>(null);
  const [storeStatusLoading, setStoreStatusLoading] = useState(true);
  const [storeStatusError, setStoreStatusError] = useState<string | null>(null);
  const [installPromptEvent, setInstallPromptEvent] =
    useState<BeforeInstallPromptEvent | null>(null);
  const [installFeedback, setInstallFeedback] = useState<string | null>(null);
  const [isIosInstallHintVisible, setIsIosInstallHintVisible] = useState(false);
  const [isStandalone, setIsStandalone] = useState(false);
  const [isCartPreviewOpen, setIsCartPreviewOpen] = useState(false);
  const [homeContent, setHomeContent] = useState<HomepageContent>(() =>
    getDefaultHomepageContent(locale),
  );
  const [featuredConfigItems, setFeaturedConfigItems] = useState<HomepageFeaturedItem[]>([]);

  useEffect(() => {
    trackClientEvent("customer_home_viewed", {
      locale,
      entry: isInStandaloneMode() ? "standalone" : "browser",
    });

    setIsStandalone(isInStandaloneMode());

    const handleBeforeInstallPrompt = (event: Event) => {
      event.preventDefault();
      setInstallPromptEvent(event as BeforeInstallPromptEvent);
      setInstallFeedback(null);
      trackClientEvent("pwa_beforeinstallprompt_fired", { locale });
    };

    const handleAppInstalled = () => {
      setInstallPromptEvent(null);
      setInstallFeedback(strings.installAppAdded);
      setIsStandalone(true);
      trackClientEvent("pwa_appinstalled", { locale });
    };

    const handleDisplayModeChange = () => {
      setIsStandalone(isInStandaloneMode());
    };

    window.addEventListener("beforeinstallprompt", handleBeforeInstallPrompt);
    window.addEventListener("appinstalled", handleAppInstalled);
    window
      .matchMedia("(display-mode: standalone)")
      .addEventListener("change", handleDisplayModeChange);

    return () => {
      window.removeEventListener(
        "beforeinstallprompt",
        handleBeforeInstallPrompt,
      );
      window.removeEventListener("appinstalled", handleAppInstalled);
      window
        .matchMedia("(display-mode: standalone)")
        .removeEventListener("change", handleDisplayModeChange);
    };
  }, [locale, strings.installAppAdded]);

  const handleInstallApp = useCallback(async () => {
    if (isIosDevice()) {
      trackClientEvent("pwa_install_button_clicked", {
        locale,
        channel: "ios_hint",
      });
      setIsIosInstallHintVisible(true);
      setInstallFeedback(null);
      return;
    }

    if (!installPromptEvent) {
      trackClientEvent("pwa_install_button_clicked", {
        locale,
        channel: "prompt_unavailable",
      });
      setInstallFeedback(strings.installAppUnavailable);
      return;
    }

    trackClientEvent("pwa_install_button_clicked", {
      locale,
      channel: "browser_prompt",
    });

    await installPromptEvent.prompt();
    const { outcome } = await installPromptEvent.userChoice;
    trackClientEvent("pwa_install_prompt_result", {
      locale,
      outcome,
    });

    if (outcome === "accepted") {
      setInstallFeedback(strings.installAppAdded);
    }

    setInstallPromptEvent(null);
  }, [installPromptEvent, locale, strings.installAppAdded, strings.installAppUnavailable]);


  const shouldShowInstallButton = !isStandalone && (Boolean(installPromptEvent) || isIosDevice());

  useEffect(() => {
    let cancelled = false;
    setHomeContent(getDefaultHomepageContent(locale));
    setFeaturedConfigItems([]);

    async function loadHomepageContent() {
      try {
        const content = await apiFetch<HomepageContent>(
          `/homepage/content?locale=${locale}`,
          { cache: "no-store" },
        );
        if (!cancelled) setHomeContent(content);
      } catch (error) {
        console.error("Failed to load homepage content", error);
      }
    }

    async function loadFeaturedItems() {
      try {
        const featured = await apiFetch<{ items: HomepageFeaturedItem[] }>(
          `/homepage/featured?locale=${locale}`,
          { cache: "no-store" },
        );
        if (!cancelled) setFeaturedConfigItems(featured.items ?? []);
      } catch (error) {
        console.error("Failed to load homepage featured items", error);
      }
    }

    void loadHomepageContent();
    void loadFeaturedItems();
    return () => {
      cancelled = true;
    };
  }, [locale]);

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

  const {
    addItem,
    totalQuantity,
    items: cartItems,
    removeItemsByStableId,
    updateQuantity,
  } = usePersistentCart();
  const [activeItem, setActiveItem] = useState<LocalizedMenuItem | null>(null);
  const [selectedQuantity, setSelectedQuantity] = useState(1);
  const [selectedDailySpecial, setSelectedDailySpecial] =
    useState<LocalizedDailySpecial | null>(null);

  // 选中的选项：Record<PathKey, OptionStableId[]>
  const [selectedOptions, setSelectedOptions] = useState<
    Record<string, string[]>
  >({});

  // 子选项：Record<ParentOptionPathKey, ChildOptionStableId[]>
  const [selectedChildOptions, setSelectedChildOptions] = useState<
    Record<string, string[]>
  >({});
  const [expandedOptionalGroups, setExpandedOptionalGroups] = useState<
    Record<string, boolean>
  >({});

  const displayedMenu = useMemo(
    () =>
      menu
        .map((category) => ({
          ...category,
          items: category.items.filter((item) => item.isVisibleOnMainMenu),
        }))
        .filter((category) => category.items.length > 0),
    [menu],
  );
  const [activeCategoryStableId, setActiveCategoryStableId] = useState<
    string | null
  >(null);
  const [hasReachedFullMenu, setHasReachedFullMenu] = useState(false);

  useEffect(() => {
    if (displayedMenu.length === 0) {
      setActiveCategoryStableId(null);
      return;
    }

    const syncActiveCategory = () => {
      const stickyOffset = window.innerWidth >= 1024 ? 152 : 144;
      let nextActive = displayedMenu[0]?.stableId ?? null;

      for (const category of displayedMenu) {
        const element = document.getElementById(
          `category-${category.stableId}`,
        );
        if (!element) continue;
        if (element.getBoundingClientRect().top <= stickyOffset) {
          nextActive = category.stableId;
        } else {
          break;
        }
      }

      if (
        window.innerHeight + window.scrollY >=
        document.documentElement.scrollHeight - 2
      ) {
        nextActive =
          displayedMenu[displayedMenu.length - 1]?.stableId ?? nextActive;
      }

      setActiveCategoryStableId((current) =>
        current === nextActive ? current : nextActive,
      );
    };

    syncActiveCategory();
    window.addEventListener("scroll", syncActiveCategory, { passive: true });
    window.addEventListener("resize", syncActiveCategory);
    return () => {
      window.removeEventListener("scroll", syncActiveCategory);
      window.removeEventListener("resize", syncActiveCategory);
    };
  }, [displayedMenu]);

  useEffect(() => {
    if (!activeCategoryStableId) return;
    const activeTab = document.getElementById(
      `category-tab-${activeCategoryStableId}`,
    );
    const scrollContainer = activeTab?.parentElement?.parentElement;
    if (!activeTab || !(scrollContainer instanceof HTMLElement)) return;

    const centeredLeft =
      activeTab.offsetLeft -
      (scrollContainer.clientWidth - activeTab.offsetWidth) / 2;
    scrollContainer.scrollTo({
      left: Math.max(0, centeredLeft),
      behavior: "smooth",
    });
  }, [activeCategoryStableId]);

  useEffect(() => {
    if (displayedMenu.length === 0) {
      setHasReachedFullMenu(false);
      return;
    }

    const syncCartCtaVisibility = () => {
      const menuSection = document.getElementById("menu");
      if (!menuSection) {
        setHasReachedFullMenu(false);
        return;
      }

      const triggerLine = Math.max(0, window.innerHeight - 96);
      const reached = menuSection.getBoundingClientRect().top <= triggerLine;
      setHasReachedFullMenu((current) =>
        current === reached ? current : reached,
      );
    };

    syncCartCtaVisibility();
    window.addEventListener("scroll", syncCartCtaVisibility, { passive: true });
    window.addEventListener("resize", syncCartCtaVisibility);
    return () => {
      window.removeEventListener("scroll", syncCartCtaVisibility);
      window.removeEventListener("resize", syncCartCtaVisibility);
    };
  }, [displayedMenu.length]);

  // Map: ID -> Item
  const menuItemMap = useMemo(
    () =>
      new Map(
        menu.flatMap((category) =>
          category.items.map((item) => [item.stableId, item]),
        ),
      ),
    [menu],
  );

  // Map: Name -> Item (Fallback)
  const menuItemMapByName = useMemo(() => {
    const map = new Map<string, LocalizedMenuItem>();
    menu.forEach((category) => {
      category.items.forEach((item) => {
        if (item.name) map.set(item.name.trim(), item);
        // 同时建立中英文映射，增加匹配几率
        if (item.nameEn) map.set(item.nameEn.trim(), item);
        if (item.nameZh) map.set(item.nameZh.trim(), item);
      });
    });
    return map;
  }, [menu]);

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
    const allowedStableIds = new Set(
      menu.flatMap((category) =>
        category.items.map((item) => item.stableId),
      ),
    );

    const invalidItems = cartItems.filter(
      (item) => !allowedStableIds.has(item.productStableId),
    );
    if (invalidItems.length === 0) return;

    removeItemsByStableId(
      invalidItems.map((item) => item.productStableId),
    );
  }, [cartItems, menu, menuError, menuLoading, removeItemsByStableId]);

  const closeOptionsModal = () => {
    setActiveItem(null);
    setSelectedOptions({});
    setSelectedChildOptions({});
    setExpandedOptionalGroups({});
    setSelectedQuantity(1);
    setSelectedDailySpecial(null);
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
      const groupName = locale === "zh"
        ? group.template.nameZh?.trim() || "未命名选项组"
        : group.template.nameEn;
      selectedIds.forEach((optionId) => {
        const option = optionById.get(optionId);
        if (!option) return;
        const optionName = locale === "zh"
          ? option.nameZh?.trim() || "未命名选项"
          : option.nameEn;
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
          const optionName = locale === "zh"
            ? childOption.nameZh?.trim() || "未命名选项"
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
      const name = locale === "zh"
        ? option.nameZh?.trim() || "未命名选项"
        : option.nameEn;

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

  const activeBasePriceCents =
    selectedDailySpecial && activeItem && selectedDailySpecial.itemStableId === activeItem.stableId
      ? selectedDailySpecial.effectivePriceCents
      : Math.round((activeItem?.price ?? 0) * 100);

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

  const cartPreviewItems = useMemo(
    () =>
      cartItems.map((entry) => {
        const menuItem = menuItemMap.get(entry.productStableId);
        const itemName = menuItem?.name ?? entry.productStableId;
        const optionNames = Object.values(entry.options ?? {})
          .flat()
          .map((option) => option.name)
          .filter((name): name is string => Boolean(name));

        return {
          cartLineId: entry.cartLineId,
          name: itemName,
          quantity: entry.quantity,
          optionNames,
        };
      }),
    [cartItems, menuItemMap],
  );

  const openCartPreview = useCallback(
    (source: "hero" | "header" | "sticky" | "floating") => {
      trackClientEvent("customer_home_checkout_clicked", { locale, source });
      setIsCartPreviewOpen(true);
    },
    [locale],
  );

  useEffect(() => {
    const handleHeaderCart = () => openCartPreview("header");
    window.addEventListener("sanq:open-cart", handleHeaderCart);
    if (searchParams?.get("cart") === "1") {
      openCartPreview("header");
    }
    return () => window.removeEventListener("sanq:open-cart", handleHeaderCart);
  }, [openCartPreview, searchParams]);

  const handleConfirmOrder = useCallback(() => {
    setIsCartPreviewOpen(false);
    router.push(checkoutHref);
  }, [checkoutHref, router]);

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
      : storeStatus?.publicNoticeEn?.trim() ?? "";

  const featuredItems = useMemo(() => {
    const itemByStableId = new Map(
      displayedMenu
        .flatMap((category) => category.items)
        .map((item) => [item.stableId, item]),
    );

    return featuredConfigItems.flatMap((featured) => {
      const item = itemByStableId.get(featured.itemStableId);
      return item ? [{ ...item, featuredBadge: featured.badge }] : [];
    });
  }, [displayedMenu, featuredConfigItems]);

  const renderOptionGroup = (
    group: MenuOptionGroupWithOptionsDto,
    basePath: string[],
    groupIndex: number,
  ) => {
    const groupPath = [...basePath, buildGroupSegment(group, groupIndex)];
    const groupKey = buildPathKey(groupPath);
    const selectedCount = selectedOptions[groupKey]?.length ?? 0;
    const isRequiredGroup = group.minSelect > 0;
    const isExpanded =
      isRequiredGroup ||
      expandedOptionalGroups[groupKey] === true ||
      selectedCount > 0;
    
    const requirementLabel = (() => {
        if (group.minSelect > 0 && group.maxSelect) {
          return locale === "zh"
            ? `必选 ${group.minSelect} 项，最多 ${group.maxSelect} 项`
            : `Required: ${group.minSelect}-${group.maxSelect}`;
        }
        if (group.minSelect > 0) return locale === "zh" ? `至少选择 ${group.minSelect} 项` : `Pick at least ${group.minSelect}`;
        if (group.maxSelect) return locale === "zh" ? `最多选择 ${group.maxSelect} 项` : `Up to ${group.maxSelect}`;
        return locale === "zh" ? "可选" : "Optional";
    })();

    return (
        <div key={groupKey} className="space-y-3">
            <button
              type="button"
              onClick={() => {
                if (isRequiredGroup) return;
                setExpandedOptionalGroups((prev) => ({
                  ...prev,
                  [groupKey]: !prev[groupKey],
                }));
              }}
              className={`flex w-full items-center justify-between gap-4 rounded-2xl px-2 py-1 text-left transition ${
                isRequiredGroup
                  ? "cursor-default"
                  : "cursor-pointer hover:bg-[#fff3ea]"
              }`}
            >
            <div>
                <h4 className="text-base font-bold text-stone-900">
                {locale === "zh" ? group.template.nameZh?.trim() || "未命名选项组" : group.template.nameEn}
                </h4>
                <p className={`text-xs ${isRequiredGroup ? "text-rose-500" : "text-stone-500"}`}>
                  {requirementLabel}
                </p>
            </div>
            <span className="flex items-center gap-2">
                {!isRequiredGroup ? (
                  <span className="rounded-full border border-[#87362E]/15 bg-white px-2 py-1 text-xs font-bold text-[#87362E]/70">
                    {isExpanded
                      ? locale === "zh"
                        ? "收起"
                        : "Collapse"
                      : locale === "zh"
                        ? "点击展开"
                        : "Expand"}
                  </span>
                ) : null}
                <span className={`text-xs font-semibold ${group.minSelect > 0 && selectedCount < group.minSelect ? "text-rose-500" : "text-stone-400"}`}>
                    {locale === "zh" ? `已选 ${selectedCount}` : `${selectedCount} selected`}
                </span>
            </span>
            </button>

            {isExpanded ? (
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
                const optionLabel = locale === "zh"
                  ? option.nameZh?.trim() || "未命名选项"
                  : option.nameEn;

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
                            optionTempUnavailable ? "cursor-not-allowed border-stone-200 bg-stone-100 text-stone-400" : 
                            selected ? "border-[#87362E] bg-[#87362E] text-white shadow-sm" : 
                            "border-[#87362E]/15 bg-white text-stone-700 hover:border-[#87362E]/35 hover:bg-[#fff3ea]"
                        }`}
                    >
                    <span className="flex flex-col gap-1">
                        <span className="font-medium">{optionLabel}</span>
                        {optionTempUnavailable ? (
                        <span className="text-xs font-semibold text-amber-600">{locale === "zh" ? "当日售罄" : "Sold out today"}</span>
                        ) : null}
                    </span>
                    {priceDelta ? (
                        <span className={`text-xs font-semibold ${selected ? "text-white/80" : "text-stone-400"}`}>{priceDelta}</span>
                    ) : null}
                    </button>

                    {selected && childOptions.length > 0 ? (
                        <div className="grid gap-2 pl-2 md:grid-cols-2">
                             {childOptions.map((child) => {
                                const childSelected = selectedChildOptions[parentOptionPathKey]?.includes(child.optionStableId) ?? false;
                                const childTempUnavailable = isTempUnavailable(child.tempUnavailableUntil);
                                const childLabel = locale === "zh"
                                  ? child.nameZh?.trim() || "未命名选项"
                                  : child.nameEn;
                                const childPriceDelta = child.priceDeltaCents > 0 ? `+${currencyFormatter.format(child.priceDeltaCents / 100)}` : child.priceDeltaCents < 0 ? `-${currencyFormatter.format(Math.abs(child.priceDeltaCents) / 100)}` : "";

                                return (
                                    <button key={child.optionStableId} type="button" disabled={childTempUnavailable}
                                        onClick={() => childTempUnavailable ? undefined : handleChildOptionToggle(parentOptionPathKey, child.optionStableId)}
                                        className={`flex flex-col items-start gap-1 rounded-xl border px-3 py-2 text-left text-xs transition ${childTempUnavailable ? "cursor-not-allowed border-stone-200 bg-stone-100 text-stone-400" : childSelected ? "border-[#87362E] bg-[#87362E] text-white shadow-sm" : "border-[#87362E]/15 bg-white text-stone-600 hover:border-[#87362E]/35 hover:bg-[#fff3ea]"}`}
                                    >
                                        <span className="font-medium">{childLabel}</span>
                                        {childTempUnavailable && (
                                          <span className="text-[10px] font-semibold text-amber-600">
                                            {locale === "zh" ? "当日售罄" : "Sold out today"}
                                          </span>
                                        )}
                                        {childPriceDelta && (
                                          <span className={`text-[10px] font-semibold ${childSelected ? "text-white/80" : "text-stone-400"}`}>
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
                        <div className="mt-2 ml-2 space-y-4 border-l-2 border-[#87362E]/10 pl-3">
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
            ) : null}
        </div>
    );
  };

  return (
    <div className="space-y-8 pb-32 pt-3 sm:space-y-10 lg:pb-28 lg:pt-4">
      <section className="flex flex-col gap-2 rounded-2xl bg-[#87362E] px-4 py-3 text-white shadow-sm sm:flex-row sm:items-center sm:justify-between sm:px-5">
        <div className="flex items-center gap-2 text-sm font-bold">
          <span className="inline-block h-2.5 w-2.5 rounded-full bg-[#f4b75f]" />
          <span>{locale === "zh" ? "今日营业" : "Open today"}</span>
          <span className="text-white/60">·</span>
          <span>{hoursValue}</span>
          <span className="hidden text-white/60 sm:inline">·</span>
          <span className="hidden font-medium text-white/85 sm:inline">{locale === "zh" ? "自取 & 配送" : "Pickup & Delivery"}</span>
        </div>
        {publicNoticeText ? (
          <p className="text-xs font-medium text-white/80 sm:max-w-xl sm:text-right">
            {publicNoticeText}
          </p>
        ) : null}
      </section>

      <section className="relative overflow-hidden rounded-[2rem] border border-[#87362E]/10 bg-[#f8eee5] shadow-[0_24px_70px_-38px_rgba(100,45,38,0.55)]">
        <div className="grid lg:grid-cols-[0.9fr_1.1fr]">
          <div className="relative z-10 flex flex-col justify-center px-6 py-9 sm:px-10 sm:py-12 lg:min-h-[540px] lg:px-14 xl:px-16">
            <p className="mb-4 text-xs font-extrabold uppercase tracking-[0.24em] text-[#87362E] sm:text-sm">
              {homeContent.heroEyebrow}
            </p>
            <h1 className="max-w-2xl text-[2.6rem] font-black leading-[0.98] tracking-[-0.045em] text-[#2d211d] sm:text-6xl xl:text-7xl">
              {homeContent.heroTitle}
            </h1>
            <p className="mt-5 max-w-xl text-base leading-7 text-stone-600 sm:text-lg">
              {homeContent.heroDescription}
            </p>
            <div className="mt-7 flex flex-col gap-3 sm:flex-row">
              <Link href="#menu" className="inline-flex h-12 items-center justify-center rounded-full bg-[#87362E] px-7 text-sm font-extrabold text-white shadow-lg shadow-[#87362E]/20 transition hover:-translate-y-0.5 hover:bg-[#6f2c26]">
                {homeContent.heroPrimaryCtaLabel}
                <span className="ml-2 text-lg">→</span>
              </Link>
              <Link href={dailySpecials.length > 0 ? "#daily-special" : "#menu"} className="inline-flex h-12 items-center justify-center rounded-full border border-[#87362E]/35 bg-white/70 px-7 text-sm font-extrabold text-[#87362E] transition hover:bg-white">
                {homeContent.heroSecondaryCtaLabel}
              </Link>
            </div>
            <div className="mt-7 grid max-w-xl grid-cols-3 divide-x divide-[#87362E]/10 overflow-hidden rounded-2xl border border-[#87362E]/10 bg-white/70 text-center backdrop-blur">
              <div className="px-2 py-3">
                <div className="text-lg">♨</div>
                <p className="mt-1 text-[11px] font-bold text-stone-700 sm:text-xs">{locale === "zh" ? "每日现做" : "Made fresh"}</p>
              </div>
              <div className="px-2 py-3">
                <div className="text-lg">★</div>
                <p className="mt-1 text-[11px] font-bold text-stone-700 sm:text-xs">{locale === "zh" ? "招牌口味" : "Local favorite"}</p>
              </div>
              <div className="px-2 py-3">
                <div className="text-lg">↗</div>
                <p className="mt-1 text-[11px] font-bold text-stone-700 sm:text-xs">{locale === "zh" ? "自取配送" : "Pickup & delivery"}</p>
              </div>
            </div>
          </div>

          <div className="relative min-h-[320px] overflow-hidden bg-[#ead8c8] sm:min-h-[390px] lg:min-h-[540px]">
            {homeContent.heroImageUrl || homeContent.heroMobileImageUrl ? (
              <>
                <Image
                  src={homeContent.heroMobileImageUrl ?? homeContent.heroImageUrl ?? "/images/hero.png"}
                  alt={homeContent.heroTitle}
                  fill
                  priority
                  sizes="100vw"
                  className="object-cover sm:hidden"
                />
                <Image
                  src={homeContent.heroImageUrl ?? homeContent.heroMobileImageUrl ?? "/images/hero.png"}
                  alt={homeContent.heroTitle}
                  fill
                  priority
                  sizes="(min-width: 1024px) 58vw, 100vw"
                  className="hidden object-cover sm:block"
                />
              </>
            ) : featuredItems.length > 0 ? (
              <div className="grid h-full min-h-[320px] grid-cols-2 grid-rows-2 gap-2 p-2 sm:min-h-[390px] sm:gap-3 sm:p-3 lg:min-h-[540px]">
                {featuredItems.map((item, index) => (
                  <button
                    key={item.stableId}
                    type="button"
                    onClick={() => {
                      if (isTempUnavailable(item.tempUnavailableUntil)) return;
                      trackClientEvent("customer_home_item_opened", { locale, itemStableId: item.stableId, source: "menu" });
                      setActiveItem(item);
                      setSelectedQuantity(1);
                      setSelectedOptions({});
                      setSelectedChildOptions({});
                      setSelectedDailySpecial(null);
                    }}
                    className={`group relative overflow-hidden rounded-[1.4rem] bg-white ${index === 0 ? "row-span-2" : ""}`}
                    aria-label={item.name}
                  >
                    <Image
                      src={item.imageUrl ?? "/images/hero.png"}
                      alt={item.name}
                      fill
                      priority={index === 0}
                      sizes={index === 0 ? "(min-width: 1024px) 34vw, 50vw" : "(min-width: 1024px) 27vw, 50vw"}
                      className="object-cover transition duration-500 group-hover:scale-[1.04]"
                    />
                    <span className="absolute inset-x-3 bottom-3 rounded-full bg-black/55 px-3 py-2 text-left text-xs font-bold text-white backdrop-blur-md sm:text-sm">
                      {item.name}
                    </span>
                  </button>
                ))}
              </div>
            ) : (
              <Image src="/images/hero.png" alt={homeContent.heroTitle} fill priority className="object-contain p-8" sizes="50vw" />
            )}
          </div>
        </div>
      </section>

      {menuLoading ? (
        <section className="rounded-3xl border border-[#87362E]/10 bg-white p-8 text-sm text-stone-500 shadow-sm">
          {locale === "zh" ? "菜单加载中…" : "Loading menu…"}
        </section>
      ) : (
        <>
          {menuError ? <p className="rounded-2xl bg-amber-50 px-4 py-3 text-sm text-amber-700">{menuError}</p> : null}
          {cartNotice ? <p className="rounded-2xl bg-amber-50 px-4 py-3 text-sm text-amber-700">{cartNotice}</p> : null}

          {displayedMenu.length > 0 ? (
            <>
              {dailySpecials.length > 0 ? (
                <section id="daily-special" className="scroll-mt-[88px] overflow-hidden rounded-[2rem] bg-[#87362E] text-white shadow-[0_24px_70px_-42px_rgba(100,45,38,0.7)] lg:scroll-mt-[96px]">
                  <div className="grid lg:grid-cols-[0.72fr_1.28fr]">
                    <div className="flex flex-col justify-center px-6 py-8 sm:px-9 lg:px-12 lg:py-10">
                      <div className="flex items-center gap-2">
                        <span className="rounded-full bg-[#f4b75f] px-3 py-1 text-[10px] font-black uppercase tracking-[0.16em] text-[#65251f]">
                          {locale === "zh" ? "仅限今日" : "TODAY ONLY"}
                        </span>
                      </div>
                      <h2 className="mt-4 text-3xl font-black tracking-tight sm:text-4xl">{homeContent.dailySpecialTitle}</h2>
                      <p className="mt-3 max-w-md text-sm leading-6 text-white/75">
                        {homeContent.dailySpecialDescription}
                      </p>
                    </div>
                    <div className="grid gap-3 bg-[#fff7ef] p-3 text-stone-900 sm:grid-cols-2 sm:p-4">
                      {dailySpecials.map((special) => {
                        const item = menuItemMap.get(special.itemStableId);
                        if (!item) return null;
                        return (
                          <button
                            key={special.stableId}
                            type="button"
                            disabled={isTempUnavailable(item.tempUnavailableUntil)}
                            onClick={() => {
                              if (isTempUnavailable(item.tempUnavailableUntil)) return;
                              trackClientEvent("customer_home_item_opened", { locale, itemStableId: item.stableId, source: "daily_special", specialStableId: special.stableId });
                              setActiveItem(item);
                              setSelectedDailySpecial(special);
                              setSelectedQuantity(1);
                              setSelectedOptions({});
                              setSelectedChildOptions({});
                            }}
                            className="group grid min-h-40 grid-cols-[1fr_132px] overflow-hidden rounded-3xl border border-[#87362E]/10 bg-white text-left shadow-sm transition hover:-translate-y-0.5 hover:shadow-md disabled:cursor-not-allowed disabled:opacity-60 sm:min-h-48"
                          >
                            <span className="flex flex-col justify-center p-5">
                              <span className="text-xs font-black uppercase tracking-[0.16em] text-[#87362E]">{locale === "zh" ? "今日特价" : "Special"}</span>
                              <span className="mt-2 text-lg font-black leading-tight sm:text-xl">{special.name}</span>
                              <span className="mt-3 flex items-baseline gap-2">
                                <span className="text-2xl font-black text-[#87362E]">{currencyFormatter.format(special.effectivePriceCents / 100)}</span>
                                <span className="text-xs text-stone-400 line-through">{currencyFormatter.format(special.basePriceCents / 100)}</span>
                              </span>
                              <span className="mt-3 text-xs font-bold text-[#87362E]">{locale === "zh" ? "立即选择 →" : "Choose options →"}</span>
                            </span>
                            <span className="relative min-h-full bg-[#f2e2d4]">
                              <Image src={item.imageUrl ?? "/images/hero.png"} alt={item.name} fill sizes="160px" className="object-cover transition duration-500 group-hover:scale-105" />
                            </span>
                          </button>
                        );
                      })}
                    </div>
                  </div>
                </section>
              ) : null}

              {featuredItems.length > 0 ? (
                <section className="space-y-4">
                  <div className="flex items-end justify-between gap-4">
                    <div>
                      <p className="text-xs font-black uppercase tracking-[0.2em] text-[#87362E]">{homeContent.favoritesEyebrow}</p>
                      <h2 className="mt-1 text-2xl font-black tracking-tight text-stone-900 sm:text-3xl">{homeContent.favoritesTitle}</h2>
                    </div>
                    <Link href="#menu" className="hidden text-sm font-bold text-[#87362E] sm:inline">{locale === "zh" ? "查看完整菜单 →" : "View full menu →"}</Link>
                  </div>
                  <div className="grid gap-3 sm:grid-cols-3 sm:gap-4">
                    {featuredItems.map((item) => (
                      <button
                        key={item.stableId}
                        type="button"
                        disabled={isTempUnavailable(item.tempUnavailableUntil)}
                        onClick={() => {
                          if (isTempUnavailable(item.tempUnavailableUntil)) return;
                          trackClientEvent("customer_home_item_opened", { locale, itemStableId: item.stableId, source: "menu" });
                          setActiveItem(item);
                          setSelectedQuantity(1);
                          setSelectedOptions({});
                          setSelectedChildOptions({});
                          setSelectedDailySpecial(null);
                        }}
                        className="group relative grid grid-cols-[116px_1fr] overflow-hidden rounded-3xl border border-[#87362E]/10 bg-white text-left shadow-sm transition hover:-translate-y-0.5 hover:shadow-md disabled:cursor-not-allowed disabled:opacity-60 sm:block"
                      >
                        <span className="relative min-h-32 bg-[#f1e5da] sm:block sm:aspect-[5/3] sm:min-h-0">
                          <Image src={item.imageUrl ?? "/images/hero.png"} alt={item.name} fill sizes="(min-width: 640px) 33vw, 116px" className="object-cover transition duration-500 group-hover:scale-105" />
                        </span>
                        <span className="flex min-w-0 flex-col justify-center p-4 pb-11 sm:block sm:p-5 sm:pb-12">
                          <span className="block truncate text-base font-black text-stone-900 sm:text-lg">{item.name}</span>
                          {item.ingredients ? <span className="mt-1 line-clamp-2 block text-xs leading-5 text-stone-500 sm:text-sm">{item.ingredients}</span> : null}
                          <span className="mt-2 block text-sm font-black text-[#87362E]">{currencyFormatter.format(item.price)}</span>
                        </span>
                        {item.featuredBadge ? (
                          <span className="absolute bottom-3 right-3 max-w-[70%] truncate rounded-full bg-[#87362E] px-2.5 py-1 text-[11px] font-black text-white shadow-sm sm:text-xs">
                            {item.featuredBadge}
                          </span>
                        ) : null}
                      </button>
                    ))}
                  </div>
                </section>
              ) : null}

              <section id="menu" className="scroll-mt-[88px] space-y-6 lg:scroll-mt-[96px]">
                <div className="flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between">
                  <div>
                    <p className="text-xs font-black uppercase tracking-[0.2em] text-[#87362E]">{locale === "zh" ? "在线点单" : "ORDER ONLINE"}</p>
                    <h2 className="mt-1 text-3xl font-black tracking-tight text-stone-900 sm:text-4xl">{locale === "zh" ? "完整菜单" : "Full Menu"}</h2>
                  </div>
                  <p className="max-w-xl text-sm text-stone-500">{locale === "zh" ? "选择菜品后可继续选择口味、加料与数量。" : "Tap any dish to customize options, add-ons and quantity."}</p>
                </div>

                <div className="sticky top-[68px] z-30 -mx-1 overflow-x-auto border-y border-[#87362E]/10 bg-[#fffdfa]/95 px-1 py-3 backdrop-blur-xl lg:top-[76px]">
                  <div className="flex min-w-max gap-2">
                    {displayedMenu.map((category) => {
                      const isActive =
                        activeCategoryStableId === category.stableId;
                      return (
                        <Link
                          key={category.stableId}
                          id={`category-tab-${category.stableId}`}
                          href={`#category-${category.stableId}`}
                          onClick={() =>
                            setActiveCategoryStableId(category.stableId)
                          }
                          aria-current={isActive ? "true" : undefined}
                          className={`rounded-full px-4 py-2 text-sm font-bold transition ${isActive ? "bg-[#87362E] text-white" : "border border-[#87362E]/15 bg-white text-stone-700 hover:border-[#87362E]/35 hover:text-[#87362E]"}`}
                        >
                          {category.name}
                        </Link>
                      );
                    })}
                  </div>
                </div>

                <div className="space-y-10">
                  {displayedMenu.map((category) => (
                    <div key={category.stableId} id={`category-${category.stableId}`} className="scroll-mt-[152px] space-y-4 lg:scroll-mt-[164px]">
                      <div className="flex items-center gap-3">
                        <h3 className="text-2xl font-black tracking-tight text-stone-900">{category.name}</h3>
                        <span className="h-px flex-1 bg-[#87362E]/10" />
                        <span className="text-xs font-bold text-stone-400">{category.items.length}</span>
                      </div>
                      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
                        {category.items.map((item) => {
                          const soldOut = isTempUnavailable(item.tempUnavailableUntil);
                          const isDailySpecial = Boolean(item.activeSpecial);
                          return (
                            <button
                              key={item.stableId}
                              type="button"
                              disabled={soldOut}
                              onClick={() => {
                                if (soldOut) return;
                                trackClientEvent("customer_home_item_opened", { locale, itemStableId: item.stableId, source: "menu" });
                                setActiveItem(item);
                                setSelectedQuantity(1);
                                setSelectedOptions({});
                                setSelectedChildOptions({});
                                setSelectedDailySpecial(null);
                              }}
                              className="group grid min-h-[126px] grid-cols-[118px_1fr] overflow-hidden rounded-3xl border border-[#87362E]/10 bg-white text-left shadow-sm transition hover:-translate-y-0.5 hover:shadow-md disabled:cursor-not-allowed disabled:opacity-60 sm:block"
                            >
                              <span className="relative block min-h-full bg-[#f3e7dd] sm:aspect-[4/3] sm:min-h-0">
                                <Image
                                  src={item.imageUrl ?? "/images/sanq-logo-omega.svg"}
                                  alt={item.name}
                                  fill
                                  sizes="(min-width: 1280px) 25vw, (min-width: 640px) 50vw, 118px"
                                  className={item.imageUrl ? "object-cover transition duration-500 group-hover:scale-105" : "object-contain p-7 opacity-35"}
                                />
                                {isDailySpecial ? <span className="absolute left-3 top-3 rounded-full bg-[#87362E] px-2.5 py-1 text-[10px] font-black uppercase text-white">{locale === "zh" ? "特价" : "Special"}</span> : null}
                              </span>
                              <span className="flex min-w-0 flex-col justify-between p-4 sm:min-h-[154px] sm:p-5">
                                <span>
                                  <span className="block text-base font-black leading-tight text-stone-900 sm:text-lg">{item.name}</span>
                                  {item.ingredients ? <span className="mt-1 line-clamp-2 block text-xs leading-5 text-stone-500">{item.ingredients}</span> : null}
                                </span>
                                <span className="mt-3 flex items-center justify-between gap-3">
                                  <span className="text-base font-black text-[#87362E]">{currencyFormatter.format(item.price)}</span>
                                  {soldOut ? (
                                    <span className="rounded-full bg-stone-100 px-2.5 py-1 text-[10px] font-bold text-stone-500">{locale === "zh" ? "今日售罄" : "Sold out"}</span>
                                  ) : (
                                    <span className="grid h-9 w-9 place-items-center rounded-full bg-[#87362E] text-xl font-light text-white">+</span>
                                  )}
                                </span>
                              </span>
                            </button>
                          );
                        })}
                      </div>
                    </div>
                  ))}
                </div>
              </section>
            </>
          ) : (
            <section className="rounded-3xl border border-[#87362E]/10 bg-white p-8 text-sm text-stone-500 shadow-sm">
              {locale === "zh" ? "当前暂无可售菜品。" : "No items available at the moment."}
            </section>
          )}
        </>
      )}

      <section className="overflow-hidden rounded-[2rem] border border-[#d9bca4] bg-[#f7eadc]">
        <div className={`grid gap-6 px-6 py-8 sm:px-9 lg:items-center lg:px-12 ${homeContent.membershipImageUrl ? "lg:grid-cols-[1fr_220px_auto]" : "lg:grid-cols-[1fr_auto]"}`}>
          <div>
            <p className="text-xs font-black uppercase tracking-[0.2em] text-[#87362E]">{homeContent.membershipEyebrow}</p>
            <h2 className="mt-2 text-3xl font-black tracking-tight text-stone-900">{homeContent.membershipTitle}</h2>
            <p className="mt-3 max-w-3xl text-sm leading-6 text-stone-600">{homeContent.membershipDescription}</p>
            <div className="mt-5 grid gap-3 text-sm text-stone-700 sm:grid-cols-3">
              <div className="rounded-2xl bg-white/70 p-4"><strong className="block text-[#87362E]">{locale === "zh" ? "积分" : "Earn Points"}</strong><span className="mt-1 block text-xs text-stone-500">{locale === "zh" ? "每次下单都能累积" : "Rewards every time you order"}</span></div>
              <div className="rounded-2xl bg-white/70 p-4"><strong className="block text-[#87362E]">{locale === "zh" ? "会员券" : "Member Coupons"}</strong><span className="mt-1 block text-xs text-stone-500">{locale === "zh" ? "专享折扣与优惠券" : "Exclusive deals and discounts"}</span></div>
              <div className="rounded-2xl bg-white/70 p-4"><strong className="block text-[#87362E]">{locale === "zh" ? "会员专享" : "Member Specials"}</strong><span className="mt-1 block text-xs text-stone-500">{locale === "zh" ? "不定期专属活动" : "Occasional member-only offers"}</span></div>
            </div>
          </div>
          {homeContent.membershipImageUrl ? (
            <div className="relative aspect-[4/3] overflow-hidden rounded-3xl bg-white/60">
              <Image
                src={homeContent.membershipImageUrl}
                alt={homeContent.membershipTitle}
                fill
                sizes="220px"
                className="object-cover"
              />
            </div>
          ) : null}
          <div className="flex flex-col gap-3 lg:min-w-48">
            <Link href={membershipHref} className="inline-flex h-12 items-center justify-center rounded-full bg-[#87362E] px-6 text-sm font-black text-white transition hover:bg-[#6f2c26]">
              {isMemberLoggedIn ? (locale === "zh" ? "进入会员中心" : "Member Center") : homeContent.membershipCtaLabel}
            </Link>
            {shouldShowInstallButton ? (
              <button type="button" onClick={() => void handleInstallApp()} className="inline-flex h-11 items-center justify-center rounded-full border border-[#87362E]/25 bg-white/70 px-5 text-xs font-bold text-[#87362E] transition hover:bg-white">
                {strings.installApp}
              </button>
            ) : null}
            {installFeedback ? <p className="text-center text-xs text-emerald-700">{installFeedback}</p> : null}
            {isIosInstallHintVisible ? <p className="text-center text-xs text-stone-500">{strings.installAppIosHint}</p> : null}
          </div>
        </div>
      </section>

      <section className="grid gap-4 rounded-[2rem] border border-[#87362E]/10 bg-white p-6 shadow-sm sm:p-8 lg:grid-cols-[1.1fr_0.8fr_auto] lg:items-center">
        <div>
          <p className="text-xs font-black uppercase tracking-[0.2em] text-[#87362E]">{locale === "zh" ? "到店" : "VISIT SANQ"}</p>
          <h2 className="mt-2 text-2xl font-black text-stone-900">4750 Yonge Street, North York</h2>
          <p className="mt-1 text-sm text-stone-500">North York, ON M2N 5M6</p>
        </div>
        <div className="rounded-2xl bg-[#fff7ef] p-4">
          <p className="text-xs font-bold uppercase tracking-[0.14em] text-stone-400">{locale === "zh" ? "今日营业时间" : "TODAY’S HOURS"}</p>
          <p className="mt-1 text-lg font-black text-[#87362E]">{hoursValue}</p>
        </div>
        <Link href={`/${locale}/legal/contact`} className="inline-flex h-12 items-center justify-center rounded-full border border-[#87362E]/30 px-6 text-sm font-black text-[#87362E] transition hover:bg-[#fff3ea]">
          {locale === "zh" ? "路线 / 联系方式" : "Directions & Contact"}
        </Link>
      </section>

      {/* ===== 菜品选项弹窗 ===== */}
      {activeItem ? (
        <CustomerModalShell
          ariaLabel={locale === "zh" ? `${activeItem.name} 菜品选项` : `${activeItem.name} dish options`}
          maxWidthClassName="max-w-2xl"
          mobileSheet
        >
          <CustomerModalHeader
            eyebrow={locale === "zh" ? "菜品选项" : "Dish options"}
            title={activeItem.name}
            description={activeItem.ingredients ?? undefined}
            closeLabel={locale === "zh" ? "关闭" : "Close"}
            onClose={closeOptionsModal}
            titleClassName="text-2xl"
          />

            {/* Content: Option Groups */}
            <div className="min-h-0 flex-1 space-y-6 overflow-y-auto bg-[#fff7ef] px-5 py-5 sm:px-6">
              {activeItem.imageUrl ? (
                <div className="overflow-hidden rounded-3xl border border-[#87362E]/10 bg-[#f2e2d4]">
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
                <p className="rounded-2xl border border-dashed border-[#87362E]/15 bg-white px-4 py-5 text-sm text-stone-500">{locale === "zh" ? "该菜品暂无可选项。" : "No options available for this dish."}</p>
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
            <div className="space-y-4 border-t border-[#87362E]/10 bg-[#fffaf5] px-5 py-5 sm:px-6">
              {requiredGroupsMissing.length > 0 ? (
                <p className="text-xs text-rose-500">{locale === "zh" ? "请完成所有必选项后再加入购物车。" : "Please complete all required selections before adding to cart."}</p>
              ) : null}

              <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                <div className="text-sm font-semibold text-stone-500">{locale === "zh" ? "当前价格" : "Current price"}: <span className="font-black text-[#87362E]">{currencyFormatter.format((activeBasePriceCents + optionsPriceCents) / 100)}</span></div>
                <div className="flex items-center gap-3">
                  <div className="inline-flex items-center rounded-full border border-[#87362E]/10 bg-[#fff7ef] p-1">
                    <button type="button" onClick={() => setSelectedQuantity((qty) => Math.max(1, qty - 1))} disabled={selectedQuantity <= 1} className={`flex h-8 w-8 items-center justify-center rounded-full bg-white text-lg font-black shadow-sm transition ${selectedQuantity <= 1 ? "cursor-not-allowed text-stone-300" : "text-[#87362E] hover:bg-[#fff3ea]"}`}>−</button>
                    <span className="min-w-[2.5rem] text-center text-sm font-black text-stone-800">{selectedQuantity}</span>
                    <button type="button" onClick={() => setSelectedQuantity((qty) => qty + 1)} className="flex h-8 w-8 items-center justify-center rounded-full bg-[#87362E] text-lg font-black text-white shadow-sm transition hover:bg-[#6f2c26]">+</button>
                  </div>
                  <button
                    type="button"
                    onClick={() => {
                      if (!activeItem || !canAddToCart) return;
                      trackClientEvent("customer_home_add_to_cart", {
                        locale,
                        itemStableId: activeItem.stableId,
                        quantity: selectedQuantity,
                        hasDailySpecial: Boolean(selectedDailySpecial),
                        selectedOptionCount: selectedOptionsDetails.length,
                      });
                      addItem(
                        activeItem.stableId,
                        buildOptionSnapshots({
                          ...selectedOptions,
                          ...selectedChildOptions,
                        }),
                        selectedQuantity,
                        selectedDailySpecial?.stableId,
                      );
                      closeOptionsModal();
                    }}
                    disabled={!canAddToCart}
                    className={`inline-flex items-center justify-center rounded-full px-6 py-2.5 text-sm font-black transition ${canAddToCart ? "bg-[#87362E] text-white shadow-[0_14px_30px_-18px_rgba(100,45,38,0.8)] hover:bg-[#6f2c26]" : "cursor-not-allowed bg-[#87362E]/10 text-[#87362E]/35"}`}
                  >
                    {strings.addToCart}
                  </button>
                </div>
              </div>
            </div>
        </CustomerModalShell>
      ) : null}

      {isCartPreviewOpen ? (
        <CustomerModalShell
          ariaLabel={locale === "zh" ? "购物车" : "Cart"}
          maxWidthClassName="max-w-xl"
          mobileSheet
        >
          <CustomerModalHeader
            eyebrow={locale === "zh" ? "已选餐品" : "YOUR ORDER"}
            title={locale === "zh" ? "购物车" : "Cart"}
            closeLabel={locale === "zh" ? "关闭" : "Close"}
            onClose={() => setIsCartPreviewOpen(false)}
          />

            <div className="min-h-0 flex-1 space-y-3 overflow-y-auto bg-[#fff7ef] px-4 py-4 sm:px-6">
              {cartPreviewItems.length === 0 ? (
                <div className="rounded-3xl border border-dashed border-[#87362E]/20 bg-white px-5 py-8 text-center">
                  <p className="text-sm font-semibold text-stone-500">{strings.cartEmpty}</p>
                </div>
              ) : (
                cartPreviewItems.map((item) => (
                  <div key={item.cartLineId} className="rounded-3xl border border-[#87362E]/10 bg-white px-4 py-4 shadow-sm">
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0 pt-0.5">
                        <p className="font-bold text-stone-900">{item.name}</p>
                        {item.optionNames.length > 0 ? (
                          <p className="mt-1.5 text-xs leading-5 text-stone-500">
                            {item.optionNames.join("、")}
                          </p>
                        ) : null}
                      </div>
                      <div className="inline-flex shrink-0 items-center rounded-full border border-[#87362E]/10 bg-[#fff7ef] p-1">
                        <button
                          type="button"
                          onClick={() => updateQuantity(item.cartLineId, -1)}
                          className="flex h-8 w-8 items-center justify-center rounded-full bg-white text-base font-black text-[#87362E] shadow-sm transition hover:bg-[#fff3ea]"
                        >
                          −
                        </button>
                        <span className="min-w-[2.25rem] text-center text-sm font-black text-stone-800">
                          {item.quantity}
                        </span>
                        <button
                          type="button"
                          onClick={() => updateQuantity(item.cartLineId, 1)}
                          className="flex h-8 w-8 items-center justify-center rounded-full bg-[#87362E] text-base font-black text-white shadow-sm transition hover:bg-[#6f2c26]"
                        >
                          +
                        </button>
                      </div>
                    </div>
                  </div>
                ))
              )}
            </div>

            <div className="border-t border-[#87362E]/10 bg-[#fffaf5] px-4 py-4 sm:px-6">
              <button
                type="button"
                disabled={cartPreviewItems.length === 0}
                onClick={handleConfirmOrder}
                className={`w-full rounded-full px-4 py-3.5 text-sm font-black transition ${cartPreviewItems.length > 0 ? "bg-[#87362E] text-white shadow-[0_14px_30px_-16px_rgba(100,45,38,0.8)] hover:bg-[#6f2c26]" : "cursor-not-allowed bg-[#87362E]/10 text-[#87362E]/35"}`}
              >
                {locale === "zh" ? "确认下单" : "Confirm order"}
              </button>
            </div>
        </CustomerModalShell>
      ) : null}

      {/* 手机端固定购物车 CTA / 桌面端浮动入口。购物车预览打开时隐藏，避免遮挡确认按钮。 */}
      {!isCartPreviewOpen ? (
        <button
          type="button"
          onClick={() => openCartPreview("sticky")}
          className={`fixed inset-x-3 bottom-3 z-50 h-16 items-center justify-between rounded-2xl bg-[#87362E] px-4 text-white shadow-[0_18px_50px_-18px_rgba(76,27,22,0.8)] transition hover:bg-[#6f2c26] sm:inset-x-auto sm:bottom-6 sm:right-6 sm:flex sm:h-14 sm:min-w-52 sm:rounded-full sm:px-5 ${hasReachedFullMenu ? "flex" : "hidden"}`}
        >
          <span className="flex items-center gap-3">
            <span className="grid h-9 min-w-9 place-items-center rounded-full bg-white px-2 text-sm font-black text-[#87362E]">{totalQuantity}</span>
            <span className="text-left">
              <span className="block text-sm font-black">{strings.floatingCartLabel}</span>
              <span className="block text-[10px] font-medium text-white/70 sm:hidden">{locale === "zh" ? "查看已选菜品" : "Review your order"}</span>
            </span>
          </span>
          <span className="text-xl">→</span>
        </button>
      ) : null}

    </div>
  );
}
