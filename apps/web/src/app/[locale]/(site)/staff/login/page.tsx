"use client";

import { useMemo, useState } from "react";
import { useParams, useSearchParams } from "next/navigation";
import { apiFetch, getApiErrorMessage } from "@/lib/api/client";
import {
  isStaffRole,
  normalizeStaffNext,
  resolveStaffLanding,
  staffSurfaceForPath,
} from "@/lib/staff-entry";
import { claimPosDevice, type PosDeviceMetadata } from "@/lib/api/pos-session";
import type { Locale } from "@/lib/i18n/locales";

type LoginPayload = {
  role?: string;
};

type SessionPayload = {
  role?: string;
};

export default function StaffLoginPage() {
  const params = useParams();
  const searchParams = useSearchParams();
  const locale =
    typeof params?.locale === "string" &&
    (params.locale === "zh" || params.locale === "en")
      ? (params.locale as Locale)
      : "en";

  const requestedNext = useMemo(
    () => normalizeStaffNext(searchParams?.get("next"), locale),
    [locale, searchParams],
  );
  const targetSurface = requestedNext
    ? staffSurfaceForPath(requestedNext, locale)
    : null;
  const needsPosDevice =
    targetSurface === "pos" || searchParams?.get("needDevice") === "1";

  const googleCallbackUrl = useMemo(() => {
    const callback = requestedNext ?? `/${locale}/admin`;
    const query = new URLSearchParams({
      callbackUrl: callback,
      language: locale,
      audience: "staff",
    });
    return `/api/v1/auth/oauth/google/start?${query.toString()}`;
  }, [locale, requestedNext]);

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [enrollmentCode, setEnrollmentCode] = useState("");
  const [binding, setBinding] = useState(false);
  const [boundMessage, setBoundMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function continueExistingStaffSession() {
    try {
      const session = await apiFetch<SessionPayload>("/auth/me", {
        unauthorized: "throw",
      });
      if (!isStaffRole(session.role)) return false;
      window.location.href = resolveStaffLanding(
        session.role,
        locale,
        requestedNext,
      );
      return true;
    } catch {
      return false;
    }
  }

  async function handleBindDevice() {
    setError(null);
    setBoundMessage(null);
    setBinding(true);

    const meta: PosDeviceMetadata = {
      userAgent: navigator.userAgent,
      platform: navigator.platform,
      language: navigator.language,
      screen: {
        width: window.screen.width,
        height: window.screen.height,
        devicePixelRatio: window.devicePixelRatio,
      },
    };

    try {
      await claimPosDevice({ enrollmentCode, meta });
      setEnrollmentCode("");
      if (!(await continueExistingStaffSession())) {
        setBoundMessage("设备已绑定，可继续登录。");
      }
    } catch (err) {
      setError(getApiErrorMessage(err, "绑定失败"));
    } finally {
      setBinding(false);
    }
  }

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);
    setLoading(true);

    try {
      const data = await apiFetch<LoginPayload>("/auth/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          email,
          password,
          purpose: targetSurface === "pos" ? "pos" : "admin",
        }),
        unauthorized: "throw",
      });

      if (!isStaffRole(data.role)) {
        throw new Error("当前账号没有员工系统权限");
      }

      window.location.href = resolveStaffLanding(
        data.role,
        locale,
        requestedNext,
      );
    } catch (err) {
      setError(getApiErrorMessage(err, "登录失败"));
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-slate-50 px-4">
      <div className="w-full max-w-md rounded-2xl border bg-white p-6 shadow-sm">
        <h1 className="text-xl font-semibold text-slate-900">SanQ 员工登录</h1>
        <p className="mt-2 text-sm text-slate-500">
          管理、财务和 POS 共用同一个员工身份入口，登录后按角色进入可访问的工作区。
        </p>

        {needsPosDevice ? (
          <div className="mt-5 rounded-xl border border-slate-200 bg-slate-50 p-4">
            <div className="text-sm font-semibold text-slate-800">
              POS 设备绑定
            </div>
            <p className="mt-1 text-xs text-slate-500">
              首次在这台设备使用 POS 时，请先输入设备绑定码。
            </p>
            <div className="mt-3 flex gap-2">
              <input
                className="w-full rounded-lg border bg-white px-3 py-2 text-sm"
                type="text"
                value={enrollmentCode}
                onChange={(event) => setEnrollmentCode(event.target.value)}
                placeholder="ENROLL-XXXX"
              />
              <button
                type="button"
                onClick={handleBindDevice}
                disabled={binding || !enrollmentCode.trim()}
                className="rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-60"
              >
                {binding ? "绑定中..." : "绑定"}
              </button>
            </div>
            {boundMessage ? (
              <p className="mt-2 text-sm text-emerald-600">{boundMessage}</p>
            ) : null}
          </div>
        ) : null}

        <a
          href={googleCallbackUrl}
          className="mt-5 flex w-full items-center justify-center rounded-lg border border-slate-300 bg-white px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50"
        >
          使用 Google 登录
        </a>

        <div className="my-4 flex items-center gap-3 text-xs text-slate-400">
          <span className="h-px flex-1 bg-slate-200" />
          <span>或</span>
          <span className="h-px flex-1 bg-slate-200" />
        </div>

        <form className="space-y-4" onSubmit={handleSubmit}>
          <label className="block space-y-1 text-sm">
            <span className="text-slate-700">邮箱</span>
            <input
              className="w-full rounded-lg border px-3 py-2 text-sm"
              type="email"
              required
              value={email}
              onChange={(event) => setEmail(event.target.value)}
              placeholder="staff@example.com"
            />
          </label>

          <label className="block space-y-1 text-sm">
            <span className="text-slate-700">密码</span>
            <input
              className="w-full rounded-lg border px-3 py-2 text-sm"
              type="password"
              required
              value={password}
              onChange={(event) => setPassword(event.target.value)}
            />
          </label>

          {error ? <p className="text-sm text-rose-600">{error}</p> : null}

          <button
            type="submit"
            disabled={loading}
            className="w-full rounded-lg bg-slate-900 px-4 py-2 text-sm font-semibold text-white hover:bg-slate-800 disabled:cursor-not-allowed disabled:opacity-60"
          >
            {loading ? "登录中..." : "登录"}
          </button>
        </form>
      </div>
    </div>
  );
}
