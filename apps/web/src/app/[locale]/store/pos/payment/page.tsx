// apps/web/src/app/[locale]/store/pos/payment/page.tsx
"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useRouter, useParams } from "next/navigation";
import { TAX_RATE } from "@/lib/order/shared";
import type { Locale } from "@/lib/i18n/locales";
import { ApiError, apiFetch } from "@/lib/api/client";
import type { PublicMenuResponse as PublicMenuApiResponse } from "@shared/menu";
import { advanceOrder, printOrderCloud } from "@/lib/api/pos";
import {
  POS_DISPLAY_CHANNEL,
  POS_DISPLAY_STORAGE_KEY,
  type PosDisplaySnapshot,
} from "@/lib/pos-display";
import type { PaymentMethod } from "@/lib/api/pos";

type FulfillmentType = "pickup" | "dine_in";
type PosOrderChannel = "in_store" | "ubereats";
type BusinessConfigLite = {
  wechatAlipayExchangeRate: number;
  earnPtPerDollar: number;
  tierMultiplierBronze: number;
  tierMultiplierSilver: number;
  tierMultiplierGold: number;
  tierMultiplierPlatinum: number;
};

type CreatePosOrderResponse = {
  orderStableId: string;
  orderNumber: string;
  pickupCode?: string | null;
};

// ✅ 更新：增加 balance 字段
type MemberLookupResponse = {
  userStableId: string;
  displayName?: string | null;
  phone?: string | null;
  tier: "BRONZE" | "SILVER" | "GOLD" | "PLATINUM";
  points: number;
  balance?: number; // 余额 (单位: 元)
  availableDiscountCents: number;
  lifetimeSpendCents: number;
};

type MemberSearchResponse = {
  items: Array<{
    userStableId: string;
  }>;
};

// ✅ 更新：增加 balance 字段
type MemberDetailResponse = {
  userStableId: string;
  displayName?: string | null;
  phone?: string | null;
  availableDiscountCents: number;
  account: {
    tier: MemberLookupResponse["tier"];
    points: MemberLookupResponse["points"];
    balance?: number; // 余额 (单位: 元)
    lifetimeSpendCents: MemberLookupResponse["lifetimeSpendCents"];
  };
};

// ✅ 本地支付方式状态类型
type LocalPaymentMethod = "cash" | "card" | "wechat_alipay" | "store_balance" | "ubereats";
type DiscountOption = "5" | "10" | "15" | "other";

const STRINGS: Record<
  Locale,
  {
    title: string;
    subtitle: string;
    orderSummary: string;
    subtotal: string;
    tax: string;
    total: string;
    fulfillmentLabel: string;
    pickup: string;
    dineIn: string;
    uberEatsChannel: string;
    paymentLabel: string;
    payCash: string;
    payCard: string;
    payWeChatAlipay: string;
    payStoreBalance: string;
    payUberEats: string;
    balanceInsufficient: string;
    balancePaymentLabel: string;
    balancePaymentHint: string;
    balancePaymentAvailable: string;
    balancePaymentAfter: string;
    back: string;
    backKeepItems: string;
    confirm: string;
    confirming: string;
    tip: string;
    noOrder: string;
    loading: string;
    errorGeneric: string;
    successTitle: string;
    successBody: string;
    close: string;
    orderLabel: string;
    pickupCodeLabel: string;
    memberLabel: string;
    memberPhone: string;
    memberLookup: string;
    memberClear: string;
    memberPoints: string;
    memberPointsAvailable: string;
    memberRedeemLabel: string;
    memberRedeemHint: string;
    memberFound: string;
    memberNotFound: string;
    memberLoading: string;
    memberEarned: string;
    memberBalanceAfter: string;
    fulfillmentRequired: string;
    wechatAlipayConverted: string;
    memberBalance: string; // [新增]
    useBalanceLabel: string; // [新增]
    useBalanceHint: string; // [新增]
    max: string; // [新增]
    mixedPaymentHint: string;
    discountTitle: string;
    discountOther: string;
    discountOtherHint: string;
    discountApplied: string;
    cashDialogTitle: string;
    cashDialogAmountLabel: string;
    cashDialogCancel: string;
    cashDialogConfirm: string;
    cashDialogInvalid: string;
  }
> = {
  zh: {
    title: "门店收银 · 支付方式",
    subtitle: "选择用餐方式和付款方式，然后在收银机上完成支付。",
    orderSummary: "订单信息",
    subtotal: "小计",
    tax: "税费 (HST)",
    total: "合计",
    fulfillmentLabel: "用餐方式",
    pickup: "外带",
    dineIn: "堂食",
    uberEatsChannel: "UberEats",
    paymentLabel: "付款方式",
    payCash: "现金",
    payCard: "银行卡",
    payWeChatAlipay: "微信或支付宝",
    payStoreBalance: "储值余额",
    payUberEats: "UberEats",
    balanceInsufficient: "余额不足以全额支付",
    balancePaymentLabel: "余额支付",
    balancePaymentHint: "请先选择会员后使用余额支付。",
    balancePaymentAvailable: "可用余额",
    balancePaymentAfter: "预计结算后余额",
    back: "返回点单",
    backKeepItems: "保留菜品返回点单",
    confirm: "确认收款并生成订单",
    confirming: "处理中…",
    tip: "请在确认顾客完成支付后，再点击“确认收款并生成订单”。",
    noOrder: "当前没有待支付的订单，请先在 POS 界面选菜下单。",
    loading: "正在读取订单信息…",
    errorGeneric: "下单失败，请稍后重试。",
    successTitle: "订单已创建",
    successBody: "单号与取餐码可在厨房看板 / POS 副屏上查看。",
    close: "完成",
    orderLabel: "订单号：",
    pickupCodeLabel: "取餐码：",
    memberLabel: "会员手机号",
    memberPhone: "输入会员手机号",
    memberLookup: "确认会员",
    memberClear: "清除会员",
    memberPoints: "当前积分",
    memberPointsAvailable: "可抵扣金额",
    memberRedeemLabel: "积分抵扣",
    memberRedeemHint: "输入整数积分",
    memberFound: "已识别会员",
    memberNotFound: "未找到会员，请核对手机号",
    memberLoading: "正在查询会员…",
    memberEarned: "本单预计新增积分",
    memberBalanceAfter: "预计结算后积分",
    fulfillmentRequired: "请选择用餐方式后再继续。",
    wechatAlipayConverted: "微信/支付宝折算金额",
    memberBalance: "储值余额",
    useBalanceLabel: "使用余额",
    useBalanceHint: "输入金额",
    max: "MAX",
    mixedPaymentHint: "余额抵扣后，请选择剩余金额的支付方式。",
    discountTitle: "折扣 / 优惠",
    discountOther: "其他金额",
    discountOtherHint: "输入优惠金额",
    discountApplied: "折扣优惠",
    cashDialogTitle: "现金收款",
    cashDialogAmountLabel: "收款金额",
    cashDialogCancel: "取消",
    cashDialogConfirm: "确认",
    cashDialogInvalid: "收款金额不能小于合计金额",
  },
  en: {
    title: "Store POS · Payment",
    subtitle: "Choose dining and payment method, then take payment on terminal.",
    orderSummary: "Order summary",
    subtotal: "Subtotal",
    tax: "Tax (HST)",
    total: "Total",
    fulfillmentLabel: "Dining",
    pickup: "Pickup",
    dineIn: "Dine-in",
    uberEatsChannel: "UberEats",
    paymentLabel: "Payment method",
    payCash: "Cash",
    payCard: "Card",
    payWeChatAlipay: "WeChat / Alipay",
    payStoreBalance: "Store Balance",
    payUberEats: "UberEats",
    balanceInsufficient: "Insufficient balance for full payment",
    balancePaymentLabel: "Balance payment",
    balancePaymentHint: "Select a member to pay with stored balance.",
    balancePaymentAvailable: "Available balance",
    balancePaymentAfter: "Estimated balance after",
    back: "Back to POS",
    backKeepItems: "Back to POS (keep items)",
    confirm: "Confirm payment & create order",
    confirming: "Saving…",
    tip: "Only tap “Confirm payment & create order” after the customer has finished paying.",
    noOrder: "No pending order. Please build an order on the POS screen first.",
    loading: "Loading order…",
    errorGeneric: "Failed to create order. Please try again.",
    successTitle: "Order created",
    successBody:
      "Order number and pickup code are visible on the kitchen screen / customer display.",
    close: "Done",
    orderLabel: "Order:",
    pickupCodeLabel: "Pickup code:",
    memberLabel: "Member phone",
    memberPhone: "Enter member phone",
    memberLookup: "Confirm member",
    memberClear: "Clear member",
    memberPoints: "Current points",
    memberPointsAvailable: "Available discount",
    memberRedeemLabel: "Redeem points",
    memberRedeemHint: "Enter whole points",
    memberFound: "Member confirmed",
    memberNotFound: "Member not found. Please check the phone.",
    memberLoading: "Looking up member…",
    memberEarned: "Estimated points earned",
    memberBalanceAfter: "Estimated balance after",
    fulfillmentRequired: "Select a dining option before continuing.",
    wechatAlipayConverted: "WeChat/Alipay converted total",
    memberBalance: "Store Balance",
    useBalanceLabel: "Use Balance",
    useBalanceHint: "Amount",
    max: "MAX",
    mixedPaymentHint: "After balance deduction, choose how to pay the remaining amount.",
    discountTitle: "Discount",
    discountOther: "Other",
    discountOtherHint: "Enter discount amount",
    discountApplied: "Discount",
    cashDialogTitle: "Cash collection",
    cashDialogAmountLabel: "Amount received",
    cashDialogCancel: "Cancel",
    cashDialogConfirm: "Confirm",
    cashDialogInvalid: "Amount received cannot be less than total",
  },
};

function formatMoney(cents: number): string {
  return `$${(cents / 100).toFixed(2)}`;
}

function formatFx(amount: number): string {
  return `¥${amount.toFixed(2)}`;
}

function roundUpToFiveCents(cents: number): number {
  if (cents <= 0) return 0;
  return Math.ceil(cents / 5) * 5;
}

function formatSignedMoney(cents: number): string {
  const sign = cents >= 0 ? "+" : "-";
  return `${sign}${formatMoney(Math.abs(cents))}`;
}

export default function StorePosPaymentPage() {
  const router = useRouter();
  const params = useParams<{ locale?: string }>();
  const locale = (params?.locale === "en" ? "en" : "zh") as Locale;
  const t = STRINGS[locale];

  const [snapshot, setSnapshot] = useState<PosDisplaySnapshot | null>(null);
  const [menuCategories, setMenuCategories] = useState<PublicMenuApiResponse["categories"]>([]);
  const [loadingSnapshot, setLoadingSnapshot] = useState(true);
  const [fulfillment, setFulfillment] = useState<FulfillmentType | null>(null);
  const [orderChannel, setOrderChannel] = useState<PosOrderChannel>("in_store");

  const [paymentMethod, setPaymentMethod] = useState<LocalPaymentMethod>("cash");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [memberPhone, setMemberPhone] = useState("");
  const [memberInfo, setMemberInfo] = useState<MemberLookupResponse | null>(null);
  const [memberLookupLoading, setMemberLookupLoading] = useState(false);
  const [memberLookupError, setMemberLookupError] = useState<string | null>(null);
  
  const [wechatAlipayRate, setWechatAlipayRate] = useState<number>(1);
  const [earnRate, setEarnRate] = useState(0.01);
  const [tierMultipliers, setTierMultipliers] = useState({
    BRONZE: 1,
    SILVER: 2,
    GOLD: 3,
    PLATINUM: 5,
  });

  const [redeemPointsInput, setRedeemPointsInput] = useState("");
  const [useBalanceInput, setUseBalanceInput] = useState(""); // [新增] 部分余额支付输入
  const [discountOption, setDiscountOption] = useState<DiscountOption | null>(null);
  const [otherDiscountInput, setOtherDiscountInput] = useState("");
  const [showOtherDiscountKeypad, setShowOtherDiscountKeypad] = useState(false);
  const [cashDialogOpen, setCashDialogOpen] = useState(false);
  const [cashReceivedInput, setCashReceivedInput] = useState("");
  const [cashDialogError, setCashDialogError] = useState<string | null>(null);
  const discountKeypadRef = useRef<HTMLDivElement | null>(null);

  const [successInfo, setSuccessInfo] = useState<{
    orderNumber: string;
    pickupCode?: string | null;
  } | null>(null);

  // 从 localStorage 读取 POS 界面保存的订单快照
  useEffect(() => {
    if (typeof window === "undefined") return;
    try {
      const raw = window.localStorage.getItem(POS_DISPLAY_STORAGE_KEY);
      if (!raw) setSnapshot(null);
      else setSnapshot(JSON.parse(raw) as PosDisplaySnapshot);
    } catch (err) {
      console.error("Failed to read POS display snapshot:", err);
      setSnapshot(null);
    } finally {
      setLoadingSnapshot(false);
    }
  }, []);

  useEffect(() => {
    let active = true;
    apiFetch<PublicMenuApiResponse>("/menu/public")
      .then((menu) => {
        if (!active) return;
        setMenuCategories(Array.isArray(menu.categories) ? menu.categories : []);
      })
      .catch((err) => console.warn("Failed to load menu for option labels:", err));
    return () => {
      active = false;
    };
  }, []);

  useEffect(() => {
    let active = true;
    apiFetch<BusinessConfigLite>("/admin/business/config")
      .then((config) => {
        if (!active) return;
        if (typeof config.wechatAlipayExchangeRate === "number") setWechatAlipayRate(config.wechatAlipayExchangeRate);
        if (typeof config.earnPtPerDollar === "number") setEarnRate(config.earnPtPerDollar);
        if (typeof config.tierMultiplierBronze === "number") {
          setTierMultipliers({
            BRONZE: config.tierMultiplierBronze,
            SILVER: config.tierMultiplierSilver,
            GOLD: config.tierMultiplierGold,
            PLATINUM: config.tierMultiplierPlatinum,
          });
        }
      })
      .catch((err) => console.warn("Failed to load exchange rate config:", err));
    return () => { active = false; };
  }, []);

  const optionMetaMap = useMemo(() => {
    const map = new Map<string, {
      optionNameZh: string | null;
      optionNameEn: string;
      priceDeltaCents: number;
    }>();

    for (const category of menuCategories) {
      for (const item of category.items) {
        for (const group of item.optionGroups ?? []) {
          for (const option of group.options ?? []) {
            map.set(`${group.templateGroupStableId}::${option.optionStableId}`, {
              optionNameZh: option.nameZh,
              optionNameEn: option.nameEn,
              priceDeltaCents: option.priceDeltaCents,
            });
          }
        }
      }
    }

    return map;
  }, [menuCategories]);

  const hasItems = !!snapshot && Array.isArray(snapshot.items) && snapshot.items.length > 0;

  const normalizedSnapshotItems = useMemo(() => {
    if (!snapshot?.items?.length) return [];

    return snapshot.items.map((item) => {
      const normalizedQty: number =
        typeof item.quantity === "number" && Number.isFinite(item.quantity) && item.quantity > 0
          ? item.quantity
          : 1;
      const normalizedUnitPriceCents: number =
        typeof item.customUnitPriceCents === "number" && Number.isFinite(item.customUnitPriceCents)
          ? item.customUnitPriceCents
          : typeof item.unitPriceCents === "number" && Number.isFinite(item.unitPriceCents)
            ? item.unitPriceCents
            : 0;

      return {
        ...item,
        quantity: normalizedQty,
        unitPriceCents: normalizedUnitPriceCents,
        lineTotalCents: normalizedUnitPriceCents * normalizedQty,
      };
    });
  }, [snapshot]);

  const baseSubtotalCents = useMemo(() => {
    if (!normalizedSnapshotItems.length) return 0;
    return normalizedSnapshotItems.reduce((sum, item) => sum + item.lineTotalCents, 0);
  }, [normalizedSnapshotItems]);

  const discountCents = useMemo(() => {
    if (baseSubtotalCents <= 0 || !discountOption) return 0;
    if (discountOption === "5") return Math.round(baseSubtotalCents * 0.05);
    if (discountOption === "10") return Math.round(baseSubtotalCents * 0.1);
    if (discountOption === "15") return Math.round(baseSubtotalCents * 0.15);

    const val = Number(otherDiscountInput);
    if (!Number.isFinite(val) || val <= 0) return 0;
    return Math.min(Math.round(val * 100), baseSubtotalCents);
  }, [baseSubtotalCents, discountOption, otherDiscountInput]);

  const appendDiscountKeypadValue = useCallback((key: string) => {
    setOtherDiscountInput((prev) => {
      if (key === "clear") return "";
      if (key === "back") return prev.slice(0, -1);

      const candidate = `${prev}${key}`;
      if (!/^\d*(\.\d{0,2})?$/.test(candidate)) return prev;
      return candidate;
    });
  }, []);

  useEffect(() => {
    if (!showOtherDiscountKeypad) return;
    const onPointerDown = (event: MouseEvent) => {
      if (!discountKeypadRef.current?.contains(event.target as Node)) {
        setShowOtherDiscountKeypad(false);
      }
    };
    document.addEventListener("mousedown", onPointerDown);
    return () => document.removeEventListener("mousedown", onPointerDown);
  }, [showOtherDiscountKeypad]);

  const discountedSubtotalCents = Math.max(0, baseSubtotalCents - discountCents);

  // --- 积分逻辑 ---

const maxRedeemableCentsForOrder = useMemo(() => {
  if (!memberInfo) return 0;
  if (discountedSubtotalCents <= 0) return 0;
  return Math.min(memberInfo.availableDiscountCents, discountedSubtotalCents);
}, [discountedSubtotalCents, memberInfo]);

// 把输入金额转成 cents（整数）并 clamp 到最大可抵扣
const redeemCents = useMemo(() => {
  if (!memberInfo || !redeemPointsInput) return 0;

  const raw = redeemPointsInput.trim();
  if (!raw) return 0;

  const val = Number(raw);
  if (!Number.isFinite(val) || val <= 0) return 0;

  const cents = Math.round(val * 100);
  return Math.min(cents, maxRedeemableCentsForOrder);
}, [memberInfo, redeemPointsInput, maxRedeemableCentsForOrder]);

// 兼容你后面还在用 pointsToRedeem 的地方：这里把“抵扣金额”也当作 points（带小数）
// 如果你后端 pointsToRedeem 已支持小数：直接传这个就行
// 如果后端只支持整数：你需要后端改为接收 redeemCents（见文末备注）
const pointsToRedeem = redeemCents / 100;

const loyaltyRedeemCents = redeemCents;

  // --- 余额使用逻辑 (Partial) ---
  const effectiveSubtotalAfterPointsCents = Math.max(0, discountedSubtotalCents - loyaltyRedeemCents);
  const taxCents = Math.round(effectiveSubtotalAfterPointsCents * TAX_RATE);
  const totalAfterPointsCents = effectiveSubtotalAfterPointsCents + taxCents;

  // 用户输入的余额支付金额
  const balanceToUseCents = useMemo(() => {
    if (!memberInfo || !useBalanceInput) return 0;
    const val = parseFloat(useBalanceInput);
    if (!Number.isFinite(val) || val <= 0) return 0;
    const cents = Math.round(val * 100);
    // 限制：不能超过会员余额，也不能超过剩余应付
    const maxUse = Math.min(Math.round((memberInfo.balance ?? 0) * 100), totalAfterPointsCents);
    return Math.min(cents, maxUse);
  }, [memberInfo, useBalanceInput, totalAfterPointsCents]);

  // 剩余需要通过 Cash/Card/Alipay 支付的金额
  const remainingTotalCents = Math.max(0, totalAfterPointsCents - balanceToUseCents);

  // 最终显示的合计（如果是现金支付，对剩余部分取整）
  const finalDisplayTotalCents = paymentMethod === "cash" 
    ? roundUpToFiveCents(remainingTotalCents) 
    : remainingTotalCents;

  const pointsEarned = useMemo(() => {
    if (!memberInfo) return 0;
    // 余额支付部分也算有效消费，按折后金额计算
    const base = (effectiveSubtotalAfterPointsCents / 100) * earnRate;
    const earned = base * tierMultipliers[memberInfo.tier];
    return Math.round(earned * 100) / 100;
  }, [earnRate, effectiveSubtotalAfterPointsCents, memberInfo, tierMultipliers]);

  // 判断是否全额余额支付（即剩余需支付为0）
  const isFullyPaidByBalance = totalAfterPointsCents > 0 && remainingTotalCents === 0;

  // 当选择 store_balance 支付方式时，必须全额支付
  const isBalanceSufficientForFullPayment = useMemo(() => {
    if (!memberInfo) return false;
    const balanceCents = (memberInfo.balance ?? 0) * 100;
    return balanceCents >= totalAfterPointsCents;
  }, [memberInfo, totalAfterPointsCents]);

  // 如果是全额余额支付，自动切换到余额支付方式。
  useEffect(() => {
    if (isFullyPaidByBalance && paymentMethod !== 'store_balance') {
      setPaymentMethod('store_balance');
    } else if (!isFullyPaidByBalance && paymentMethod === 'store_balance') {
        // 若变成混合支付，默认改为现金，可继续切换为银行卡/微信支付宝。
        setPaymentMethod('cash');
    }
  }, [isFullyPaidByBalance, paymentMethod]);

  useEffect(() => {
    if (orderChannel === "ubereats" && paymentMethod !== "ubereats") {
      setPaymentMethod("ubereats");
      return;
    }
    if (orderChannel === "in_store" && paymentMethod === "ubereats") {
      setPaymentMethod("cash");
    }
  }, [orderChannel, paymentMethod]);

  const computedSnapshot = useMemo(() => {
    if (!snapshot) return null;
    return {
      ...snapshot,
      items: normalizedSnapshotItems,
      subtotalCents: discountedSubtotalCents,
      discountCents,
      taxCents,
      // 注意：这里 totalCents 在 POS 副屏通常显示“应付金额”。
      // 如果使用了部分余额，副屏可能需要显示剩余应付？
      // 暂时保持显示最终需支付现金/卡的部分
      totalCents: finalDisplayTotalCents, 
      loyalty: memberInfo
        ? {
            userStableId: memberInfo.userStableId ?? null,
            pointsBalance: memberInfo.points,
            pointsRedeemed: pointsToRedeem,
            pointsEarned,
            pointsBalanceAfter: Math.round((memberInfo.points - pointsToRedeem + pointsEarned) * 100) / 100,
          }
        : undefined,
    } satisfies PosDisplaySnapshot;
  }, [
    discountCents,
    discountedSubtotalCents,
    memberInfo,
    pointsEarned,
    pointsToRedeem,
    snapshot,
    normalizedSnapshotItems,
    taxCents,
    finalDisplayTotalCents,
  ]);

  // 更新副屏
  useEffect(() => {
    if (typeof window === "undefined" || !computedSnapshot?.items.length) return;
    try {
      window.localStorage.setItem(POS_DISPLAY_STORAGE_KEY, JSON.stringify(computedSnapshot));
      if ("BroadcastChannel" in window) {
        const channel = new BroadcastChannel(POS_DISPLAY_CHANNEL);
        channel.postMessage({ type: "snapshot", snapshot: computedSnapshot });
        channel.close();
      }
    } catch { /* ignore */ }
  }, [computedSnapshot]);

  const summarySubtotalCents = computedSnapshot?.subtotalCents ?? 0;
  const summaryTaxCents = computedSnapshot?.taxCents ?? 0;
  const summaryTotalCents = computedSnapshot?.totalCents ?? 0; // 这是剩余应付
  const summaryLoyaltyRedeemCents = redeemCents;
  
  const wechatConvertedTotal =
    paymentMethod === "wechat_alipay" && wechatAlipayRate > 0
      ? (summaryTotalCents / 100) * wechatAlipayRate
      : null;

  // 余额计算
  const balanceRemainingAfterOrder = Math.max(
    0,
    (memberInfo ? Math.round((memberInfo.balance ?? 0) * 100) : 0) - balanceToUseCents,
  );

  const resolveSelectedOptions = useCallback((item: PosDisplaySnapshot["items"][number]) => {
    if (!item.options) return [];

    const lines: Array<{ optionName: string; priceDeltaCents: number }> = [];

    Object.entries(item.options).forEach(([groupStableId, optionStableIds]) => {
      optionStableIds.forEach((optionStableId) => {
        const meta = optionMetaMap.get(`${groupStableId}::${optionStableId}`);
        if (meta) {
          lines.push({
            optionName: locale === "zh" ? meta.optionNameZh ?? meta.optionNameEn : meta.optionNameEn,
            priceDeltaCents: meta.priceDeltaCents,
          });
          return;
        }

        lines.push({
          optionName: optionStableId.slice(-6),
          priceDeltaCents: 0,
        });
      });
    });

    return lines;
  }, [locale, optionMetaMap]);

  const handleMemberLookup = async () => {
    if (!memberPhone.trim()) {
      setMemberLookupError(t.memberNotFound);
      return;
    }
    setMemberLookupLoading(true);
    setMemberLookupError(null);
    try {
      const search = memberPhone.trim();
      const result = await apiFetch<MemberSearchResponse>(`/admin/members?search=${encodeURIComponent(search)}&pageSize=5`);
      const match = result.items?.[0];
      if (!match?.userStableId) {
        setMemberInfo(null);
        setMemberLookupError(t.memberNotFound);
        return;
      }
      const detail = await apiFetch<MemberDetailResponse>(`/admin/members/${match.userStableId}`);
      setMemberInfo({
        userStableId: detail.userStableId,
        displayName: detail.displayName ?? null,
        phone: detail.phone ?? null,
        tier: detail.account.tier,
        points: detail.account.points,
        balance: detail.account.balance,
        availableDiscountCents: detail.availableDiscountCents ?? 0,
        lifetimeSpendCents: detail.account.lifetimeSpendCents,
      });
      setRedeemPointsInput("");
      setUseBalanceInput("");
    } catch (err) {
      const apiError = err instanceof ApiError ? err : null;
      setMemberInfo(null);
      setMemberLookupError(apiError?.status === 404 ? t.memberNotFound : t.errorGeneric);
    } finally {
      setMemberLookupLoading(false);
    }
  };

  const handleMemberClear = () => {
    setMemberInfo(null);
    setMemberPhone("");
    setRedeemPointsInput("");
    setUseBalanceInput("");
    setMemberLookupError(null);
    if (paymentMethod === "store_balance") setPaymentMethod("cash");
  };

  const handleBackKeepItems = () => router.push(`/${locale}/store/pos`);

  const handleBack = () => {
    if (typeof window !== "undefined") {
      window.localStorage.removeItem(POS_DISPLAY_STORAGE_KEY);
    }
    router.push(`/${locale}/store/pos`);
  };

  // 点击 MAX 填充积分
  const handleMaxPoints = () => {
  if (!memberInfo) return;
  setRedeemPointsInput((maxRedeemableCentsForOrder / 100).toFixed(2));
};

  // 点击 MAX 填充余额
  const handleMaxBalance = () => {
    if (!memberInfo) return;
    const balanceCents = (memberInfo.balance ?? 0) * 100;
    // 允许使用的最大值：余额 与 (总额 - 积分抵扣) 的较小值
    const maxAllowed = Math.min(balanceCents, totalAfterPointsCents);
    setUseBalanceInput((maxAllowed / 100).toFixed(2));
  };

  const submitOrder = async (cashMeta?: { cashReceivedCents: number; cashChangeCents: number }) => {
    setError(null);
    setSubmitting(true);

    if (!snapshot || snapshot.items.length === 0 || !computedSnapshot) {
      setError(t.noOrder);
      setSubmitting(false);
      return;
    }
    if (!fulfillment) {
      setError(t.fulfillmentRequired);
      setSubmitting(false);
      return;
    }

    // 余额支付前置校验
    if (paymentMethod === 'store_balance') {
        if (!memberInfo) {
            setError(t.memberNotFound);
            setSubmitting(false);
            return;
        }
        if (!isBalanceSufficientForFullPayment) {
            setError(t.balanceInsufficient);
            setSubmitting(false);
            return;
        }
    }

    try {
      const itemsPayload = normalizedSnapshotItems.map((item) => ({
        productStableId: item.stableId,
        qty: item.quantity,
        unitPrice: item.unitPriceCents / 100,
        displayName: locale === "zh" ? item.nameZh : item.nameEn,
        nameEn: item.nameEn,
        nameZh: item.nameZh,
        options: item.options,
      }));

      // ✅ 映射 PaymentMethod
      let apiPaymentMethod: PaymentMethod = "CASH";
      if (orderChannel === "ubereats") {
        apiPaymentMethod = "UBEREATS";
      } else if (isFullyPaidByBalance) {
        apiPaymentMethod = "STORE_BALANCE";
      } else if (paymentMethod === "card") {
        apiPaymentMethod = "CARD";
      } else if (paymentMethod === "wechat_alipay") {
        apiPaymentMethod = "WECHAT_ALIPAY";
      }

      const body = {
        channel: orderChannel,
        fulfillmentType: fulfillment,
        // 这里传原始小计，后端会重算，但我们要在 DTO 扩展支持部分支付
        subtotalCents: computedSnapshot.subtotalCents,
        taxCents: computedSnapshot.taxCents,
        totalCents: computedSnapshot.totalCents, // 这里的 totalCents 已经是扣除余额后的剩余应付? 不，Order模型通常存总价。
        // 修正：后端创建订单时，totalCents 应该是订单总价值。
        // 但 createInternal 会重算。
        // 我们需要传递 balanceUsedCents 告诉后端扣多少余额。
        paymentMethod: apiPaymentMethod,
        items: itemsPayload,
        userStableId: memberInfo?.userStableId ?? undefined,
        pointsToRedeem: pointsToRedeem > 0 ? pointsToRedeem : undefined,
        balanceUsedCents: balanceToUseCents > 0 ? balanceToUseCents : undefined, // [新增]
        discountCents: discountCents > 0 ? discountCents : undefined,
        contactPhone: memberInfo?.phone ?? undefined,
      };

      const order = await apiFetch<CreatePosOrderResponse>("/pos/orders", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });

      if (typeof window !== "undefined" && order.orderStableId) {
        try { window.localStorage.removeItem(POS_DISPLAY_STORAGE_KEY); } catch {}
      }

      setSuccessInfo({
        orderNumber: order.orderNumber ?? order.orderStableId,
        pickupCode: order.pickupCode ?? null,
      });

      if (order.orderStableId) {
        if (orderChannel === "in_store") {
          try {
            await printOrderCloud(order.orderStableId, {
              targets: { customer: true, kitchen: true },
              ...(cashMeta
                ? {
                    cashReceivedCents: cashMeta.cashReceivedCents,
                    cashChangeCents: cashMeta.cashChangeCents,
                  }
                : {}),
            });
          } catch (e) {
            console.warn("Failed to trigger POS print:", e);
          }
        }
        try { await advanceOrder(order.orderStableId); } catch (e) { console.warn(e); }
      }
    } catch (err) {
      console.error("Failed to place POS order:", err);
      setError(err instanceof Error ? err.message : t.errorGeneric);
    } finally {
      setSubmitting(false);
    }
  };

  const handleConfirm = async () => {
    if (paymentMethod === "cash" && orderChannel === "in_store") {
      setCashDialogError(null);
      setCashReceivedInput((summaryTotalCents / 100).toFixed(2));
      setCashDialogOpen(true);
      return;
    }
    await submitOrder();
  };

  const handleConfirmCashDialog = async () => {
    const received = Number(cashReceivedInput);
    if (!Number.isFinite(received) || received <= 0) {
      setCashDialogError(t.cashDialogInvalid);
      return;
    }
    const cashReceivedCents = Math.round(received * 100);
    if (cashReceivedCents < summaryTotalCents) {
      setCashDialogError(t.cashDialogInvalid);
      return;
    }
    const cashChangeCents = Math.max(0, cashReceivedCents - summaryTotalCents);
    setCashDialogOpen(false);
    await submitOrder({ cashReceivedCents, cashChangeCents });
  };

  const handleCloseSuccess = useCallback(() => {
    setSuccessInfo(null);
    router.push(`/${locale}/store/pos`);
  }, [locale, router]);

  useEffect(() => {
    if (!successInfo) return;
    const timer = window.setTimeout(() => handleCloseSuccess(), 2000);
    return () => window.clearTimeout(timer);
  }, [handleCloseSuccess, successInfo]);

  return (
    <main className="min-h-screen bg-slate-900 text-slate-50">
      <header className="flex items-center justify-between px-6 py-4 border-b border-slate-700">
        <div>
          <h1 className="text-2xl font-semibold">{t.title}</h1>
          <p className="text-sm text-slate-300">{t.subtitle}</p>
        </div>
      </header>

      <section className="p-4 max-w-5xl mx-auto flex flex-col gap-4 lg:flex-row">
        {/* 左侧：订单详情 */}
        <div className="flex-1 rounded-3xl bg-slate-800/80 border border-slate-700 p-4">
          <h2 className="text-sm font-semibold mb-3">{t.orderSummary}</h2>
          {loadingSnapshot ? (
            <p className="text-sm text-slate-400">{t.loading}</p>
          ) : !hasItems || !snapshot ? (
            <div className="space-y-3 text-sm text-slate-400">
              <p>{t.noOrder}</p>
              <button onClick={handleBack} className="mt-1 h-9 px-3 rounded-2xl border border-slate-600 text-slate-100">{t.back}</button>
            </div>
          ) : (
            <>
              <ul className="space-y-2 max-h-72 overflow-auto pr-1">
                {normalizedSnapshotItems.map((item) => {
                  const selectedOptions = resolveSelectedOptions(item);
                  return (
                  <li key={item.lineId ?? `${item.stableId}-${item.unitPriceCents}-${item.quantity}`} className="rounded-2xl bg-slate-900/60 px-3 py-2 flex justify-between gap-2">
                    <div className="flex-1">
                      <div className="flex items-center gap-2 text-sm font-medium">
                        <span>{locale === "zh" ? item.nameZh : item.nameEn}</span>
                        <span className="text-xs text-slate-400">×{item.quantity}</span>
                      </div>
                      {selectedOptions.length > 0 && (
                        <ul className="mt-1 space-y-0.5 text-[11px] text-slate-400">
                          {selectedOptions.map((selected, idx) => (
                            <li key={`${item.lineId ?? item.stableId}-${selected.optionName}-${idx}`} className="flex items-start justify-between gap-2">
                              <span className="truncate">{selected.optionName}</span>
                              <span className="whitespace-nowrap text-slate-500">
                                {formatSignedMoney(selected.priceDeltaCents)}
                              </span>
                            </li>
                          ))}
                        </ul>
                      )}
                    </div>
                    <div className="text-sm font-semibold">{formatMoney(item.lineTotalCents)}</div>
                  </li>
                  );
                })}
              </ul>
              <div className="mt-4 border-t border-slate-700 pt-3 space-y-1 text-sm">
                <div className="flex justify-between">
                  <span className="text-slate-300">{t.subtotal}</span>
                  <span>{formatMoney(summarySubtotalCents)}</span>
                </div>
                {/* 积分抵扣展示 */}
                {discountCents > 0 && (
                  <div className="flex justify-between text-amber-200">
                    <span className="text-slate-300">{t.discountApplied}</span>
                    <span>-{formatMoney(discountCents)}</span>
                  </div>
                )}
                {summaryLoyaltyRedeemCents > 0 && (
                  <div className="flex justify-between text-emerald-200">
                    <span className="text-slate-300">{t.memberRedeemLabel}</span>
                    <span>-{formatMoney(summaryLoyaltyRedeemCents)}</span>
                  </div>
                )}
                {/* 余额支付展示 */}
                {balanceToUseCents > 0 && (
                  <div className="flex justify-between text-blue-200">
                    <span className="text-slate-300">{t.payStoreBalance}</span>
                    <span>-{formatMoney(balanceToUseCents)}</span>
                  </div>
                )}
                <div className="flex justify-between">
                  <span className="text-slate-300">{t.tax}</span>
                  <span>{formatMoney(summaryTaxCents)}</span>
                </div>
                <div className="flex justify-between text-base font-semibold border-t border-slate-700 pt-2 mt-1">
                  <span>{t.total}</span>
                  <span>{formatMoney(summaryTotalCents)}</span>
                </div>
                {wechatConvertedTotal != null && (
                  <div className="flex justify-between text-sm text-emerald-200">
                    <span>{t.wechatAlipayConverted}</span>
                    <span>{formatFx(wechatConvertedTotal)}</span>
                  </div>
                )}
              </div>
            </>
          )}
        </div>

        {/* 右侧：支付控制 */}
        <div className="w-full lg:w-96 flex flex-col rounded-3xl bg-slate-800/80 border border-slate-700 p-4">
          <div className="space-y-4">
            {/* 用餐方式 */}
            <div>
              <h2 className="text-sm font-semibold mb-2">{t.fulfillmentLabel}</h2>
              <div className="grid grid-cols-3 gap-2 text-sm">
                <button type="button" onClick={() => { setOrderChannel("in_store"); setFulfillment("pickup"); }} className={`h-10 rounded-2xl border font-medium ${fulfillment === "pickup" ? "border-emerald-400 bg-emerald-500 text-slate-900" : "border-slate-600 bg-slate-900 text-slate-100"}`}>{t.pickup}</button>
                <button type="button" onClick={() => { setOrderChannel("in_store"); setFulfillment("dine_in"); }} className={`h-10 rounded-2xl border font-medium ${fulfillment === "dine_in" ? "border-emerald-400 bg-emerald-500 text-slate-900" : "border-slate-600 bg-slate-900 text-slate-100"}`}>{t.dineIn}</button>
                <button type="button" onClick={() => { setOrderChannel("ubereats"); setFulfillment("pickup"); }} className={`h-10 rounded-2xl border font-medium ${orderChannel === "ubereats" ? "border-emerald-400 bg-emerald-500 text-slate-900" : "border-slate-600 bg-slate-900 text-slate-100"}`}>{t.uberEatsChannel}</button>
              </div>
            </div>

            {/* 会员查询 + 积分/余额操作 */}
            <div>
              <h2 className="text-sm font-semibold mb-2">{t.memberLabel}</h2>
              <div className="space-y-2">
                <div className="flex gap-2">
                  <input type="tel" value={memberPhone} onChange={(e) => setMemberPhone(e.target.value)} placeholder={t.memberPhone} className="h-10 flex-1 rounded-2xl border border-slate-600 bg-slate-900 px-3 text-sm text-slate-100 placeholder:text-slate-500" />
                  <button type="button" disabled={!memberPhone.trim() || memberLookupLoading} onClick={handleMemberLookup} className="h-10 px-4 rounded-2xl border border-slate-600 bg-slate-800 text-sm hover:bg-slate-700 disabled:opacity-50">{memberLookupLoading ? "..." : t.memberLookup}</button>
                </div>
                {memberLookupError && <p className="text-xs text-rose-200">{memberLookupError}</p>}
                
                {memberInfo && (
                  <div className="rounded-2xl border border-slate-600 bg-slate-900/40 p-3 space-y-3">
                    <div className="flex justify-between items-start">
                      <div>
                        <p className="text-sm font-semibold text-slate-100">{memberInfo.displayName || t.memberFound}</p>
                        <p className="text-xs text-slate-400">ID: {memberInfo.userStableId.slice(-6)}</p>
                      </div>
                      <button onClick={handleMemberClear} className="text-xs text-slate-400 hover:text-white underline">{t.memberClear}</button>
                    </div>

                    {/* 积分部分 */}
                    <div className="bg-slate-800/50 rounded-xl p-2 border border-slate-700/50">
                        <div className="flex justify-between text-xs text-slate-300 mb-1">
                            <span>{t.memberPoints}</span>
                            <span>{memberInfo.points.toFixed(0)} pts</span>
                        </div>
                        <div className="flex gap-2">
                            <input 
                                type="text"
                                value={redeemPointsInput}
                                onChange={(e) => {
                                  // 只允许数字和一个小数点，且最多两位小数
                                  let v = e.target.value.replace(/[^\d.]/g, "");
                                  const firstDot = v.indexOf(".");
                                  if (firstDot !== -1) {
                                    v =
                                      v.slice(0, firstDot + 1) +
                                      v.slice(firstDot + 1).replace(/\./g, "");
                                    const [a, b] = v.split(".");
                                    v = a + "." + (b ?? "").slice(0, 2);
                                  }
                                  setRedeemPointsInput(v);
                                }}
                                placeholder="0.00"
                                className="flex-1 h-8 rounded-lg bg-slate-900 border border-slate-700 px-2 text-sm text-right"
                            />
                            <button onClick={handleMaxPoints} className="px-2 h-8 rounded-lg bg-emerald-500/20 text-emerald-300 text-xs font-bold border border-emerald-500/30 hover:bg-emerald-500/30">{t.max}</button>
                        </div>
                        <div className="text-right text-xs text-emerald-400 mt-1">
                            -{formatMoney(redeemCents)}
                        </div>
                    </div>

                    {/* 余额部分 */}
                    <div className="bg-slate-800/50 rounded-xl p-2 border border-slate-700/50">
                        <div className="flex justify-between text-xs text-slate-300 mb-1">
                            <span>{t.memberBalance}</span>
                            <span>{formatMoney((memberInfo.balance ?? 0) * 100)}</span>
                        </div>
                        <div className="flex gap-2">
                            <input 
                                type="number" 
                                value={useBalanceInput} 
                                onChange={(e) => setUseBalanceInput(e.target.value)}
                                placeholder="0.00"
                                className="flex-1 h-8 rounded-lg bg-slate-900 border border-slate-700 px-2 text-sm text-right"
                            />
                            <button onClick={handleMaxBalance} className="px-2 h-8 rounded-lg bg-blue-500/20 text-blue-300 text-xs font-bold border border-blue-500/30 hover:bg-blue-500/30">{t.max}</button>
                        </div>
                        <div className="flex justify-between text-xs mt-1">
                            <span className="text-slate-500">{t.balancePaymentAfter}</span>
                            <span className="text-blue-300">{formatMoney(balanceRemainingAfterOrder)}</span>
                        </div>
                    </div>
                  </div>
                )}
              </div>
            </div>

            {/* 折扣/优惠 */}
            <div className="relative">
              <h2 className="text-sm font-semibold mb-2">{t.discountTitle}</h2>
              <div className="rounded-2xl border border-slate-600 bg-slate-900/40 p-3 space-y-3">
                <div className="grid grid-cols-4 gap-2 text-sm">
                  {(["5", "10", "15", "other"] as const).map((opt) => (
                    <button
                      key={opt}
                      type="button"
                      onClick={() => {
                        setDiscountOption(opt);
                        setShowOtherDiscountKeypad(opt === "other");
                      }}
                      className={`h-10 rounded-xl border font-medium ${discountOption === opt ? "border-amber-300 bg-amber-400 text-slate-900" : "border-slate-600 bg-slate-900 text-slate-100"}`}
                    >
                      {opt === "other" ? t.discountOther : `${opt}%`}
                    </button>
                  ))}
                </div>

                {discountOption === "other" && (
                  <input
                    type="number"
                    min="0"
                    step="0.01"
                    value={otherDiscountInput}
                    onChange={(e) => setOtherDiscountInput(e.target.value)}
                    placeholder={t.discountOtherHint}
                    className="h-10 w-full rounded-xl border border-slate-600 bg-slate-900 px-3 text-sm text-slate-100 placeholder:text-slate-500"
                  />
                )}

                <div className="flex justify-between text-xs text-amber-200">
                  <span>{t.discountApplied}</span>
                  <span>-{formatMoney(discountCents)}</span>
                </div>
              </div>

              {discountOption === "other" && showOtherDiscountKeypad && (
                <div ref={discountKeypadRef} className="pointer-events-auto absolute right-full top-7 mr-3 z-20 w-[16rem] rounded-2xl border border-slate-600 bg-slate-900/95 p-3 shadow-2xl">
                  <div className="mb-2 text-xs text-slate-300">{t.discountOtherHint}</div>
                  <div className="grid grid-cols-3 gap-2">
                    {["1", "2", "3", "4", "5", "6", "7", "8", "9", ".", "0", "back"].map((key) => (
                      <button
                        key={key}
                        type="button"
                        onMouseDown={(event) => event.preventDefault()}
                        onClick={() => appendDiscountKeypadValue(key)}
                        className="h-12 rounded-xl bg-slate-800 text-lg font-semibold text-slate-100 hover:bg-slate-700"
                      >
                        {key === "back" ? "⌫" : key}
                      </button>
                    ))}
                    <button
                      type="button"
                      onMouseDown={(event) => event.preventDefault()}
                      onClick={() => appendDiscountKeypadValue("clear")}
                      className="col-span-3 h-10 rounded-xl bg-rose-500/20 text-sm font-semibold text-rose-200 hover:bg-rose-500/30"
                    >
                      {locale === "zh" ? "清空金额" : "Clear amount"}
                    </button>
                  </div>
                </div>
              )}
            </div>

            {/* 付款方式 */}
            <div>
              <h2 className="text-sm font-semibold mb-2">{t.paymentLabel}</h2>
              <p className="mb-2 text-xs text-slate-400">{t.mixedPaymentHint}</p>
              <div className="grid grid-cols-2 gap-2 text-sm">
                <button disabled={orderChannel === "ubereats"} onClick={() => setPaymentMethod("cash")} className={`h-12 rounded-2xl border font-medium ${paymentMethod === "cash" ? "border-emerald-400 bg-emerald-500 text-slate-900" : "border-slate-600 bg-slate-900 text-slate-100"}`}>{t.payCash}</button>
                <button disabled={orderChannel === "ubereats"} onClick={() => setPaymentMethod("card")} className={`h-12 rounded-2xl border font-medium ${paymentMethod === "card" ? "border-emerald-400 bg-emerald-500 text-slate-900" : "border-slate-600 bg-slate-900 text-slate-100"}`}>{t.payCard}</button>
                <button disabled={orderChannel === "ubereats"} onClick={() => setPaymentMethod("wechat_alipay")} className={`h-12 rounded-2xl border font-medium ${paymentMethod === "wechat_alipay" ? "border-emerald-400 bg-emerald-500 text-slate-900" : "border-slate-600 bg-slate-900 text-slate-100"}`}>{t.payWeChatAlipay}</button>
                
                <button disabled={orderChannel !== "ubereats"} onClick={() => setPaymentMethod("ubereats")} className={`h-12 rounded-2xl border font-medium ${paymentMethod === "ubereats" ? "border-emerald-400 bg-emerald-500 text-slate-900" : "border-slate-600 bg-slate-900 text-slate-500"}`}>{t.payUberEats}</button>
              </div>
            </div>

            {error && <div className="rounded-2xl border border-rose-500/60 bg-rose-500/10 px-3 py-2 text-xs text-rose-100">{error}</div>}
          </div>

          <div className="mt-auto pt-4 flex gap-3">
            <button onClick={handleBackKeepItems} className="flex-1 h-12 rounded-2xl border border-blue-500/60 text-sm font-medium text-blue-100 hover:bg-blue-500/10">{t.backKeepItems}</button>
            <button onClick={handleBack} className="flex-1 h-12 rounded-2xl border border-slate-600 text-sm font-medium text-slate-100 hover:bg-slate-700">{t.back}</button>
            <button disabled={!hasItems || submitting || !snapshot || !fulfillment} onClick={handleConfirm} className="flex-[2] h-12 rounded-2xl text-sm font-bold bg-emerald-500 text-slate-900 hover:bg-emerald-400 disabled:opacity-50 disabled:bg-slate-600 disabled:text-slate-400">
              {submitting ? t.confirming : t.confirm}
            </button>
          </div>
        </div>
      </section>

      {successInfo && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-sm">
          <div className="w-full max-w-sm rounded-3xl bg-slate-900 border border-slate-700 p-8 text-center shadow-2xl">
            <h3 className="text-xl font-bold mb-2 text-emerald-400">{t.successTitle}</h3>
            <div className="my-6 space-y-2">
              <div className="text-slate-400 text-sm">{t.orderLabel}</div>
              <div className="text-3xl font-mono font-bold text-white tracking-widest">{successInfo.orderNumber}</div>
              {successInfo.pickupCode && (
                <>
                    <div className="text-slate-400 text-sm mt-4">{t.pickupCodeLabel}</div>
                    <div className="text-4xl font-bold text-yellow-400">{successInfo.pickupCode}</div>
                </>
              )}
            </div>
            <button onClick={handleCloseSuccess} className="w-full h-12 rounded-2xl bg-slate-100 text-slate-900 font-bold hover:bg-white transition-colors">{t.close}</button>
          </div>
        </div>
      )}

      {cashDialogOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 px-4">
          <div className="w-full max-w-sm rounded-3xl border border-slate-600 bg-slate-900 p-5 shadow-2xl">
            <h3 className="text-lg font-semibold text-white">{t.cashDialogTitle}</h3>
            <p className="mt-2 text-sm text-slate-300">{t.total}: {formatMoney(summaryTotalCents)}</p>
            <label className="mt-4 block text-xs text-slate-400">{t.cashDialogAmountLabel}</label>
            <input
              type="number"
              min="0"
              step="0.01"
              value={cashReceivedInput}
              onChange={(e) => {
                setCashReceivedInput(e.target.value);
                setCashDialogError(null);
              }}
              className="mt-2 h-11 w-full rounded-xl border border-slate-600 bg-slate-800 px-3 text-base text-white"
            />
            {cashDialogError && <p className="mt-2 text-xs text-rose-300">{cashDialogError}</p>}
            <div className="mt-4 flex gap-2">
              <button
                type="button"
                onClick={() => setCashDialogOpen(false)}
                className="h-10 flex-1 rounded-xl border border-slate-600 text-sm text-slate-100"
              >
                {t.cashDialogCancel}
              </button>
              <button
                type="button"
                onClick={handleConfirmCashDialog}
                className="h-10 flex-1 rounded-xl bg-emerald-500 text-sm font-semibold text-slate-900"
              >
                {t.cashDialogConfirm}
              </button>
            </div>
          </div>
        </div>
      )}
    </main>
  );
}
