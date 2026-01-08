// apps/web/src/app/[locale]/admin/(protected)/members/page.tsx
"use client";

import { useMemo, useState } from "react";
import { useParams } from "next/navigation";
import type { Locale } from "@/lib/i18n/locales";

const mockMembers = [
  {
    id: "SQ-20240318",
    name: "王小雨",
    phone: "138-****-3489",
    email: "xiaoyu.wang@example.com",
    tier: "GOLD",
    points: 1280,
    status: "ACTIVE",
    joinedAt: "2024-03-18",
    lastVisit: "2024-09-02",
    tags: ["线上注册", "生日月"],
  },
  {
    id: "SQ-20240105",
    name: "陈旭",
    phone: "186-****-7801",
    email: "chenxu@example.com",
    tier: "SILVER",
    points: 620,
    status: "ACTIVE",
    joinedAt: "2024-01-05",
    lastVisit: "2024-08-21",
    tags: ["堂食", "已验证"],
  },
  {
    id: "SQ-20231212",
    name: "刘佳",
    phone: "155-****-9012",
    email: "liujia@example.com",
    tier: "PLATINUM",
    points: 3560,
    status: "ACTIVE",
    joinedAt: "2023-12-12",
    lastVisit: "2024-09-08",
    tags: ["VIP", "企业客户"],
  },
  {
    id: "SQ-20231102",
    name: "周敏",
    phone: "139-****-2277",
    email: "zhoumin@example.com",
    tier: "BRONZE",
    points: 120,
    status: "SLEEP",
    joinedAt: "2023-11-02",
    lastVisit: "2024-05-14",
    tags: ["活动领券"],
  },
  {
    id: "SQ-20240228",
    name: "黄志强",
    phone: "177-****-6621",
    email: "huangzq@example.com",
    tier: "GOLD",
    points: 980,
    status: "ACTIVE",
    joinedAt: "2024-02-28",
    lastVisit: "2024-08-30",
    tags: ["到店注册", "可积分抵扣"],
  },
];

type TierKey = "BRONZE" | "SILVER" | "GOLD" | "PLATINUM";

type StatusKey = "ACTIVE" | "SLEEP";

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
    SLEEP: "沉睡",
  },
  en: {
    ACTIVE: "Active",
    SLEEP: "Dormant",
  },
};

function statusTone(status: StatusKey): string {
  return status === "ACTIVE" ? "bg-emerald-50 text-emerald-700" : "bg-amber-50 text-amber-700";
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

export default function AdminMembersPage() {
  const { locale } = useParams<{ locale: Locale }>();
  const isZh = locale === "zh";

  const [keyword, setKeyword] = useState("");
  const [tierFilter, setTierFilter] = useState<"ALL" | TierKey>("ALL");
  const [statusFilter, setStatusFilter] = useState<"ALL" | StatusKey>("ALL");
  const [submitHint, setSubmitHint] = useState<string | null>(null);

  const filteredMembers = useMemo(() => {
    const trimmed = keyword.trim().toLowerCase();
    return mockMembers.filter((member) => {
      if (tierFilter !== "ALL" && member.tier !== tierFilter) return false;
      if (statusFilter !== "ALL" && member.status !== statusFilter) return false;
      if (!trimmed) return true;
      return (
        member.name.toLowerCase().includes(trimmed) ||
        member.phone.toLowerCase().includes(trimmed) ||
        member.id.toLowerCase().includes(trimmed)
      );
    });
  }, [keyword, statusFilter, tierFilter]);

  const activeCount = mockMembers.filter((member) => member.status === "ACTIVE").length;
  const monthlyActive = mockMembers.filter((member) => member.lastVisit >= "2024-08-01").length;
  const pointsTotal = mockMembers.reduce((sum, member) => sum + member.points, 0);

  function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSubmitHint(
      isZh ? "已保存为草稿，提交前请再确认手机号。" : "Saved as draft. Please verify the phone before submitting.",
    );
  }

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
          <button
            type="button"
            className="rounded-md bg-emerald-600 px-4 py-2 text-sm font-medium text-white hover:bg-emerald-500"
          >
            {isZh ? "新建活动" : "New campaign"}
          </button>
        </div>
      </header>

      <section className="grid gap-4 md:grid-cols-3">
        <div className="rounded-lg border border-slate-200 bg-white p-4">
          <p className="text-sm text-slate-500">{isZh ? "会员总数" : "Total members"}</p>
          <p className="mt-2 text-2xl font-semibold">{mockMembers.length}</p>
          <p className="mt-1 text-xs text-slate-400">{isZh ? "含全部等级" : "All tiers included"}</p>
        </div>
        <div className="rounded-lg border border-slate-200 bg-white p-4">
          <p className="text-sm text-slate-500">{isZh ? "本月活跃" : "Monthly active"}</p>
          <p className="mt-2 text-2xl font-semibold">{monthlyActive}</p>
          <p className="mt-1 text-xs text-slate-400">{isZh ? "近 30 天到店或下单" : "Visited in the last 30 days"}</p>
        </div>
        <div className="rounded-lg border border-slate-200 bg-white p-4">
          <p className="text-sm text-slate-500">{isZh ? "积分余额" : "Points balance"}</p>
          <p className="mt-2 text-2xl font-semibold">{pointsTotal.toLocaleString()}</p>
          <p className="mt-1 text-xs text-slate-400">{isZh ? "含可抵扣积分" : "Redeemable points"}</p>
        </div>
      </section>

      <section className="grid gap-6 lg:grid-cols-[2fr_1fr]">
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
                <option value="SLEEP">{statusLabels[locale].SLEEP}</option>
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
                  <th className="px-4 py-3">{isZh ? "最近到店" : "Last visit"}</th>
                </tr>
              </thead>
              <tbody>
                {filteredMembers.map((member) => (
                  <tr key={member.id} className="border-t border-slate-100">
                    <td className="px-4 py-3">
                      <div className="font-medium text-slate-900">{member.name}</div>
                      <div className="text-xs text-slate-400">{member.id}</div>
                      <div className="text-xs text-slate-400">{member.phone}</div>
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
                        className={`inline-flex rounded-full px-2 py-1 text-xs ${statusTone(member.status as StatusKey)}`}
                      >
                        {statusLabels[locale][member.status as StatusKey]}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-slate-600">{member.lastVisit}</td>
                  </tr>
                ))}
                {filteredMembers.length === 0 && (
                  <tr>
                    <td colSpan={5} className="px-4 py-8 text-center text-slate-400">
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
          </div>
        </div>

        <div className="rounded-lg border border-slate-200 bg-white p-4">
          <h2 className="text-lg font-semibold">{isZh ? "新增会员" : "Add member"}</h2>
          <p className="mt-1 text-sm text-slate-500">
            {isZh ? "完善会员资料与积分初始化信息。" : "Fill out profile details and initialize points."}
          </p>

          <form onSubmit={handleSubmit} className="mt-4 space-y-4">
            <div className="space-y-2">
              <label className="text-sm font-medium text-slate-700">{isZh ? "姓名" : "Name"}</label>
              <input
                className="h-9 w-full rounded-md border border-slate-200 px-3 text-sm"
                placeholder={isZh ? "请输入会员姓名" : "Enter member name"}
              />
            </div>

            <div className="space-y-2">
              <label className="text-sm font-medium text-slate-700">{isZh ? "手机号" : "Phone"}</label>
              <input
                className="h-9 w-full rounded-md border border-slate-200 px-3 text-sm"
                placeholder={isZh ? "用于积分验证" : "For points verification"}
              />
              <p className="text-xs text-slate-400">
                {isZh ? "建议当场验证短信，避免积分累计失败。" : "Verify SMS to ensure points tracking."}
              </p>
            </div>

            <div className="space-y-2">
              <label className="text-sm font-medium text-slate-700">{isZh ? "邮箱" : "Email"}</label>
              <input
                className="h-9 w-full rounded-md border border-slate-200 px-3 text-sm"
                placeholder={isZh ? "用于发送生日券" : "Used for birthday offers"}
              />
            </div>

            <div className="grid gap-3 md:grid-cols-2">
              <div className="space-y-2">
                <label className="text-sm font-medium text-slate-700">{isZh ? "会员等级" : "Tier"}</label>
                <select
                  className="h-9 w-full rounded-md border border-slate-200 px-3 text-sm"
                  defaultValue="BRONZE"
                >
                  <option value="BRONZE">{tierLabels[locale].BRONZE}</option>
                  <option value="SILVER">{tierLabels[locale].SILVER}</option>
                  <option value="GOLD">{tierLabels[locale].GOLD}</option>
                  <option value="PLATINUM">{tierLabels[locale].PLATINUM}</option>
                </select>
              </div>
              <div className="space-y-2">
                <label className="text-sm font-medium text-slate-700">{isZh ? "初始积分" : "Initial points"}</label>
                <input
                  className="h-9 w-full rounded-md border border-slate-200 px-3 text-sm"
                  placeholder={isZh ? "例如 100" : "e.g. 100"}
                />
              </div>
            </div>

            <div className="grid gap-3 md:grid-cols-2">
              <div className="space-y-2">
                <label className="text-sm font-medium text-slate-700">{isZh ? "生日" : "Birthday"}</label>
                <input
                  type="date"
                  className="h-9 w-full rounded-md border border-slate-200 px-3 text-sm"
                />
              </div>
              <div className="space-y-2">
                <label className="text-sm font-medium text-slate-700">{isZh ? "来源" : "Source"}</label>
                <select
                  className="h-9 w-full rounded-md border border-slate-200 px-3 text-sm"
                  defaultValue="STORE"
                >
                  <option value="STORE">{isZh ? "门店注册" : "In-store"}</option>
                  <option value="ONLINE">{isZh ? "线上注册" : "Online"}</option>
                  <option value="EVENT">{isZh ? "活动导入" : "Campaign"}</option>
                </select>
              </div>
            </div>

            <div className="space-y-2">
              <label className="text-sm font-medium text-slate-700">{isZh ? "备注" : "Notes"}</label>
              <textarea
                className="min-h-[90px] w-full rounded-md border border-slate-200 px-3 py-2 text-sm"
                placeholder={isZh ? "偏好口味、常点菜品、注意事项" : "Preferences, favorite dishes, notes"}
              />
            </div>

            <div className="rounded-md bg-slate-50 p-3 text-xs text-slate-500">
              {isZh
                ? "保存后可在会员详情中补充地址、营销订阅与优惠券发放。"
                : "After saving, you can add addresses, marketing consent, and coupons in the member profile."}
            </div>

            <button
              type="submit"
              className="w-full rounded-md bg-emerald-600 px-4 py-2 text-sm font-medium text-white hover:bg-emerald-500"
            >
              {isZh ? "保存并创建会员" : "Save & create member"}
            </button>

            {submitHint && <p className="text-xs text-emerald-600">{submitHint}</p>}
          </form>
        </div>
      </section>
    </div>
  );
}
