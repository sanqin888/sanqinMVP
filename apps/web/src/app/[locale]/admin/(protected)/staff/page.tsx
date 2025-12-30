// apps/web/src/app/[locale]/admin/(protected)/staff/page.tsx
"use client";

import { useEffect, useMemo, useState } from "react";
import { useParams } from "next/navigation";
import type { Locale } from "@/lib/order/shared";
import { ApiError, apiFetch } from "@/lib/api-client";

type StaffUser = {
  userStableId: string;
  email: string;
  role: "ADMIN" | "STAFF";
  status: "ACTIVE" | "DISABLED";
  createdAt?: string | null;
  lastLoginAt?: string | null;
  name?: string | null;
};

type StaffInvite = {
  inviteStableId: string;
  email: string;
  roleToGrant: "ADMIN" | "STAFF";
  status: "PENDING" | "ACCEPTED" | "EXPIRED" | "REVOKED";
  createdAt?: string | null;
  expiresAt?: string | null;
  acceptedAt?: string | null;
  sentCount?: number | null;
  lastSentAt?: string | null;
  invitedByUserStableId?: string | null;
};

type StaffResponse = {
  staff?: StaffUser[];
  users?: StaffUser[];
};

type StaffInviteResponse = {
  invites?: StaffInvite[];
};

type AdminSessionResponse = {
  userStableId?: string;
  email?: string;
  role?: string;
};

type TabKey = "staff" | "invites" | "invite-form";

function formatDateTime(value?: string | null): string {
  if (!value) return "-";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleString();
}

function statusPillTone(status: string): string {
  switch (status) {
    case "ACTIVE":
    case "ACCEPTED":
      return "bg-emerald-50 text-emerald-700";
    case "PENDING":
      return "bg-amber-50 text-amber-700";
    case "DISABLED":
    case "REVOKED":
    case "EXPIRED":
      return "bg-slate-100 text-slate-600";
    default:
      return "bg-slate-100 text-slate-600";
  }
}

export default function AdminStaffPage() {
  const { locale } = useParams<{ locale: Locale }>();
  const isZh = locale === "zh";

  const [session, setSession] = useState<AdminSessionResponse | null>(null);
  const [sessionLoading, setSessionLoading] = useState(true);
  const [tab, setTab] = useState<TabKey>("staff");

  const [staff, setStaff] = useState<StaffUser[]>([]);
  const [invites, setInvites] = useState<StaffInvite[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [staffSearch, setStaffSearch] = useState("");
  const [staffRoleFilter, setStaffRoleFilter] = useState<"ALL" | "ADMIN" | "STAFF">("ALL");
  const [staffStatusFilter, setStaffStatusFilter] = useState<"ALL" | "ACTIVE" | "DISABLED">("ALL");

  const [inviteSearch, setInviteSearch] = useState("");
  const [inviteStatusFilter, setInviteStatusFilter] = useState<
    "ALL" | "PENDING" | "ACCEPTED" | "EXPIRED" | "REVOKED"
  >("ALL");

  const [actionTarget, setActionTarget] = useState<string | null>(null);
  const [inviteActionTarget, setInviteActionTarget] = useState<string | null>(null);

  const [inviteEmail, setInviteEmail] = useState("");
  const [inviteRole, setInviteRole] = useState<"ADMIN" | "STAFF">("STAFF");
  const [inviteSubmitting, setInviteSubmitting] = useState(false);
  const [inviteError, setInviteError] = useState<string | null>(null);
  const [inviteSuccess, setInviteSuccess] = useState<string | null>(null);

  const isAdmin = session?.role === "ADMIN";

  const activeAdminCount = useMemo(
    () => staff.filter((user) => user.role === "ADMIN" && user.status === "ACTIVE").length,
    [staff],
  );

  const filteredStaff = useMemo(() => {
    const keyword = staffSearch.trim().toLowerCase();
    return staff.filter((user) => {
      if (staffRoleFilter !== "ALL" && user.role !== staffRoleFilter) return false;
      if (staffStatusFilter !== "ALL" && user.status !== staffStatusFilter) return false;
      if (!keyword) return true;
      return (
        user.email.toLowerCase().includes(keyword) ||
        (user.name ?? "").toLowerCase().includes(keyword)
      );
    });
  }, [staff, staffRoleFilter, staffSearch, staffStatusFilter]);

  const filteredInvites = useMemo(() => {
    const keyword = inviteSearch.trim().toLowerCase();
    return invites.filter((invite) => {
      if (inviteStatusFilter !== "ALL" && invite.status !== inviteStatusFilter) return false;
      if (!keyword) return true;
      return invite.email.toLowerCase().includes(keyword);
    });
  }, [invites, inviteSearch, inviteStatusFilter]);

  useEffect(() => {
    let cancelled = false;

    async function loadSession() {
      try {
        const data = await apiFetch<AdminSessionResponse>("/auth/me");
        if (!cancelled) setSession(data);
      } catch (e) {
        console.error(e);
        if (!cancelled) setSession(null);
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

    async function loadData() {
      if (sessionLoading) return;
      if (!isAdmin) {
        setLoading(false);
        setError(isZh ? "当前账号无权管理员工。" : "You do not have permission to manage staff.");
        return;
      }

      setLoading(true);
      setError(null);
      try {
        const [staffRes, inviteRes] = await Promise.all([
          apiFetch<StaffResponse | StaffUser[]>("/admin/staff"),
          apiFetch<StaffInviteResponse>("/admin/staff/invites"),
        ]);

        if (cancelled) return;

        const staffList = Array.isArray(staffRes) ? staffRes : staffRes.staff ?? staffRes.users ?? [];
        setStaff(staffList);
        setInvites(inviteRes.invites ?? []);
      } catch (e) {
        console.error(e);
        if (!cancelled) {
          setError(isZh ? "加载员工数据失败。" : "Failed to load staff data.");
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    }

    void loadData();

    return () => {
      cancelled = true;
    };
  }, [isAdmin, isZh, sessionLoading]);

  async function refreshStaff(): Promise<void> {
    const staffRes = await apiFetch<StaffResponse | StaffUser[]>("/admin/staff");
    const staffList = Array.isArray(staffRes) ? staffRes : staffRes.staff ?? staffRes.users ?? [];
    setStaff(staffList);
  }

  async function refreshInvites(): Promise<void> {
    const inviteRes = await apiFetch<StaffInviteResponse>("/admin/staff/invites");
    setInvites(inviteRes.invites ?? []);
  }

  function staffStatusLabel(status: StaffUser["status"]): string {
    if (status === "ACTIVE") return isZh ? "启用" : "Active";
    return isZh ? "禁用" : "Disabled";
  }

  function inviteStatusLabel(status: StaffInvite["status"]): string {
    if (status === "PENDING") return isZh ? "待接受" : "Pending";
    if (status === "ACCEPTED") return isZh ? "已接受" : "Accepted";
    if (status === "EXPIRED") return isZh ? "已过期" : "Expired";
    return isZh ? "已撤销" : "Revoked";
  }

  async function handleToggleStatus(user: StaffUser): Promise<void> {
    if (!isAdmin) return;
    if (session?.userStableId === user.userStableId) return;
    if (user.role === "ADMIN" && user.status === "ACTIVE" && activeAdminCount <= 1) return;

    const nextStatus: StaffUser["status"] = user.status === "ACTIVE" ? "DISABLED" : "ACTIVE";
    const confirmed = window.confirm(
      isZh
        ? `确认要将 ${user.email} 设置为${nextStatus === "ACTIVE" ? "启用" : "禁用"}吗？`
        : `Are you sure you want to set ${user.email} to ${
            nextStatus === "ACTIVE" ? "active" : "disabled"
          }?`,
    );
    if (!confirmed) return;

    setActionTarget(user.userStableId);
    try {
      await apiFetch(`/admin/staff/${encodeURIComponent(user.userStableId)}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status: nextStatus }),
      });
      await refreshStaff();
    } finally {
      setActionTarget(null);
    }
  }

  async function handleToggleRole(user: StaffUser): Promise<void> {
    if (!isAdmin) return;
    if (session?.userStableId === user.userStableId) return;
    if (user.role === "ADMIN" && user.status === "ACTIVE" && activeAdminCount <= 1) return;

    const nextRole: StaffUser["role"] = user.role === "ADMIN" ? "STAFF" : "ADMIN";
    const confirmed = window.confirm(
      isZh
        ? `确认要将 ${user.email} 角色调整为 ${nextRole === "ADMIN" ? "管理员" : "员工"} 吗？`
        : `Are you sure you want to set ${user.email} to ${nextRole === "ADMIN" ? "admin" : "staff"}?`,
    );
    if (!confirmed) return;

    setActionTarget(user.userStableId);
    try {
      await apiFetch(`/admin/staff/${encodeURIComponent(user.userStableId)}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ role: nextRole }),
      });
      await refreshStaff();
    } finally {
      setActionTarget(null);
    }
  }

  async function handleResend(invite: StaffInvite): Promise<void> {
    if (!isAdmin) return;
    const confirmed = window.confirm(
      isZh ? `确认要重发给 ${invite.email} 吗？` : `Resend invite to ${invite.email}?`,
    );
    if (!confirmed) return;

    setInviteActionTarget(invite.inviteStableId);
    try {
      await apiFetch(`/admin/staff/invites/${encodeURIComponent(invite.inviteStableId)}/resend`, {
        method: "POST",
      });
      await refreshInvites();
    } finally {
      setInviteActionTarget(null);
    }
  }

  async function handleRevoke(invite: StaffInvite): Promise<void> {
    if (!isAdmin) return;
    const confirmed = window.confirm(
      isZh ? `确认要撤销对 ${invite.email} 的邀请吗？` : `Revoke invite for ${invite.email}?`,
    );
    if (!confirmed) return;

    setInviteActionTarget(invite.inviteStableId);
    try {
      await apiFetch(`/admin/staff/invites/${encodeURIComponent(invite.inviteStableId)}/revoke`, {
        method: "POST",
      });
      await refreshInvites();
    } finally {
      setInviteActionTarget(null);
    }
  }

  async function handleSubmitInvite(event: React.FormEvent<HTMLFormElement>): Promise<void> {
    event.preventDefault();
    if (!isAdmin) return;

    const normalizedEmail = inviteEmail.trim().toLowerCase();
    if (!normalizedEmail) {
      setInviteError(isZh ? "请输入邮箱地址。" : "Please enter an email address.");
      return;
    }

    setInviteSubmitting(true);
    setInviteError(null);
    setInviteSuccess(null);

    try {
      const payload = await apiFetch<StaffInvite>(`/admin/staff/invites`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: normalizedEmail, role: inviteRole }),
      });

      setInviteSuccess(isZh ? "邀请已发送。" : "Invite sent.");
      setInviteEmail("");
      setInvites((prev) => {
        const next = prev.filter((item) => item.inviteStableId !== payload.inviteStableId);
        return [payload, ...next];
      });
    } catch (e) {
      if (e instanceof ApiError && e.payload && typeof e.payload === "object") {
        setInviteError(isZh ? "发送失败，请检查邀请状态。" : "Failed to send invite.");
      } else {
        setInviteError(isZh ? "发送失败，请稍后再试。" : "Failed to send invite. Please try again.");
      }
    } finally {
      setInviteSubmitting(false);
    }
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
        <div>
          <h1 className="text-2xl font-semibold text-slate-900">{isZh ? "员工管理" : "Staff management"}</h1>
          <p className="text-sm text-slate-500">
            {isZh ? "仅管理员可邀请、禁用或调整员工角色。" : "Only admins can invite or manage staff roles."}
          </p>
        </div>
      </div>

      <div className="flex flex-wrap gap-2">
        {[
          { key: "staff", label: isZh ? "员工列表" : "Staff list" },
          { key: "invites", label: isZh ? "邀请记录" : "Invites" },
          { key: "invite-form", label: isZh ? "发送邀请" : "Send invite" },
        ].map((item) => (
          <button
            key={item.key}
            type="button"
            onClick={() => setTab(item.key as TabKey)}
            className={`rounded-full px-4 py-2 text-sm font-medium ${
              tab === item.key ? "bg-slate-900 text-white" : "border bg-white text-slate-700"
            }`}
          >
            {item.label}
          </button>
        ))}
      </div>

      {sessionLoading || loading ? (
        <p className="text-sm text-slate-500">{isZh ? "加载中…" : "Loading…"}</p>
      ) : error ? (
        <div className="rounded-xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-700">{error}</div>
      ) : null}

      {tab === "staff" ? (
        <section className="space-y-4 rounded-2xl border bg-white/80 p-6 shadow-sm">
          <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
            <div>
              <h2 className="text-xl font-semibold text-slate-900">{isZh ? "员工列表" : "Staff list"}</h2>
              <p className="text-sm text-slate-500">
                {isZh ? "已注册或已接受邀请的员工。" : "Registered or accepted staff members."}
              </p>
            </div>
            <div className="flex flex-wrap gap-2 text-sm">
              <input
                value={staffSearch}
                onChange={(event) => setStaffSearch(event.target.value)}
                placeholder={isZh ? "搜索邮箱/姓名" : "Search email/name"}
                className="rounded-md border px-3 py-2 text-sm"
              />
              <select
                value={staffRoleFilter}
                onChange={(event) => setStaffRoleFilter(event.target.value as typeof staffRoleFilter)}
                className="rounded-md border px-3 py-2 text-sm"
              >
                <option value="ALL">{isZh ? "全部角色" : "All roles"}</option>
                <option value="ADMIN">{isZh ? "管理员" : "Admin"}</option>
                <option value="STAFF">{isZh ? "员工" : "Staff"}</option>
              </select>
              <select
                value={staffStatusFilter}
                onChange={(event) => setStaffStatusFilter(event.target.value as typeof staffStatusFilter)}
                className="rounded-md border px-3 py-2 text-sm"
              >
                <option value="ALL">{isZh ? "全部状态" : "All status"}</option>
                <option value="ACTIVE">{isZh ? "启用" : "Active"}</option>
                <option value="DISABLED">{isZh ? "禁用" : "Disabled"}</option>
              </select>
            </div>
          </div>

          {filteredStaff.length === 0 ? (
            <p className="text-sm text-slate-500">{isZh ? "暂无员工数据。" : "No staff found."}</p>
          ) : (
            <div className="divide-y rounded-xl border bg-white">
              {filteredStaff.map((user) => {
                const isSelf = session?.userStableId === user.userStableId;
                const isLastAdmin = user.role === "ADMIN" && user.status === "ACTIVE" && activeAdminCount <= 1;
                const disableReason = isSelf
                  ? isZh
                    ? "不能对自己操作"
                    : "Cannot edit yourself"
                  : isLastAdmin
                    ? isZh
                      ? "最后一个管理员"
                      : "Last active admin"
                    : null;

                return (
                  <div key={user.userStableId} className="flex flex-col gap-4 px-4 py-4 lg:flex-row lg:items-center lg:justify-between">
                    <div className="min-w-0">
                      <div className="flex flex-wrap items-center gap-2">
                        <p className="font-medium text-slate-900">{user.name ?? user.email}</p>
                        <span className={`rounded-full px-3 py-1 text-xs font-medium ${statusPillTone(user.status)}`}>
                          {staffStatusLabel(user.status)}
                        </span>
                        <span className="rounded-full bg-slate-100 px-3 py-1 text-xs font-medium text-slate-600">
                          {user.role === "ADMIN" ? (isZh ? "管理员" : "Admin") : isZh ? "员工" : "Staff"}
                        </span>
                        {disableReason ? (
                          <span className="rounded-full bg-amber-50 px-3 py-1 text-xs font-medium text-amber-700">
                            {disableReason}
                          </span>
                        ) : null}
                      </div>
                      <p className="mt-2 text-sm text-slate-500">{user.email}</p>
                      <div className="mt-1 flex flex-wrap gap-4 text-xs text-slate-400">
                        <span>
                          {isZh ? "创建时间" : "Created"}: {formatDateTime(user.createdAt)}
                        </span>
                        <span>
                          {isZh ? "最后登录" : "Last login"}: {formatDateTime(user.lastLoginAt)}
                        </span>
                      </div>
                    </div>
                    <div className="flex flex-wrap gap-2">
                      <button
                        type="button"
                        onClick={() => void handleToggleStatus(user)}
                        disabled={!isAdmin || Boolean(disableReason) || actionTarget === user.userStableId}
                        className={`rounded-full px-4 py-2 text-xs font-semibold ${
                          user.status === "ACTIVE"
                            ? "bg-amber-50 text-amber-700"
                            : "bg-emerald-50 text-emerald-700"
                        } disabled:cursor-not-allowed disabled:opacity-60`}
                      >
                        {user.status === "ACTIVE" ? (isZh ? "禁用" : "Disable") : isZh ? "启用" : "Enable"}
                      </button>
                      <button
                        type="button"
                        onClick={() => void handleToggleRole(user)}
                        disabled={!isAdmin || Boolean(disableReason) || actionTarget === user.userStableId}
                        className="rounded-full bg-slate-100 px-4 py-2 text-xs font-semibold text-slate-700 disabled:cursor-not-allowed disabled:opacity-60"
                      >
                        {user.role === "ADMIN" ? (isZh ? "改为员工" : "Make staff") : isZh ? "改为管理员" : "Make admin"}
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </section>
      ) : null}

      {tab === "invites" ? (
        <section className="space-y-4 rounded-2xl border bg-white/80 p-6 shadow-sm">
          <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
            <div>
              <h2 className="text-xl font-semibold text-slate-900">{isZh ? "邀请记录" : "Invites"}</h2>
              <p className="text-sm text-slate-500">
                {isZh ? "待接受、已过期或已撤销的邀请记录。" : "Pending, expired, or revoked invites."}
              </p>
            </div>
            <div className="flex flex-wrap gap-2 text-sm">
              <input
                value={inviteSearch}
                onChange={(event) => setInviteSearch(event.target.value)}
                placeholder={isZh ? "搜索邮箱" : "Search email"}
                className="rounded-md border px-3 py-2 text-sm"
              />
              <select
                value={inviteStatusFilter}
                onChange={(event) => setInviteStatusFilter(event.target.value as typeof inviteStatusFilter)}
                className="rounded-md border px-3 py-2 text-sm"
              >
                <option value="ALL">{isZh ? "全部状态" : "All status"}</option>
                <option value="PENDING">{isZh ? "待接受" : "Pending"}</option>
                <option value="ACCEPTED">{isZh ? "已接受" : "Accepted"}</option>
                <option value="EXPIRED">{isZh ? "已过期" : "Expired"}</option>
                <option value="REVOKED">{isZh ? "已撤销" : "Revoked"}</option>
              </select>
            </div>
          </div>

          {filteredInvites.length === 0 ? (
            <p className="text-sm text-slate-500">{isZh ? "暂无邀请记录。" : "No invites found."}</p>
          ) : (
            <div className="divide-y rounded-xl border bg-white">
              {filteredInvites.map((invite) => (
                <div key={invite.inviteStableId} className="flex flex-col gap-4 px-4 py-4 lg:flex-row lg:items-center lg:justify-between">
                  <div>
                    <div className="flex flex-wrap items-center gap-2">
                      <p className="font-medium text-slate-900">{invite.email}</p>
                      <span className={`rounded-full px-3 py-1 text-xs font-medium ${statusPillTone(invite.status)}`}>
                        {inviteStatusLabel(invite.status)}
                      </span>
                      <span className="rounded-full bg-slate-100 px-3 py-1 text-xs font-medium text-slate-600">
                        {invite.roleToGrant === "ADMIN" ? (isZh ? "管理员" : "Admin") : isZh ? "员工" : "Staff"}
                      </span>
                    </div>
                    <div className="mt-2 flex flex-wrap gap-4 text-xs text-slate-400">
                      <span>
                        {isZh ? "发送时间" : "Sent"}: {formatDateTime(invite.createdAt)}
                      </span>
                      <span>
                        {isZh ? "过期时间" : "Expires"}: {formatDateTime(invite.expiresAt)}
                      </span>
                      <span>
                        {isZh ? "接受时间" : "Accepted"}: {formatDateTime(invite.acceptedAt)}
                      </span>
                      <span>
                        {isZh ? "发送次数" : "Sent"}: {invite.sentCount ?? 0}
                      </span>
                      <span>
                        {isZh ? "最近发送" : "Last sent"}: {formatDateTime(invite.lastSentAt)}
                      </span>
                    </div>
                  </div>
                  <div className="flex flex-wrap gap-2">
                    <button
                      type="button"
                      onClick={() => void handleResend(invite)}
                      disabled={!isAdmin || inviteActionTarget === invite.inviteStableId}
                      className="rounded-full bg-emerald-50 px-4 py-2 text-xs font-semibold text-emerald-700 disabled:cursor-not-allowed disabled:opacity-60"
                    >
                      {isZh ? "重发邀请" : "Resend"}
                    </button>
                    <button
                      type="button"
                      onClick={() => void handleRevoke(invite)}
                      disabled={!isAdmin || inviteActionTarget === invite.inviteStableId}
                      className="rounded-full bg-slate-100 px-4 py-2 text-xs font-semibold text-slate-700 disabled:cursor-not-allowed disabled:opacity-60"
                    >
                      {isZh ? "撤销" : "Revoke"}
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </section>
      ) : null}

      {tab === "invite-form" ? (
        <section className="space-y-4 rounded-2xl border bg-white/80 p-6 shadow-sm">
          <div>
            <h2 className="text-xl font-semibold text-slate-900">{isZh ? "发送邀请" : "Send invite"}</h2>
            <p className="text-sm text-slate-500">
              {isZh ? "邮箱邀请新员工注册，有效期 7 天。" : "Invite a new staff member by email (7 days validity)."}
            </p>
          </div>

          <form className="space-y-4" onSubmit={handleSubmitInvite}>
            <div>
              <label className="text-sm font-medium text-slate-700" htmlFor="invite-email">
                {isZh ? "邮箱" : "Email"}
              </label>
              <input
                id="invite-email"
                type="email"
                value={inviteEmail}
                onChange={(event) => setInviteEmail(event.target.value)}
                className="mt-2 w-full rounded-md border px-3 py-2 text-sm"
                placeholder={isZh ? "staff@example.com" : "staff@example.com"}
                required
                disabled={!isAdmin}
              />
            </div>
            <div>
              <label className="text-sm font-medium text-slate-700" htmlFor="invite-role">
                {isZh ? "角色" : "Role"}
              </label>
              <select
                id="invite-role"
                value={inviteRole}
                onChange={(event) => setInviteRole(event.target.value as typeof inviteRole)}
                className="mt-2 w-full rounded-md border px-3 py-2 text-sm"
                disabled={!isAdmin}
              >
                <option value="STAFF">{isZh ? "员工" : "Staff"}</option>
                <option value="ADMIN">{isZh ? "管理员" : "Admin"}</option>
              </select>
            </div>
            {inviteError ? <p className="text-sm text-red-600">{inviteError}</p> : null}
            {inviteSuccess ? <p className="text-sm text-emerald-600">{inviteSuccess}</p> : null}
            <button
              type="submit"
              disabled={!isAdmin || inviteSubmitting}
              className="rounded-md bg-slate-900 px-4 py-2 text-sm font-semibold text-white disabled:cursor-not-allowed disabled:opacity-60"
            >
              {inviteSubmitting ? (isZh ? "发送中…" : "Sending…") : isZh ? "发送邀请" : "Send invite"}
            </button>
          </form>
        </section>
      ) : null}
    </div>
  );
}
