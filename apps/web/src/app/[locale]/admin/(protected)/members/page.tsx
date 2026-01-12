// apps/web/src/app/[locale]/admin/(protected)/members/page.tsx
"use client";

import { useEffect, useMemo, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import Link from "next/link";
import type { Locale } from "@/lib/i18n/locales";
import { apiFetch } from "@/lib/api/client";

type Member = {
  userStableId: string;
  displayName: string | null;
  email: string | null;
  phone: string | null;
  tier: TierKey;
  points: number;
  status: StatusKey;
  createdAt: string;
};

type TierKey = "BRONZE" | "SILVER" | "GOLD" | "PLATINUM";

type StatusKey = "ACTIVE" | "DISABLED";

type MemberListResponse = {
  items: Member[];
  total: number;
  page: number;
  pageSize: number;
};

type MemberDetail = {
  userStableId: string;
  displayName: string | null;
  email: string | null;
  phone: string | null;
  phoneVerifiedAt: string | null;
  status: StatusKey;
  createdAt: string;
  marketingEmailOptIn: boolean;
  birthdayMonth: number | null;
  birthdayDay: number | null;
  account: {
    tier: TierKey;
    points: number;
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
  clientRequestId: string | null;
  createdAt: string;
  status: string;
  totalCents: number;
  fulfillmentType: string | null;
  deliveryType: string | null;
};

const tierLabels: Record<Locale, Record<TierKey, string>> = {
  zh: {
    BRONZE: "青铜",
    SILVER: "白银",
    GOLD: "黄金",
    PLATINUM: "铂金",
  },
  en: {
    BRONZE: "Bronze",
    SILVER: "Silver",
    GOLD: "Gold",
    PLATINUM: "Platinum",
  },
};

const statusLabels: Record<Locale, Record<StatusKey, string>> = {
  zh: {
    ACTIVE: "活跃",
    DISABLED: "禁用",
  },
  en: {
    ACTIVE: "Active",
    DISABLED: "Disabled",
  },
};

const orderStatusLabels: Record<
  string,
  {
    zh: string;
    en: string;
  }
> = {
  paid: { zh: "已支付", en: "Paid" },
  pending: { zh: "待支付", en: "Pending" },
  making: { zh: "制作中", en: "In progress" },
  ready: { zh: "待取餐", en: "Ready" },
  completed: { zh: "已完成", en: "Completed" },
  refunded: { zh: "已退款", en: "Refunded" },
};

const fulfillmentLabels: Record<
  string,
  {
    zh: string;
    en: string;
  }
> = {
  pickup: { zh: "自取", en: "Pickup" },
  dine_in: { zh: "堂食", en: "Dine-in" },
  takeout: { zh: "外带", en: "Takeout" },
  delivery: { zh: "外卖", en: "Delivery" },
};

function statusTone(status: StatusKey): string {
  return status === "ACTIVE" ? "bg-emerald-50 text-emerald-700" : "bg-slate-100 text-slate-600";
}

function tierTone(tier: TierKey): string {
  switch (tier) {
    case "PLATINUM":
      return "bg-indigo-50 text-indigo-700";
    case "GOLD":
      return "bg-amber-50 text-amber-700";
    case "SILVER":
      return "bg-slate-100 text-slate-600";
    default:
      return "bg-orange-50 text-orange-700";
  }
}

function formatDate(value?: string | null): string {
  if (!value) return "-";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleDateString();
}

function formatMoney(cents: number, locale: Locale) {
  return new Intl.NumberFormat(locale === "zh" ? "zh-CN" : "en-US", {
    style: "currency",
    currency: locale === "zh" ? "CNY" : "USD",
  }).format(cents / 100);
}

function isWithinDays(value: string, days: number): boolean {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return false;
  const diffMs = Date.now() - date.getTime();
  return diffMs <= days * 24 * 60 * 60 * 1000;
}

export default function AdminMembersPage() {
  const { locale } = useParams<{ locale: Locale }>();
  const isZh = locale === "zh";
  const router = useRouter();

  const [keyword, setKeyword] = useState("");
  const [tierFilter, setTierFilter] = useState<"ALL" | TierKey>("ALL");
  const [statusFilter, setStatusFilter] = useState<"ALL" | StatusKey>("ALL");

  const [members, setMembers] = useState<Member[]>([]);
  const [membersTotal, setMembersTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [selectedMemberId, setSelectedMemberId] = useState<string | null>(null);
  const [detailLoading, setDetailLoading] = useState(false);
  const [detailError, setDetailError] = useState<string | null>(null);
  const [memberDetail, setMemberDetail] = useState<MemberDetail | null>(null);
  const [memberOrders, setMemberOrders] = useState<OrderEntry[]>([]);
  const [memberLedger, setMemberLedger] = useState<LedgerEntry[]>([]);
  const [banLoadingIds, setBanLoadingIds] = useState<Record<string, boolean>>({});

  useEffect(() => {
    let cancelled = false;

    async function loadMembers() {
      setLoading(true);
      setLoadError(null);
      try {
        const params = new URLSearchParams();
        const trimmed = keyword.trim();
        if (trimmed) params.set("search", trimmed);
        if (tierFilter !== "ALL") params.set("tier", tierFilter);
        if (statusFilter !== "ALL") params.set("status", statusFilter);
        params.set("pageSize", "200");

        const query = params.toString();
        const data = await apiFetch<MemberListResponse>(`/admin/members${query ? `?${query}` : ""}`);

        if (cancelled) return;
        setMembers(data.items ?? []);
        setMembersTotal(data.total ?? data.items?.length ?? 0);
      } catch (error) {
        console.error(error);
        if (!cancelled) {
          setLoadError(isZh ? "加载会员数据失败。" : "Failed to load members.");
          setMembers([]);
          setMembersTotal(0);
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    }

    void loadMembers();

    return () => {
      cancelled = true;
    };
  }, [isZh, keyword, statusFilter, tierFilter]);

  useEffect(() => {
    if (!selectedMemberId) {
      setMemberDetail(null);
      setMemberOrders([]);
      setMemberLedger([]);
      setDetailError(null);
      setDetailLoading(false);
      return;
    }

    let cancelled = false;

    async function loadMemberDetail() {
      setDetailLoading(true);
      setDetailError(null);
      try {
        const [detail, ledger, orders] = await Promise.all([
          apiFetch<MemberDetail>(`/admin/members/${selectedMemberId}`),
          apiFetch<LedgerEntry[] | { entries: LedgerEntry[] }>(
            `/admin/members/${selectedMemberId}/loyalty-ledger?limit=50`,
          ),
          apiFetch<OrderEntry[] | { orders: OrderEntry[] }>(`/admin/members/${selectedMemberId}/orders?limit=50`),
        ]);

        if (cancelled) return;
        const normalizedLedger = Array.isArray(ledger) ? ledger : ledger?.entries ?? [];
        const normalizedOrders = Array.isArray(orders) ? orders : orders?.orders ?? [];
        setMemberDetail(detail);
        setMemberLedger(normalizedLedger);
        setMemberOrders(normalizedOrders);
      } catch (error) {
        console.error(error);
        if (!cancelled) {
          setDetailError(isZh ? "加载会员详情失败。" : "Failed to load member details.");
          setMemberDetail(null);
          setMemberLedger([]);
          setMemberOrders([]);
        }
      } finally {
        if (!cancelled) setDetailLoading(false);
      }
    }

    void loadMemberDetail();

    return () => {
      cancelled = true;
    };
  }, [isZh, selectedMemberId]);

  const activeCount = useMemo(() => members.filter((member) => member.status === "ACTIVE").length, [members]);
  const recentRegistered = useMemo(
    () => members.filter((member) => isWithinDays(member.createdAt, 30)).length,
    [members],
  );
  const pointsTotal = useMemo(() => members.reduce((sum, member) => sum + member.points, 0), [members]);

  const handleToggleBan = async (member: Member) => {
    setBanLoadingIds((prev) => ({ ...prev, [member.userStableId]: true }));
    try {
      await apiFetch(`/admin/members/${member.userStableId}/ban`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ disabled: member.status === "ACTIVE" }),
      });
      setMembers((prev) =>
        prev.map((item) =>
          item.userStableId === member.userStableId
            ? { ...item, status: member.status === "ACTIVE" ? "DISABLED" : "ACTIVE" }
            : item,
        ),
      );
      setMemberDetail((prev) =>
        prev && prev.userStableId === member.userStableId
          ? {
              ...prev,
              status: member.status === "ACTIVE" ? "DISABLED" : "ACTIVE",
            }
          : prev,
      );
    } catch (error) {
      console.error(error);
      setLoadError(isZh ? "更新会员状态失败。" : "Failed to update member status.");
    } finally {
      setBanLoadingIds((prev) => ({ ...prev, [member.userStableId]: false }));
    }
  };

  return (
    <div className="space-y-6">
      <header className="flex flex-col gap-2 md:flex-row md:items-center md:justify-between">
        <div>
          <h1 className="text-2xl font-semibold">{isZh ? "会员管理" : "Member Management"}</h1>
          <p className="text-sm text-slate-500">
            {isZh
              ? "管理会员资料、等级与积分规则，支持快速录入与查询。"
              : "Manage member profiles, tiers, and points with quick add & search."}
          </p>
        </div>
        <div className="flex gap-2">
          <button
            type="button"
            className="rounded-md border border-slate-200 px-4 py-2 text-sm font-medium text-slate-600 hover:bg-slate-50"
          >
            {isZh ? "导出会员" : "Export"}
          </button>
        </div>
      </header>

      <section className="grid gap-4 md:grid-cols-3">
        <div className="rounded-lg border border-slate-200 bg-white p-4">
          <p className="text-sm text-slate-500">{isZh ? "会员总数" : "Total members"}</p>
          <p className="mt-2 text-2xl font-semibold">{membersTotal}</p>
          <p className="mt-1 text-xs text-slate-400">{isZh ? "含全部等级" : "All tiers included"}</p>
        </div>
        <div className="rounded-lg border border-slate-200 bg-white p-4">
          <p className="text-sm text-slate-500">{isZh ? "近 30 天注册" : "Registered in 30 days"}</p>
          <p className="mt-2 text-2xl font-semibold">{recentRegistered}</p>
          <p className="mt-1 text-xs text-slate-400">{isZh ? "最近 30 天注册会员" : "New members in the last 30 days"}</p>
        </div>
        <div className="rounded-lg border border-slate-200 bg-white p-4">
          <p className="text-sm text-slate-500">{isZh ? "积分余额" : "Points balance"}</p>
          <p className="mt-2 text-2xl font-semibold">{pointsTotal.toLocaleString()}</p>
          <p className="mt-1 text-xs text-slate-400">{isZh ? "含可抵扣积分" : "Redeemable points"}</p>
        </div>
      </section>

      <section className="grid gap-6">
        <div className="rounded-lg border border-slate-200 bg-white p-4">
          <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
            <h2 className="text-lg font-semibold">{isZh ? "会员列表" : "Member list"}</h2>
            <div className="flex flex-wrap gap-2">
              <input
                value={keyword}
                onChange={(event) => setKeyword(event.target.value)}
                placeholder={isZh ? "搜索姓名/手机号/编号" : "Search name / phone / ID"}
                className="h-9 w-56 rounded-md border border-slate-200 px-3 text-sm"
              />
              <select
                value={tierFilter}
                onChange={(event) => setTierFilter(event.target.value as "ALL" | TierKey)}
                className="h-9 rounded-md border border-slate-200 px-3 text-sm"
              >
                <option value="ALL">{isZh ? "全部等级" : "All tiers"}</option>
                <option value="BRONZE">{tierLabels[locale].BRONZE}</option>
                <option value="SILVER">{tierLabels[locale].SILVER}</option>
                <option value="GOLD">{tierLabels[locale].GOLD}</option>
                <option value="PLATINUM">{tierLabels[locale].PLATINUM}</option>
              </select>
              <select
                value={statusFilter}
                onChange={(event) => setStatusFilter(event.target.value as "ALL" | StatusKey)}
                className="h-9 rounded-md border border-slate-200 px-3 text-sm"
              >
                <option value="ALL">{isZh ? "全部状态" : "All status"}</option>
                <option value="ACTIVE">{statusLabels[locale].ACTIVE}</option>
                <option value="DISABLED">{statusLabels[locale].DISABLED}</option>
              </select>
            </div>
          </div>

          <div className="mt-4 overflow-hidden rounded-lg border border-slate-200">
            <table className="w-full text-sm">
              <thead className="bg-slate-50 text-left text-slate-500">
                <tr>
                  <th className="px-4 py-3">{isZh ? "会员" : "Member"}</th>
                  <th className="px-4 py-3">{isZh ? "等级" : "Tier"}</th>
                  <th className="px-4 py-3">{isZh ? "积分" : "Points"}</th>
                  <th className="px-4 py-3">{isZh ? "状态" : "Status"}</th>
                  <th className="px-4 py-3">{isZh ? "注册时间" : "Joined"}</th>
                  <th className="px-4 py-3 text-right">{isZh ? "操作" : "Action"}</th>
                </tr>
              </thead>
              <tbody>
                {loading && (
                  <tr>
                    <td colSpan={6} className="px-4 py-8 text-center text-slate-400">
                      {isZh ? "加载中..." : "Loading..."}
                    </td>
                  </tr>
                )}
                {!loading && loadError && (
                  <tr>
                    <td colSpan={6} className="px-4 py-8 text-center text-slate-400">
                      {loadError}
                    </td>
                  </tr>
                )}
                {!loading &&
                  !loadError &&
                  members.map((member) => (
                    <tr
                      key={member.userStableId}
                      className={`border-t border-slate-100 transition ${
                        selectedMemberId === member.userStableId ? "bg-slate-50" : "hover:bg-slate-50"
                      }`}
                      onClick={() => setSelectedMemberId(member.userStableId)}
                    >
                      <td className="px-4 py-3">
                        <div className="font-medium text-slate-900">
                          {member.displayName ?? (isZh ? "未命名" : "Unnamed")}
                        </div>
                        <div className="text-xs text-slate-400">{member.userStableId}</div>
                        <div className="text-xs text-slate-400">{member.phone ?? "-"}</div>
                      </td>
                      <td className="px-4 py-3">
                        <span className={`inline-flex rounded-full px-2 py-1 text-xs ${tierTone(member.tier)}`}>
                          {tierLabels[locale][member.tier]}
                        </span>
                      </td>
                      <td className="px-4 py-3 font-semibold text-slate-700">
                        {member.points.toLocaleString()}
                      </td>
                      <td className="px-4 py-3">
                        <span
                          className={`inline-flex rounded-full px-2 py-1 text-xs ${statusTone(member.status)}`}
                        >
                          {statusLabels[locale][member.status]}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-slate-600">{formatDate(member.createdAt)}</td>
                      <td className="px-4 py-3 text-right">
                        <button
                          type="button"
                          className={`inline-flex items-center rounded-md px-3 py-1 text-xs font-semibold ${
                            member.status === "ACTIVE"
                              ? "bg-rose-50 text-rose-600 hover:bg-rose-100"
                              : "bg-emerald-50 text-emerald-600 hover:bg-emerald-100"
                          }`}
                          onClick={(event) => {
                            event.stopPropagation();
                            void handleToggleBan(member);
                          }}
                          disabled={banLoadingIds[member.userStableId]}
                        >
                          {banLoadingIds[member.userStableId]
                            ? isZh
                              ? "处理中..."
                              : "Working..."
                            : member.status === "ACTIVE"
                              ? isZh
                                ? "封禁"
                                : "Ban"
                              : isZh
                                ? "恢复"
                                : "Restore"}
                        </button>
                      </td>
                    </tr>
                  ))}
                {!loading && !loadError && members.length === 0 && (
                  <tr>
                    <td colSpan={6} className="px-4 py-8 text-center text-slate-400">
                      {isZh ? "未找到匹配的会员" : "No members found"}
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>

          <div className="mt-4 flex flex-wrap gap-2 text-xs text-slate-500">
            <span>{isZh ? `活跃会员：${activeCount}` : `Active members: ${activeCount}`}</span>
            <span>·</span>
            <span>{isZh ? "按手机号验证后可自动积分" : "Verify phone to enable auto points"}</span>
            <span>·</span>
            <span>{isZh ? "点击会员行查看详细资料" : "Click a row to view full details"}</span>
          </div>
        </div>

        <div className="rounded-lg border border-slate-200 bg-white p-4">
          <div className="flex flex-col gap-1">
            <h3 className="text-lg font-semibold">{isZh ? "会员详情" : "Member details"}</h3>
            <p className="text-xs text-slate-400">
              {isZh ? "包含账户信息与历史消费记录" : "Profile info with order & points history"}
            </p>
          </div>
          {!selectedMemberId && (
            <div className="mt-4 rounded-md border border-dashed border-slate-200 p-6 text-center text-sm text-slate-400">
              {isZh ? "点击上方会员记录查看详情" : "Select a member above to see details."}
            </div>
          )}
          {selectedMemberId && detailLoading && (
            <div className="mt-4 text-sm text-slate-400">{isZh ? "正在加载详情..." : "Loading details..."}</div>
          )}
          {selectedMemberId && detailError && (
            <div className="mt-4 text-sm text-rose-500">{detailError}</div>
          )}
          {selectedMemberId && !detailLoading && !detailError && memberDetail && (
            <div className="mt-4 space-y-6">
              <div className="grid gap-4 md:grid-cols-3">
                <div className="rounded-md bg-slate-50 p-3">
                  <p className="text-xs text-slate-400">{isZh ? "会员编号" : "Member ID"}</p>
                  <p className="mt-1 text-sm font-semibold text-slate-800">{memberDetail.userStableId}</p>
                </div>
                <div className="rounded-md bg-slate-50 p-3">
                  <p className="text-xs text-slate-400">{isZh ? "会员名称" : "Name"}</p>
                  <p className="mt-1 text-sm font-semibold text-slate-800">
                    {memberDetail.displayName ?? (isZh ? "未命名" : "Unnamed")}
                  </p>
                </div>
                <div className="rounded-md bg-slate-50 p-3">
                  <p className="text-xs text-slate-400">{isZh ? "注册时间" : "Registered"}</p>
                  <p className="mt-1 text-sm font-semibold text-slate-800">
                    {formatDate(memberDetail.createdAt)}
                  </p>
                </div>
                <div className="rounded-md bg-slate-50 p-3">
                  <p className="text-xs text-slate-400">{isZh ? "手机号" : "Phone"}</p>
                  <p className="mt-1 text-sm font-semibold text-slate-800">{memberDetail.phone ?? "-"}</p>
                  <p className="text-xs text-slate-400">
                    {memberDetail.phoneVerifiedAt
                      ? isZh
                        ? "已验证"
                        : "Verified"
                      : isZh
                        ? "未验证"
                        : "Unverified"}
                  </p>
                </div>
                <div className="rounded-md bg-slate-50 p-3">
                  <p className="text-xs text-slate-400">{isZh ? "邮箱" : "Email"}</p>
                  <p className="mt-1 text-sm font-semibold text-slate-800">{memberDetail.email ?? "-"}</p>
                </div>
                <div className="rounded-md bg-slate-50 p-3">
                  <p className="text-xs text-slate-400">{isZh ? "会员状态" : "Status"}</p>
                  <p className="mt-1 text-sm font-semibold text-slate-800">
                    {statusLabels[locale][memberDetail.status]}
                  </p>
                </div>
                <div className="rounded-md bg-slate-50 p-3">
                  <p className="text-xs text-slate-400">{isZh ? "会员等级" : "Tier"}</p>
                  <p className="mt-1 text-sm font-semibold text-slate-800">
                    {tierLabels[locale][memberDetail.account.tier]}
                  </p>
                </div>
                <div className="rounded-md bg-slate-50 p-3">
                  <p className="text-xs text-slate-400">{isZh ? "积分余额" : "Points"}</p>
                  <p className="mt-1 text-sm font-semibold text-slate-800">
                    {memberDetail.account.points.toLocaleString()}
                  </p>
                </div>
                <div className="rounded-md bg-slate-50 p-3">
                  <p className="text-xs text-slate-400">{isZh ? "累计消费" : "Lifetime spend"}</p>
                  <p className="mt-1 text-sm font-semibold text-slate-800">
                    {formatMoney(memberDetail.account.lifetimeSpendCents, locale)}
                  </p>
                </div>
                <div className="rounded-md bg-slate-50 p-3">
                  <p className="text-xs text-slate-400">{isZh ? "生日" : "Birthday"}</p>
                  <p className="mt-1 text-sm font-semibold text-slate-800">
                    {memberDetail.birthdayMonth && memberDetail.birthdayDay
                      ? `${memberDetail.birthdayMonth}/${memberDetail.birthdayDay}`
                      : "-"}
                  </p>
                </div>
              </div>

              <div className="space-y-6">
                <div>
                  <h4 className="text-sm font-semibold">{isZh ? "历史消费记录" : "Order history"}</h4>
                  <div className="mt-2 overflow-x-auto rounded-md border border-slate-200">
                    <table className="min-w-[560px] w-full text-xs">
                      <thead className="bg-slate-50 text-left text-slate-400">
                        <tr>
                          <th className="px-3 py-2">{isZh ? "订单号" : "Order"}</th>
                          <th className="px-3 py-2">{isZh ? "时间" : "Time"}</th>
                          <th className="px-3 py-2">{isZh ? "状态" : "Status"}</th>
                          <th className="px-3 py-2">{isZh ? "金额" : "Amount"}</th>
                          <th className="px-3 py-2">{isZh ? "类型" : "Type"}</th>
                        </tr>
                      </thead>
                      <tbody>
                        {memberOrders.map((order) => {
                          const statusLabel = orderStatusLabels[order.status]?.[locale] ?? order.status;
                          const fulfillment =
                            fulfillmentLabels[order.fulfillmentType ?? ""]?.[locale] ?? order.fulfillmentType ?? "-";
                          const displayOrderNumber = order.clientRequestId ?? order.orderStableId;
                          return (
                            <tr
                              key={order.orderStableId}
                              className="cursor-pointer border-t border-slate-100 transition hover:bg-slate-50"
                              onClick={() => router.push(`/${locale}/order/${order.orderStableId}`)}
                            >
                              <td className="px-3 py-2 font-medium text-slate-700">
                                <Link
                                  href={`/${locale}/order/${order.orderStableId}`}
                                  className="underline decoration-dashed underline-offset-2 hover:text-slate-900"
                                  onClick={(event) => event.stopPropagation()}
                                >
                                  {displayOrderNumber}
                                </Link>
                              </td>
                              <td className="px-3 py-2 text-slate-500">{formatDate(order.createdAt)}</td>
                              <td className="px-3 py-2 text-slate-500">{statusLabel}</td>
                              <td className="px-3 py-2 text-slate-700">
                                {formatMoney(order.totalCents, locale)}
                              </td>
                              <td className="px-3 py-2 text-slate-500">{fulfillment}</td>
                            </tr>
                          );
                        })}
                        {memberOrders.length === 0 && (
                          <tr>
                            <td colSpan={5} className="px-3 py-4 text-center text-slate-400">
                              {isZh ? "暂无历史订单。" : "No orders yet."}
                            </td>
                          </tr>
                        )}
                      </tbody>
                    </table>
                  </div>
                </div>
                <div>
                  <h4 className="text-sm font-semibold">{isZh ? "积分记录" : "Points ledger"}</h4>
                  <div className="mt-2 overflow-x-auto rounded-md border border-slate-200">
                    <table className="min-w-[520px] w-full text-xs">
                      <thead className="bg-slate-50 text-left text-slate-400">
                        <tr>
                          <th className="px-3 py-2">{isZh ? "时间" : "Time"}</th>
                          <th className="px-3 py-2">{isZh ? "类型" : "Type"}</th>
                          <th className="px-3 py-2">{isZh ? "积分变动" : "Delta"}</th>
                          <th className="px-3 py-2">{isZh ? "余额" : "Balance"}</th>
                        </tr>
                      </thead>
                      <tbody>
                        {memberLedger.map((entry) => (
                          <tr key={entry.ledgerStableId} className="border-t border-slate-100">
                            <td className="px-3 py-2 text-slate-500">{formatDate(entry.createdAt)}</td>
                            <td className="px-3 py-2 text-slate-500">{entry.type}</td>
                            <td className="px-3 py-2 text-slate-700">
                              {entry.deltaPoints > 0 ? "+" : ""}
                              {entry.deltaPoints}
                            </td>
                            <td className="px-3 py-2 text-slate-700">{entry.balanceAfterPoints}</td>
                          </tr>
                        ))}
                        {memberLedger.length === 0 && (
                          <tr>
                            <td colSpan={4} className="px-3 py-4 text-center text-slate-400">
                              {isZh ? "暂无积分记录。" : "No ledger entries."}
                            </td>
                          </tr>
                        )}
                      </tbody>
                    </table>
                  </div>
                </div>
              </div>
            </div>
          )}
        </div>
      </section>
    </div>
  );
}
