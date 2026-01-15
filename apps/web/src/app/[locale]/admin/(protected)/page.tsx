//apps/web/src/app/[locale]/admin/(protected)/page.tsx
"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { useParams } from "next/navigation";
import type { Locale } from "@/lib/i18n/locales";
import { apiFetch } from "@/lib/api/client";

// ========== 基本类型 ========== //

export type Holiday = {
  id: string;
  date: string;
  reason: string;
};

// —— 和 /admin/setting 页保持一致的类型 —— //
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

type StaffSummaryUser = {
  userStableId: string;
  status?: "ACTIVE" | "DISABLED";
  role?: "ADMIN" | "STAFF";
};

type StaffSummaryInvite = {
  inviteStableId: string;
  status?: "PENDING" | "ACCEPTED" | "EXPIRED" | "REVOKED";
};

type StaffSummaryResponse = {
  staff?: StaffSummaryUser[];
  users?: StaffSummaryUser[];
};

type StaffInviteSummaryResponse = {
  invites?: StaffSummaryInvite[];
};

type AdminSessionResponse = {
  userStableId?: string;
  email?: string;
  role?: string;
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

export default function AdminDashboard() {
  const { locale } = useParams<{ locale: Locale }>();
  const isZh = locale === "zh";

  const [hours, setHours] = useState<BusinessHourDto[]>([]);
  const [holidays, setHolidays] = useState<Holiday[]>([]);
  const [hoursLoading, setHoursLoading] = useState(true);
  const [hoursError, setHoursError] = useState<string | null>(null);

  const weekdayLabels = useMemo(() => (isZh ? WEEKDAY_LABELS_ZH : WEEKDAY_LABELS_EN), [isZh]);

  const [staffCount, setStaffCount] = useState<number | null>(null);
  const [pendingInvitesCount, setPendingInvitesCount] = useState<number | null>(null);
  const [staffSummaryLoading, setStaffSummaryLoading] = useState(true);
  const [staffSummaryError, setStaffSummaryError] = useState<string | null>(null);
  const [sessionRole, setSessionRole] = useState<string | null>(null);
  const [sessionLoading, setSessionLoading] = useState(true);

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

  useEffect(() => {
    let cancelled = false;

    async function loadSession() {
      try {
        const res = await apiFetch<AdminSessionResponse>("/auth/me");
        if (!cancelled) setSessionRole(res.role ?? null);
      } catch (e) {
        console.error(e);
        if (!cancelled) setSessionRole(null);
      } finally {
        if (!cancelled) setSessionLoading(false);
      }
    }

    void loadSession();

    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    let cancelled = false;

    async function loadStaffSummary() {
      if (sessionLoading) return;
      if (sessionRole !== "ADMIN") {
        setStaffSummaryLoading(false);
        setStaffSummaryError(isZh ? "仅管理员可查看员工统计。" : "Only admins can view staff summary.");
        return;
      }
      setStaffSummaryLoading(true);
      setStaffSummaryError(null);
      try {
        const [staffRes, inviteRes] = await Promise.all([
          apiFetch<StaffSummaryResponse | StaffSummaryUser[]>("/admin/staff"),
          apiFetch<StaffInviteSummaryResponse>("/admin/staff/invites"),
        ]);

        if (cancelled) return;

        const staffList = Array.isArray(staffRes)
          ? staffRes
          : staffRes.staff ?? staffRes.users ?? [];
        const inviteList = inviteRes.invites ?? [];

        setStaffCount(staffList.length);
        setPendingInvitesCount(inviteList.filter((invite) => invite.status === "PENDING").length);
      } catch (e) {
        console.error(e);
        if (!cancelled) {
          setStaffSummaryError(isZh ? "加载员工信息失败。" : "Failed to load staff summary.");
        }
      } finally {
        if (!cancelled) setStaffSummaryLoading(false);
      }
    }

    void loadStaffSummary();

    return () => {
      cancelled = true;
    };
  }, [isZh, sessionLoading, sessionRole]);


  return (
    <div className="space-y-8">
      <div>
        <p className="text-sm font-semibold uppercase tracking-[0.3em] text-slate-500">Admin</p>
        <h1 className="mt-2 text-3xl font-semibold text-slate-900">运营管理控制台</h1>
        <p className="mt-2 max-w-3xl text-sm text-slate-600">
          管理营业时间、节假日休假、员工权限和其他日常运营事项。
          这里展示的是当前生效配置，详细编辑请进入对应功能页。
        </p>
      </div>

      <div className="grid grid-cols-1 gap-4">
        <div className="rounded-2xl border bg-white/80 p-5 shadow-sm">
          <p className="text-sm text-slate-500">计划休假</p>
          <p className="mt-2 text-3xl font-semibold text-slate-900">{hoursLoading ? "…" : holidays.length}</p>
        </div>
      </div>

      <SectionCard
        title="门店信息设置"
        actions={
          <Link href={`/${locale}/admin/setting`} className="text-xs font-medium text-emerald-700 hover:text-emerald-600">
            {isZh ? "详细编辑门店信息" : "Edit store settings in detail"}
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
          <Link href={`/${locale}/admin/setting`} className="text-xs font-medium text-emerald-700 hover:text-emerald-600">
            {isZh ? "在门店信息设置页管理节假日" : "Manage holidays on the settings page"}
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

      <SectionCard
        title={isZh ? "每日特价" : "Daily specials"}
        actions={
          <Link
            href={`/${locale}/admin/daily-specials`}
            className="text-xs font-medium text-amber-700 hover:text-amber-600"
          >
            {isZh ? "进入每日特价设置" : "Manage daily specials"}
          </Link>
        }
      >
        <p className="text-sm text-slate-600">
          {isZh
            ? "配置周一到周日的特价菜。特价只作用于主菜，选项加价不参与。"
            : "Configure Monday–Friday specials. Specials apply to the main dish only; options remain full price."}
        </p>
      </SectionCard>

      <SectionCard
        title={isZh ? "员工管理" : "Staff management"}
        actions={
          <Link href={`/${locale}/admin/staff`} className="text-xs font-medium text-emerald-700 hover:text-emerald-600">
            {isZh ? "进入员工管理" : "Manage staff"}
          </Link>
        }
      >
        {staffSummaryLoading ? (
          <p className="text-sm text-slate-500">{isZh ? "员工信息加载中…" : "Loading staff summary…"}</p>
        ) : staffSummaryError ? (
          <p className="text-sm text-red-600">{staffSummaryError}</p>
        ) : (
          <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
            <div className="rounded-xl border bg-white/80 p-4 shadow-sm">
              <p className="text-sm text-slate-500">{isZh ? "员工数" : "Total staff"}</p>
              <p className="mt-2 text-2xl font-semibold text-slate-900">{staffCount ?? 0}</p>
            </div>
            <div className="rounded-xl border bg-white/80 p-4 shadow-sm">
              <p className="text-sm text-slate-500">{isZh ? "待接受邀请" : "Pending invites"}</p>
              <p className="mt-2 text-2xl font-semibold text-slate-900">{pendingInvitesCount ?? 0}</p>
            </div>
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
