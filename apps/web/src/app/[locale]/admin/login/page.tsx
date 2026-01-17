// apps/web/src/app/[locale]/admin/login/page.tsx
"use client";

import { useParams } from "next/navigation";
import { useState } from "react";
import type { Locale } from "@/lib/i18n/locales";

type ApiEnvelope<T> = {
  code: string;
  message?: string;
  details?: T;
};

function unwrapEnvelope<T>(payload: unknown): T | null {
  if (!payload || typeof payload !== "object") return null;
  if ("code" in payload) {
    const env = payload as ApiEnvelope<T>;
    return (env.details ?? null) as T | null;
  }
  return payload as T;
}

export default function AdminLoginPage() {
  const params = useParams();
  const locale =
    typeof params?.locale === "string" && (params.locale === "zh" || params.locale === "en")
      ? (params.locale as Locale)
      : "en";

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

      if (!res.ok) {
        const payload = await res.json().catch(() => null);
        const message =
          typeof payload?.message === "string"
            ? payload.message
            : `登录失败 (${res.status})`;
        throw new Error(message);
      }

      const payload = await res.json().catch(() => null);
      const data = unwrapEnvelope<{ requiresTwoFactor?: boolean }>(payload);
      if (data?.requiresTwoFactor) {
        window.location.href = `/${locale}/admin/2fa`;
        return;
      }

      window.location.href = `/${locale}/admin`;
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
        <h1 className="text-xl font-semibold text-slate-900">后台登录</h1>
        <p className="mt-2 text-sm text-slate-500">使用管理员账号登录后进入后台。</p>

        <form className="mt-6 space-y-4" onSubmit={handleSubmit}>
          <label className="block space-y-1 text-sm">
            <span className="text-slate-700">邮箱</span>
            <input
              className="w-full rounded-lg border px-3 py-2 text-sm"
              type="email"
              required
              value={email}
              onChange={(event) => setEmail(event.target.value)}
              placeholder="admin@example.com"
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
