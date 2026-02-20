"use client";

import { useMemo, useState } from "react";
import { useParams } from "next/navigation";
import type { Locale } from "@/lib/i18n/locales";

type ApiEnvelope<T> = {
  code: string;
  message?: string;
  details?: T;
};

type LoginPayload = {
  role?: string;
};

function unwrapEnvelope<T>(payload: unknown): T | null {
  if (!payload || typeof payload !== "object") return null;
  if ("code" in payload) {
    const env = payload as ApiEnvelope<T>;
    return (env.details ?? null) as T | null;
  }
  return payload as T;
}

export default function AccountingLoginPage() {
  const params = useParams();
  const locale =
    typeof params?.locale === "string" && (params.locale === "zh" || params.locale === "en")
      ? (params.locale as Locale)
      : "en";

  const googleCallbackUrl = useMemo(() => {
    const callback = `/${locale}/accounting/dashboard`;
    return `/api/v1/auth/oauth/google/start?callbackUrl=${encodeURIComponent(callback)}&language=${locale}`;
  }, [locale]);

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);
    setLoading(true);

    try {
      const res = await fetch("/api/v1/auth/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, password, purpose: "admin" }),
        credentials: "include",
      });

      const payload = await res.json().catch(() => null);
      const data = unwrapEnvelope<LoginPayload>(payload);

      if (!res.ok) {
        const message =
          typeof payload?.message === "string"
            ? payload.message
            : `登录失败 (${res.status})`;
        throw new Error(message);
      }

      if (data?.role !== "ACCOUNTANT" && data?.role !== "ADMIN") {
        throw new Error("当前账号没有财务系统权限");
      }

      window.location.href = `/${locale}/accounting/dashboard`;
    } catch (err) {
      const message = err instanceof Error ? err.message : "登录失败";
      setError(message);
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-slate-50 px-4">
      <div className="w-full max-w-md rounded-2xl border bg-white p-6 shadow-sm">
        <h1 className="text-xl font-semibold text-slate-900">财务系统登录</h1>
        <p className="mt-2 text-sm text-slate-500">支持账号密码和 Google OAuth 双登录。</p>

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
              placeholder="accounting@example.com"
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
            {loading ? "登录中..." : "账号密码登录"}
          </button>
        </form>
      </div>
    </div>
  );
}
