"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useParams } from "next/navigation";
import type { Locale } from "@/lib/i18n/locales";
import { apiFetch } from "@/lib/api/client";

const COPY = {
  zh: {
    title: "会员管理",
    subtitle: "POS 端会员查询、积分与资产管理。",
    backToPos: "返回 POS 点单",
    searchLabel: "手机号搜索",
    searchPlaceholder: "输入会员手机号，自动识别会员",
    searchHint: "输入手机号后自动显示会员简要信息。",
    searchEmpty: "暂无匹配会员。",
    memberOverview: "会员概览",
    pointsBalance: "积分余额",
    walletBalance: "储值余额",
    pointsAccount: "奖励积分",
    tierLabel: "等级",
    marketingOptIn: "营销短信/邮件",
    marketingOptInYes: "已同意",
    marketingOptInNo: "未同意",
    profile: {
      name: "姓名",
      registeredAt: "注册时间",
      email: "邮箱",
    },
    actionsTitle: "积分与资产管理",
    manualAdjust: "手动调整积分",
    rechargePoints: "会员充值",
    ledgerTitle: "积分记录",
    ledgerSubtitle: "积分获取与消耗流水。",
    ledgerEmpty: "暂无积分记录。",
    ordersTitle: "消费历史",
    ordersSubtitle: "点击订单查看详情或处理退款。",
    ordersEmpty: "暂无历史订单。",
    orderFields: {
      order: "订单号",
      time: "时间",
      status: "状态",
      amount: "金额",
      fulfillment: "类型",
    },
    orderStatus: {
      paid: "已支付",
      pending: "待支付",
      making: "制作中",
      ready: "待取餐",
      completed: "已完成",
      refunded: "已退款",
    },
    fulfillment: {
      pickup: "自取",
      dine_in: "堂食",
      takeout: "外带",
      delivery: "外卖",
    },
    actionView: "查看",
    actionRefund: "退款/重做",
    modal: {
      adjustTitle: "手动调整积分",
      rechargeTitle: "会员充值与奖励",
      cancel: "取消",
      confirm: "确认",
      submitting: "提交中…",
      modeAdd: "增加",
      modeSubtract: "扣除",
      pointsLabel: "积分数量",
      pointsPlaceholder: "请输入积分",
      reasonLabel: "备注原因",
      reasonPlaceholder: "请输入原因（必填）",
      rechargeAmountHint: "充值金额将按 1:1 折算为积分",
      rechargeAmount: "充值金额",
      bonusPoints: "奖励积分",
      paymentMethod: "结算方式",
      payCash: "现金",
      payWeChatAlipay: "微信或支付宝",
      wechatAlipayConverted: "微信/支付宝折算金额",
      sendCode: "发送验证码",
      verifyCode: "验证",
      codeLabel: "手机验证码",
      codePlaceholder: "输入短信验证码",
      verified: "已验证",
      confirmRecharge: "确认充值",
    },
    errors: {
      searchFailed: "会员搜索失败，请稍后重试。",
      detailFailed: "会员信息加载失败。",
      adjustFailed: "积分调整失败。",
      rechargeFailed: "充值失败。",
      codeFailed: "验证码发送失败。",
      verifyFailed: "验证码验证失败。",
    },
    selectMemberHint: "请先选择会员。",
  },
  en: {
    title: "Member Management",
    subtitle: "Lookup members and manage points in POS.",
    backToPos: "Back to POS",
    searchLabel: "Search by phone",
    searchPlaceholder: "Enter phone number",
    searchHint: "Type a phone number to see member info.",
    searchEmpty: "No matching members.",
    memberOverview: "Member overview",
    pointsBalance: "Points balance",
    walletBalance: "Store Balance",
    pointsAccount: "Reward Points",
    tierLabel: "Tier",
    marketingOptIn: "Marketing email/SMS",
    marketingOptInYes: "Opted in",
    marketingOptInNo: "Not opted in",
    profile: {
      name: "Name",
      registeredAt: "Registered",
      email: "Email",
    },
    actionsTitle: "Points & asset management",
    manualAdjust: "Manual adjustment",
    rechargePoints: "Recharge",
    ledgerTitle: "Points ledger",
    ledgerSubtitle: "Track earned and spent points.",
    ledgerEmpty: "No ledger entries.",
    ordersTitle: "Order history",
    ordersSubtitle: "Open orders to review or refund.",
    ordersEmpty: "No orders yet.",
    orderFields: {
      order: "Order",
      time: "Time",
      status: "Status",
      amount: "Amount",
      fulfillment: "Type",
    },
    orderStatus: {
      paid: "Paid",
      pending: "Pending",
      making: "In progress",
      ready: "Ready",
      completed: "Completed",
      refunded: "Refunded",
    },
    fulfillment: {
      pickup: "Pickup",
      dine_in: "Dine-in",
      takeout: "Takeout",
      delivery: "Delivery",
    },
    actionView: "View",
    actionRefund: "Refund/Reorder",
    modal: {
      adjustTitle: "Manual points adjustment",
      rechargeTitle: "Recharge & bonus points",
      cancel: "Cancel",
      confirm: "Confirm",
      submitting: "Submitting…",
      modeAdd: "Add",
      modeSubtract: "Subtract",
      pointsLabel: "Points",
      pointsPlaceholder: "Enter points",
      reasonLabel: "Reason",
      reasonPlaceholder: "Reason required",
      rechargeAmountHint: "Recharge amount converts 1:1 into points",
      rechargeAmount: "Cash recharge",
      bonusPoints: "Bonus points",
      paymentMethod: "Payment method",
      payCash: "Cash",
      payWeChatAlipay: "WeChat / Alipay",
      wechatAlipayConverted: "WeChat/Alipay converted total",
      sendCode: "Send code",
      verifyCode: "Verify",
      codeLabel: "SMS code",
      codePlaceholder: "Enter code",
      verified: "Verified",
      confirmRecharge: "Confirm recharge",
    },
    errors: {
      searchFailed: "Failed to search members.",
      detailFailed: "Failed to load member details.",
      adjustFailed: "Failed to adjust points.",
      rechargeFailed: "Recharge failed.",
      codeFailed: "Failed to send code.",
      verifyFailed: "Failed to verify code.",
    },
    selectMemberHint: "Select a member first.",
  },
} as const;

type PaymentMethod = "cash" | "card" | "wechat_alipay";

type MemberSummary = {
  userStableId: string;
  displayName: string | null;
  email: string | null;
  phone: string | null;
  tier: string;
  points: number;
  lifetimeSpendCents: number;
  status: string;
  createdAt: string;
};

type MemberDetail = {
  userStableId: string;
  displayName: string | null;
  email: string | null;
  phone: string | null;
  phoneVerifiedAt: string | null;
  status: string;
  createdAt: string;
  marketingEmailOptIn: boolean;
  birthdayMonth: number | null;
  birthdayDay: number | null;
  account: {
    tier: string;
    points: number;
    balance: number; // 余额
    lifetimeSpendCents: number;
  };
};

type LedgerEntry = {
  ledgerStableId: string;
  createdAt: string;
  type: string;
  deltaPoints: number;
  balanceAfterPoints: number;
  note?: string;
  orderStableId?: string;
};

type OrderEntry = {
  orderStableId: string;
  createdAt: string;
  status: string;
  totalCents: number;
  fulfillmentType: string | null;
  deliveryType: string | null;
};

const LEDGER_LABELS: Record<string, { zh: string; en: string }> = {
  ORDER_EARNED: { zh: "订单积分", en: "Order earned" },
  ORDER_REDEEMED: { zh: "订单抵扣", en: "Order redeemed" },
  MANUAL_ADJUSTMENT: { zh: "手动调整", en: "Manual adjustment" },
  EXPIRATION: { zh: "积分过期", en: "Expired" },
};

function formatPoints(value: number, locale: Locale) {
  return new Intl.NumberFormat(locale === "zh" ? "zh-CN" : "en-US").format(
    Math.round(value),
  );
}

function formatMoney(cents: number, locale: Locale) {
  const amount = cents / 100;
  return new Intl.NumberFormat(locale === "zh" ? "zh-CN" : "en-US", {
    style: "currency",
    currency: "CAD",
  }).format(amount);
}

function formatFxAmount(value: number) {
  return `¥${value.toFixed(2)}`;
}

function formatDate(value: string | null, locale: Locale) {
  if (!value) return "-";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleDateString(locale === "zh" ? "zh-CN" : "en-US", {
    year: "numeric",
    month: "short",
    day: "numeric",
  });
}

function getInitials(name: string | null) {
  if (!name) return "?";
  const parts = name.trim().split(/\s+/).slice(0, 2);
  return parts.map((part) => part.charAt(0).toUpperCase()).join("");
}

// 辅助函数：格式化余额
function formatBalance(amount: number | undefined, locale: Locale) {
  return formatMoney((amount ?? 0) * 100, locale); // 假设后端传的是元，这里转分格式化，或者后端传的就是元。
  // 通常 API 设计里 points 是 number, balance 建议也是 number (元)。
  // 如果后端传的是 balanceMicro (分)，这里需要除以 100。
  // 假设后端传回前端的是已经 normalized 的“元”单位 (matches points logic)。
}

export default function PosMembershipPage() {
  const params = useParams<{ locale?: string }>();
  const locale = (params?.locale === "zh" ? "zh" : "en") as Locale;
  const copy = COPY[locale];

  const [wechatAlipayRate, setWechatAlipayRate] = useState<number>(1);
  const [rechargePaymentMethod, setRechargePaymentMethod] =
    useState<PaymentMethod>("cash");
  const [searchPhone, setSearchPhone] = useState("");
  const [searchResults, setSearchResults] = useState<MemberSummary[]>([]);
  const [searchLoading, setSearchLoading] = useState(false);
  const [searchError, setSearchError] = useState<string | null>(null);
  const [selectedMemberId, setSelectedMemberId] = useState<string | null>(null);

  const [memberDetail, setMemberDetail] = useState<MemberDetail | null>(null);
  const [ledgerEntries, setLedgerEntries] = useState<LedgerEntry[]>([]);
  const [orders, setOrders] = useState<OrderEntry[]>([]);
  const [detailLoading, setDetailLoading] = useState(false);
  const [detailError, setDetailError] = useState<string | null>(null);

  const [adjustOpen, setAdjustOpen] = useState(false);
  const [adjustMode, setAdjustMode] = useState<"add" | "subtract">("add");
  const [adjustPoints, setAdjustPoints] = useState("");
  const [adjustReason, setAdjustReason] = useState("");
  const [adjustSubmitting, setAdjustSubmitting] = useState(false);

  const [rechargeOpen, setRechargeOpen] = useState(false);
  const [rechargeAmount, setRechargeAmount] = useState("");
  const [rechargeBonus, setRechargeBonus] = useState("");
  const [rechargeCode, setRechargeCode] = useState("");
  const [rechargeVerificationToken, setRechargeVerificationToken] =
    useState("");
  const [rechargeStep, setRechargeStep] = useState<
    "idle" | "code-sent" | "verified"
  >("idle");
  const [rechargeSubmitting, setRechargeSubmitting] = useState(false);
  const [rechargeError, setRechargeError] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    apiFetch<{ wechatAlipayExchangeRate: number }>("/admin/business/config")
      .then((config) => {
        if (!active) return;
        if (
          typeof config.wechatAlipayExchangeRate === "number" &&
          Number.isFinite(config.wechatAlipayExchangeRate)
        ) {
          setWechatAlipayRate(config.wechatAlipayExchangeRate);
        }
      })
      .catch((error) => {
        console.warn("Failed to load exchange rate config:", error);
      });
    return () => {
      active = false;
    };
  }, []);

  const handleSelectMember = useCallback((member: MemberSummary) => {
    setSelectedMemberId(member.userStableId);
  }, []);

  const refreshMemberData = useCallback(
    async (userStableId: string) => {
      setDetailLoading(true);
      setDetailError(null);
      try {
        const [detail, ledger, orderList] = await Promise.all([
          apiFetch<MemberDetail>(`/admin/members/${userStableId}`),
          apiFetch<{ entries: LedgerEntry[] }>(
            `/admin/members/${userStableId}/loyalty-ledger?limit=50`,
          ),
          apiFetch<{ orders: OrderEntry[] }>(
            `/admin/members/${userStableId}/orders?limit=50`,
          ),
        ]);
        setMemberDetail(detail);
        setLedgerEntries(ledger.entries ?? []);
        setOrders(orderList.orders ?? []);
      } catch (error) {
        console.error("Failed to load member detail", error);
        setDetailError(copy.errors.detailFailed);
      } finally {
        setDetailLoading(false);
      }
    },
    [copy.errors.detailFailed],
  );

  useEffect(() => {
    if (!selectedMemberId) return;
    void refreshMemberData(selectedMemberId);
  }, [refreshMemberData, selectedMemberId]);

  useEffect(() => {
    const trimmed = searchPhone.trim();
    if (!trimmed) {
      setSearchResults([]);
      setSearchError(null);
      return;
    }

    const handle = window.setTimeout(async () => {
      setSearchLoading(true);
      setSearchError(null);
      try {
        const result = await apiFetch<{
          items: MemberSummary[];
          total: number;
        }>(`/admin/members?search=${encodeURIComponent(trimmed)}&pageSize=5`);
        setSearchResults(result.items ?? []);
        if (result.items?.length === 1) {
          setSelectedMemberId(result.items[0].userStableId);
        }
      } catch (error) {
        console.error("Failed to search members", error);
        setSearchError(copy.errors.searchFailed);
      } finally {
        setSearchLoading(false);
      }
    }, 350);

    return () => window.clearTimeout(handle);
  }, [copy.errors.searchFailed, searchPhone]);

  const totalRechargePoints = useMemo(() => {
    const base = Number.parseFloat(rechargeAmount) || 0;
    const bonus = Number.parseFloat(rechargeBonus) || 0;
    return Math.round(base + bonus);
  }, [rechargeAmount, rechargeBonus]);

  const rechargeAmountValue = useMemo(() => {
    const base = Number.parseFloat(rechargeAmount) || 0;
    return base > 0 ? base : 0;
  }, [rechargeAmount]);

  const rechargeConvertedAmount =
    rechargePaymentMethod === "wechat_alipay" && wechatAlipayRate > 0
      ? rechargeAmountValue * wechatAlipayRate
      : null;

  const canSubmitAdjust =
    !adjustSubmitting &&
    selectedMemberId &&
    adjustReason.trim().length > 0 &&
    Number.isFinite(Number.parseFloat(adjustPoints)) &&
    Number.parseFloat(adjustPoints) > 0;

  const handleAdjustSubmit = async () => {
    if (!selectedMemberId || !canSubmitAdjust) return;
    setAdjustSubmitting(true);
    try {
      const delta = Number.parseFloat(adjustPoints);
      await apiFetch(`/admin/members/${selectedMemberId}/adjust-points`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          deltaPoints: adjustMode === "add" ? delta : -delta,
          note: adjustReason.trim(),
          idempotencyKey: crypto.randomUUID(),
        }),
      });
      setAdjustOpen(false);
      setAdjustPoints("");
      setAdjustReason("");
      if (selectedMemberId) {
        await refreshMemberData(selectedMemberId);
      }
    } catch (error) {
      console.error("Failed to adjust points", error);
      setDetailError(copy.errors.adjustFailed);
    } finally {
      setAdjustSubmitting(false);
    }
  };

  const handleSendCode = async () => {
    if (!selectedMemberId) return;
    setRechargeSubmitting(true);
    setRechargeError(null);
    try {
      await apiFetch(`/admin/members/${selectedMemberId}/recharge/send-code`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          locale,
        }),
      });
      setRechargeStep("code-sent");
      setRechargeVerificationToken("");
    } catch (error) {
      console.error("Failed to send code", error);
      setRechargeError(copy.errors.codeFailed);
    } finally {
      setRechargeSubmitting(false);
    }
  };

  const handleVerifyCode = async () => {
    if (!selectedMemberId || !rechargeCode.trim()) return;
    setRechargeSubmitting(true);
    setRechargeError(null);
    try {
      const res = await apiFetch<{
        ok: boolean;
        verificationToken?: string;
      }>(`/admin/members/${selectedMemberId}/recharge/verify-code`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          code: rechargeCode.trim(),
        }),
      });
      if (!res.ok || !res.verificationToken) {
        setRechargeError(copy.errors.verifyFailed);
        return;
      }
      setRechargeVerificationToken(res.verificationToken);
      setRechargeStep("verified");
    } catch (error) {
      console.error("Failed to verify code", error);
      setRechargeError(copy.errors.verifyFailed);
    } finally {
      setRechargeSubmitting(false);
    }
  };

  const handleConfirmRecharge = async () => {
    if (
      !selectedMemberId ||
      totalRechargePoints <= 0 ||
      !rechargeVerificationToken
    )
      return;
    const amount = Number.parseFloat(rechargeAmount) || 0;
    const bonus = Number.parseFloat(rechargeBonus) || 0;
    const amountCents = Math.round(amount * 100);
    if (!Number.isFinite(amountCents) || amountCents <= 0) return;
    setRechargeSubmitting(true);
    setRechargeError(null);
    try {
      await apiFetch(`/admin/members/${selectedMemberId}/recharge`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          amountCents,
          bonusPoints: Number.isFinite(bonus) && bonus > 0 ? bonus : 0,
          verificationToken: rechargeVerificationToken,
          idempotencyKey: crypto.randomUUID(),
        }),
      });
      setRechargeOpen(false);
      setRechargeAmount("");
      setRechargeBonus("");
      setRechargeCode("");
      setRechargeVerificationToken("");
      setRechargeStep("idle");
      setRechargePaymentMethod("cash");
      if (selectedMemberId) {
        await refreshMemberData(selectedMemberId);
      }
    } catch (error) {
      console.error("Failed to recharge", error);
      setRechargeError(copy.errors.rechargeFailed);
    } finally {
      setRechargeSubmitting(false);
    }
  };

  const closeRechargeModal = () => {
    setRechargeOpen(false);
    setRechargeAmount("");
    setRechargeBonus("");
    setRechargeCode("");
    setRechargeVerificationToken("");
    setRechargeStep("idle");
    setRechargeError(null);
    setRechargePaymentMethod("cash");
  };

  return (
    <main className="min-h-screen bg-slate-900 text-slate-50">
      <header className="flex items-center justify-between px-6 py-4 border-b border-slate-700">
        <div>
          <h1 className="text-2xl font-semibold">{copy.title}</h1>
          <p className="text-sm text-slate-300">{copy.subtitle}</p>
        </div>
        <Link
          href={`/${locale}/store/pos`}
          className="rounded-full border border-slate-600 bg-slate-800 px-5 py-2 text-sm font-semibold text-slate-100 hover:border-slate-400"
        >
          {copy.backToPos}
        </Link>
      </header>

      <section className="px-6 py-6">
        <div className="rounded-3xl border border-slate-800 bg-slate-800/60 p-6">
          <label className="text-sm font-semibold text-slate-200">
            {copy.searchLabel}
          </label>
          <div className="mt-3 flex flex-wrap items-center gap-3">
            <input
              value={searchPhone}
              onChange={(event) => setSearchPhone(event.target.value)}
              placeholder={copy.searchPlaceholder}
              className="h-12 flex-1 min-w-[240px] rounded-2xl border border-slate-700 bg-slate-900 px-4 text-base text-slate-100 placeholder:text-slate-500 focus:border-slate-400 focus:outline-none"
            />
            {searchLoading && (
              <span className="text-xs text-slate-400">Loading…</span>
            )}
          </div>
          <p className="mt-2 text-xs text-slate-400">{copy.searchHint}</p>
          {searchError && (
            <p className="mt-3 text-xs text-rose-300">{searchError}</p>
          )}
          {searchPhone.trim() && searchResults.length === 0 && !searchLoading && (
            <p className="mt-3 text-xs text-slate-400">{copy.searchEmpty}</p>
          )}
          {searchResults.length > 0 && (
            <div className="mt-4 grid gap-3 md:grid-cols-2 xl:grid-cols-3">
              {searchResults.map((member) => (
                <button
                  key={member.userStableId}
                  type="button"
                  onClick={() => handleSelectMember(member)}
                  className={`flex items-center gap-3 rounded-2xl border p-4 text-left transition ${
                    selectedMemberId === member.userStableId
                      ? "border-emerald-400/70 bg-emerald-500/10"
                      : "border-slate-700 bg-slate-900 hover:border-slate-500"
                  }`}
                >
                  <div className="flex h-11 w-11 items-center justify-center rounded-full bg-slate-700 text-sm font-semibold text-slate-100">
                    {getInitials(member.displayName)}
                  </div>
                    <div className="flex-1">
                      <p className="text-sm font-semibold text-slate-100">
                        {member.displayName ?? "-"}
                      </p>
                      <p className="text-xs text-slate-400">
                        {formatDate(member.createdAt, locale)}
                      </p>
                      <p className="text-xs text-slate-500">
                        {copy.tierLabel}: {member.tier}
                      </p>
                    </div>
                  <div className="text-right">
                    <p className="text-lg font-semibold text-slate-100">
                      {formatPoints(member.points, locale)}
                    </p>
                    <p className="text-xs text-slate-400">{copy.pointsBalance}</p>
                  </div>
                </button>
              ))}
            </div>
          )}
        </div>
      </section>

      <section className="grid gap-6 px-6 pb-8 lg:grid-cols-[2fr_1fr]">
        <div className="space-y-6">
          <div className="rounded-3xl border border-slate-800 bg-slate-800/60 p-6">
            <div className="flex items-start justify-between">
              <div>
                <h2 className="text-lg font-semibold">{copy.memberOverview}</h2>
                <p className="mt-1 text-xs text-slate-400">
                  {selectedMemberId ? "" : copy.selectMemberHint}
                </p>
              </div>
              {memberDetail && (
                <span className="rounded-full border border-slate-700 bg-slate-900 px-3 py-1 text-xs text-slate-300">
                  {memberDetail.status}
                </span>
              )}
            </div>

            {detailLoading ? (
              <p className="mt-4 text-sm text-slate-400">Loading…</p>
            ) : detailError ? (
              <p className="mt-4 text-sm text-rose-300">{detailError}</p>
            ) : memberDetail ? (
              <div className="mt-6 grid gap-6 md:grid-cols-[1.2fr_1fr]">
                <div className="rounded-2xl border border-slate-700 bg-slate-900 p-5">
                  <div className="flex items-center gap-4">
                    <div className="flex h-14 w-14 items-center justify-center rounded-full bg-slate-700 text-lg font-semibold">
                      {getInitials(memberDetail.displayName)}
                    </div>
                    <div>
                      <p className="text-lg font-semibold text-slate-50">
                        {memberDetail.displayName ?? "-"}
                      </p>
                      <p className="text-xs text-slate-400">
                        {memberDetail.email ?? "-"}
                      </p>
                    </div>
                  </div>
                  <div className="mt-5 grid gap-3 text-sm text-slate-200">
                    <div className="flex justify-between">
                      <span className="text-slate-400">{copy.profile.email}</span>
                      <span>{memberDetail.email ?? "-"}</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-slate-400">
                        {copy.profile.registeredAt}
                      </span>
                      <span>{formatDate(memberDetail.createdAt, locale)}</span>
                    </div>
                  </div>
                </div>

                <div className="space-y-4">
                  <div className="rounded-2xl border border-slate-700 bg-slate-900 p-5">
                    {/* ✅ 分开展示余额和积分 */}
                    <div className="mb-4 border-b border-slate-700 pb-4">
                      <p className="text-xs text-slate-400">{copy.walletBalance}</p>
                      <p className="mt-1 text-3xl font-semibold text-white">
                        {formatBalance(memberDetail.account.balance, locale)}
                      </p>
                    </div>
                    
                    <div>
                      <p className="text-xs text-slate-400">{copy.pointsAccount}</p>
                      <p className="mt-1 text-2xl font-semibold text-emerald-400">
                        {formatPoints(memberDetail.account.points, locale)}
                      </p>
                    </div>

                    <p className="mt-3 text-xs text-slate-500">
                      {copy.tierLabel}: {memberDetail.account.tier}
                    </p>
                  </div>
                  <div className="rounded-2xl border border-slate-700 bg-slate-900 p-4">
                    <p className="text-xs text-slate-400">{copy.marketingOptIn}</p>
                    <p className="mt-2 text-sm font-semibold text-slate-100">
                      {memberDetail.marketingEmailOptIn
                        ? copy.marketingOptInYes
                        : copy.marketingOptInNo}
                    </p>
                  </div>
                </div>
              </div>
            ) : (
              <p className="mt-6 text-sm text-slate-400">{copy.selectMemberHint}</p>
            )}
          </div>

          <div className="rounded-3xl border border-slate-800 bg-slate-800/60 p-6">
            <div>
              <h2 className="text-lg font-semibold">{copy.ledgerTitle}</h2>
              <p className="text-xs text-slate-400">{copy.ledgerSubtitle}</p>
            </div>

            {ledgerEntries.length === 0 ? (
              <p className="mt-4 text-sm text-slate-400">{copy.ledgerEmpty}</p>
            ) : (
              <div className="mt-4 overflow-hidden rounded-2xl border border-slate-700">
                <table className="w-full text-left text-sm">
                  <thead className="bg-slate-900 text-xs text-slate-400">
                    <tr>
                      <th className="px-4 py-3">{copy.orderFields.time}</th>
                      <th className="px-4 py-3">Type</th>
                      <th className="px-4 py-3">Delta</th>
                      <th className="px-4 py-3">Balance</th>
                      <th className="px-4 py-3">Note</th>
                    </tr>
                  </thead>
                  <tbody>
                    {ledgerEntries.map((entry) => {
                      const label = LEDGER_LABELS[entry.type]?.[locale] ?? entry.type;
                      return (
                        <tr
                          key={entry.ledgerStableId}
                          className="border-t border-slate-800 text-xs text-slate-200"
                        >
                          <td className="px-4 py-3">
                            {formatDate(entry.createdAt, locale)}
                          </td>
                          <td className="px-4 py-3">{label}</td>
                          <td
                            className={`px-4 py-3 font-semibold ${
                              entry.deltaPoints >= 0
                                ? "text-emerald-200"
                                : "text-rose-200"
                            }`}
                          >
                            {entry.deltaPoints >= 0 ? "+" : ""}
                            {formatPoints(entry.deltaPoints, locale)}
                          </td>
                          <td className="px-4 py-3">
                            {formatPoints(entry.balanceAfterPoints, locale)}
                          </td>
                          <td className="px-4 py-3 text-slate-400">
                            {entry.note ?? "-"}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </div>

        <div className="space-y-6">
          <div className="rounded-3xl border border-slate-800 bg-slate-800/60 p-6">
            <h2 className="text-lg font-semibold">{copy.actionsTitle}</h2>
            <p className="mt-1 text-xs text-slate-400">{copy.pointsBalance}</p>
            <div className="mt-4 space-y-3">
              <button
                type="button"
                onClick={() => setAdjustOpen(true)}
                disabled={!memberDetail}
                className="w-full rounded-2xl border border-slate-700 bg-slate-900 px-4 py-3 text-sm font-semibold text-slate-100 disabled:opacity-50"
              >
                {copy.manualAdjust}
              </button>
              <button
                type="button"
                onClick={() => {
                  setRechargeOpen(true);
                  setRechargeAmount("");
                  setRechargeBonus("");
                  setRechargeCode("");
                  setRechargeVerificationToken("");
                  setRechargeStep("idle");
                  setRechargeError(null);
                }}
                disabled={!memberDetail}
                className="w-full rounded-2xl border border-emerald-400/70 bg-emerald-500/10 px-4 py-3 text-sm font-semibold text-emerald-200 disabled:opacity-50"
              >
                {copy.rechargePoints}
              </button>
            </div>
          </div>

          <div className="rounded-3xl border border-slate-800 bg-slate-800/60 p-6">
            <h2 className="text-lg font-semibold">{copy.ordersTitle}</h2>
            <p className="text-xs text-slate-400">{copy.ordersSubtitle}</p>
            {orders.length === 0 ? (
              <p className="mt-4 text-sm text-slate-400">{copy.ordersEmpty}</p>
            ) : (
              <div className="mt-4 space-y-3">
                {orders.map((order) => (
                  <div
                    key={order.orderStableId}
                    className="rounded-2xl border border-slate-700 bg-slate-900 p-4"
                  >
                    <div className="flex items-center justify-between">
                      <div>
                        <p className="text-sm font-semibold text-slate-100">
                          {order.orderStableId}
                        </p>
                        <p className="text-xs text-slate-400">
                          {formatDate(order.createdAt, locale)}
                        </p>
                      </div>
                      <span className="rounded-full border border-slate-700 bg-slate-800 px-3 py-1 text-xs text-slate-300">
                        {copy.orderStatus[
                          order.status as keyof typeof copy.orderStatus
                        ] ?? order.status}
                      </span>
                    </div>
                    <div className="mt-3 flex flex-wrap items-center justify-between gap-2 text-xs text-slate-400">
                      <span>
                        {copy.orderFields.amount}: {formatMoney(order.totalCents, locale)}
                      </span>
                      <span>
                        {copy.orderFields.fulfillment}:{" "}
                        {copy.fulfillment[
                          (order.fulfillmentType ?? "pickup") as keyof typeof copy.fulfillment
                        ] ?? order.fulfillmentType}
                      </span>
                    </div>
                    <div className="mt-3 flex gap-2">
                      <button
                        type="button"
                        className="rounded-full border border-slate-700 bg-slate-800 px-3 py-1 text-xs text-slate-200"
                      >
                        {copy.actionView}
                      </button>
                      <button
                        type="button"
                        className="rounded-full border border-rose-400/60 bg-rose-500/10 px-3 py-1 text-xs text-rose-200"
                      >
                        {copy.actionRefund}
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      </section>

      {adjustOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 px-4">
          <div className="w-full max-w-md rounded-3xl border border-slate-700 bg-slate-900 p-6 text-slate-100">
            <h3 className="text-lg font-semibold">{copy.modal.adjustTitle}</h3>
            <div className="mt-4 flex gap-2">
              <button
                type="button"
                onClick={() => setAdjustMode("add")}
                className={`flex-1 rounded-full border px-4 py-2 text-xs font-semibold ${
                  adjustMode === "add"
                    ? "border-emerald-400/70 bg-emerald-500/10 text-emerald-200"
                    : "border-slate-700 bg-slate-800 text-slate-200"
                }`}
              >
                {copy.modal.modeAdd}
              </button>
              <button
                type="button"
                onClick={() => setAdjustMode("subtract")}
                className={`flex-1 rounded-full border px-4 py-2 text-xs font-semibold ${
                  adjustMode === "subtract"
                    ? "border-rose-400/70 bg-rose-500/10 text-rose-200"
                    : "border-slate-700 bg-slate-800 text-slate-200"
                }`}
              >
                {copy.modal.modeSubtract}
              </button>
            </div>
            <div className="mt-4 space-y-3">
              <label className="text-xs text-slate-400">{copy.modal.pointsLabel}</label>
              <input
                value={adjustPoints}
                onChange={(event) => setAdjustPoints(event.target.value)}
                placeholder={copy.modal.pointsPlaceholder}
                className="h-11 w-full rounded-2xl border border-slate-700 bg-slate-800 px-4 text-sm text-slate-100"
              />
              <label className="text-xs text-slate-400">{copy.modal.reasonLabel}</label>
              <textarea
                value={adjustReason}
                onChange={(event) => setAdjustReason(event.target.value)}
                placeholder={copy.modal.reasonPlaceholder}
                className="min-h-[90px] w-full rounded-2xl border border-slate-700 bg-slate-800 px-4 py-3 text-sm text-slate-100"
              />
            </div>
            <div className="mt-6 flex justify-end gap-2">
              <button
                type="button"
                onClick={() => setAdjustOpen(false)}
                className="rounded-full border border-slate-700 bg-slate-800 px-4 py-2 text-xs text-slate-200"
              >
                {copy.modal.cancel}
              </button>
              <button
                type="button"
                onClick={() => void handleAdjustSubmit()}
                disabled={!canSubmitAdjust}
                className="rounded-full border border-emerald-400/70 bg-emerald-500/10 px-4 py-2 text-xs font-semibold text-emerald-200 disabled:opacity-50"
              >
                {adjustSubmitting ? copy.modal.submitting : copy.modal.confirm}
              </button>
            </div>
          </div>
        </div>
      )}

      {rechargeOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 px-4">
          <div className="w-full max-w-md rounded-3xl border border-slate-700 bg-slate-900 p-6 text-slate-100">
            <h3 className="text-lg font-semibold">{copy.modal.rechargeTitle}</h3>
            <div className="mt-4 space-y-3">
              <label className="text-xs text-slate-400">{copy.modal.rechargeAmount}</label>
              <input
                value={rechargeAmount}
                onChange={(event) => setRechargeAmount(event.target.value)}
                className="h-11 w-full rounded-2xl border border-slate-700 bg-slate-800 px-4 text-sm"
              />
              <p className="text-[11px] text-slate-500">{copy.modal.rechargeAmountHint}</p>
              <label className="text-xs text-slate-400">{copy.modal.bonusPoints}</label>
              <input
                value={rechargeBonus}
                onChange={(event) => setRechargeBonus(event.target.value)}
                className="h-11 w-full rounded-2xl border border-slate-700 bg-slate-800 px-4 text-sm"
              />
              <div className="space-y-2">
                <label className="text-xs text-slate-400">
                  {copy.modal.paymentMethod}
                </label>
                <div className="grid grid-cols-2 gap-2 text-xs">
                  <button
                    type="button"
                    onClick={() => setRechargePaymentMethod("cash")}
                    className={`rounded-full border px-3 py-2 ${
                      rechargePaymentMethod === "cash"
                        ? "border-emerald-400/70 bg-emerald-500/10 text-emerald-200"
                        : "border-slate-700 bg-slate-800 text-slate-200"
                    }`}
                  >
                    {copy.modal.payCash}
                  </button>
                  {/* ❌ 移除了银行卡 (Card) 按钮 */}
                  <button
                    type="button"
                    onClick={() => setRechargePaymentMethod("wechat_alipay")}
                    className={`rounded-full border px-3 py-2 ${
                      rechargePaymentMethod === "wechat_alipay"
                        ? "border-emerald-400/70 bg-emerald-500/10 text-emerald-200"
                        : "border-slate-700 bg-slate-800 text-slate-200"
                    }`}
                  >
                    {copy.modal.payWeChatAlipay}
                  </button>
                </div>
              </div>
              <label className="text-xs text-slate-400">{copy.modal.codeLabel}</label>
              <div className="flex items-center gap-2">
                <input
                  value={rechargeCode}
                  onChange={(event) => setRechargeCode(event.target.value)}
                  placeholder={copy.modal.codePlaceholder}
                  className="h-11 flex-1 rounded-2xl border border-slate-700 bg-slate-800 px-4 text-sm"
                />
                {rechargeStep === "verified" ? (
                  <span className="rounded-full border border-emerald-400/70 bg-emerald-500/10 px-3 py-2 text-xs text-emerald-200">
                    {copy.modal.verified}
                  </span>
                ) : (
                  <button
                    type="button"
                    onClick={() => void handleSendCode()}
                    disabled={!memberDetail?.phone || rechargeSubmitting}
                    className="rounded-full border border-slate-600 bg-slate-800 px-3 py-2 text-xs text-slate-200 disabled:opacity-50"
                  >
                    {copy.modal.sendCode}
                  </button>
                )}
                {rechargeStep !== "verified" && (
                  <button
                    type="button"
                    onClick={() => void handleVerifyCode()}
                    disabled={!rechargeCode.trim() || rechargeSubmitting}
                    className="rounded-full border border-emerald-400/70 bg-emerald-500/10 px-3 py-2 text-xs text-emerald-200 disabled:opacity-50"
                  >
                    {copy.modal.verifyCode}
                  </button>
                )}
              </div>
              {rechargeError && (
                <p className="text-xs text-rose-300">{rechargeError}</p>
              )}
              <div className="rounded-2xl border border-slate-700 bg-slate-800 px-4 py-3 text-xs text-slate-300">
                {copy.pointsBalance}: {formatPoints(totalRechargePoints, locale)}
              </div>
              {rechargeConvertedAmount != null && (
                <div className="rounded-2xl border border-emerald-500/40 bg-emerald-500/10 px-4 py-3 text-xs text-emerald-100">
                  {copy.modal.wechatAlipayConverted}:{" "}
                  {formatFxAmount(rechargeConvertedAmount)}
                </div>
              )}
            </div>
            <div className="mt-6 flex justify-end gap-2">
              <button
                type="button"
                onClick={closeRechargeModal}
                className="rounded-full border border-slate-700 bg-slate-800 px-4 py-2 text-xs text-slate-200"
              >
                {copy.modal.cancel}
              </button>
              <button
                type="button"
                onClick={() => void handleConfirmRecharge()}
                disabled={
                  rechargeSubmitting ||
                  rechargeStep !== "verified" ||
                  !rechargeVerificationToken ||
                  totalRechargePoints <= 0
                }
                className="rounded-full border border-emerald-400/70 bg-emerald-500/10 px-4 py-2 text-xs font-semibold text-emerald-200 disabled:opacity-50"
              >
                {rechargeSubmitting
                  ? copy.modal.submitting
                  : copy.modal.confirmRecharge}
              </button>
            </div>
          </div>
        </div>
      )}
    </main>
  );
}
