// apps/web/src/app/[locale]/admin/2fa/page.tsx
"use client";

import { useEffect, useMemo, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import type { Locale } from "@/lib/i18n/locales";

type Method = "sms" | "email";

type ApiEnvelope<T> = {
  code: string;
  message?: string;
  details?: T;
};

type SessionPayload = {
  requiresTwoFactor?: boolean;
};

function unwrapEnvelope<T>(payload: unknown): T | null {
  if (!payload || typeof payload !== "object") return null;
  if ("code" in payload) {
    const env = payload as ApiEnvelope<T>;
    return (env.details ?? null) as T | null;
  }
  return payload as T;
}

export default function AdminTwoFactorPage() {
  const router = useRouter();
  const params = useParams();
  const locale =
    typeof params?.locale === "string" && (params.locale === "zh" || params.locale === "en")
      ? (params.locale as Locale)
      : "en";

  const [method, setMethod] = useState<Method>("sms");
  const [code, setCode] = useState("");
  const [requesting, setRequesting] = useState(false);
  const [verifying, setVerifying] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const methodLabel = useMemo(() => {
    return method === "sms" ? "短信" : "邮件";
  }, [method]);

  useEffect(() => {
    let mounted = true;
    const checkSession = async () => {
      const res = await fetch("/api/v1/auth/me", {
        credentials: "include",
        cache: "no-store",
      });
      if (!res.ok) return;
      const payload = await res.json().catch(() => null);
      const data = unwrapEnvelope<SessionPayload>(payload);
      if (data?.requiresTwoFactor === false && mounted) {
        router.replace(`/${locale}/admin`);
      }
    };
    void checkSession();
    return () => {
      mounted = false;
    };
  }, [locale, router]);

  async function handleRequestCode() {
    setError(null);
    setMessage(null);
    setRequesting(true);
    try {
      const res = await fetch(`/api/v1/auth/2fa/${method}/request`, {
        method: "POST",
        credentials: "include",
      });
      if (!res.ok) {
        const payload = await res.json().catch(() => null);
        const messageText =
          typeof payload?.message === "string"
            ? payload.message
            : `发送失败 (${res.status})`;
        throw new Error(messageText);
      }
      setMessage(`验证码已发送到${methodLabel}。`);
    } catch (err) {
      const messageText = err instanceof Error ? err.message : "发送失败";
      setError(messageText);
    } finally {
      setRequesting(false);
    }
  }

  async function handleVerify(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);
    setMessage(null);
    setVerifying(true);
    try {
      const res = await fetch(`/api/v1/auth/2fa/${method}/verify`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ code }),
        credentials: "include",
      });
      if (!res.ok) {
        const payload = await res.json().catch(() => null);
        const messageText =
          typeof payload?.message === "string"
            ? payload.message
            : `验证失败 (${res.status})`;
        throw new Error(messageText);
      }
      router.push(`/${locale}/admin`);
    } catch (err) {
      const messageText = err instanceof Error ? err.message : "验证失败";
      setError(messageText);
    } finally {
      setVerifying(false);
    }
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-slate-50 px-4">
      <div className="w-full max-w-md rounded-2xl border bg-white p-6 shadow-sm">
        <h1 className="text-xl font-semibold text-slate-900">后台二次验证</h1>
        <p className="mt-2 text-sm text-slate-500">请选择短信或邮件完成登录验证。</p>

        <div className="mt-5 flex gap-2">
          <button
            type="button"
            onClick={() => setMethod("sms")}
            className={`flex-1 rounded-lg border px-4 py-2 text-sm font-medium ${
              method === "sms"
                ? "border-slate-900 bg-slate-900 text-white"
                : "border-slate-200 text-slate-700 hover:border-slate-300"
            }`}
          >
            短信验证
          </button>
          <button
            type="button"
            onClick={() => setMethod("email")}
            className={`flex-1 rounded-lg border px-4 py-2 text-sm font-medium ${
              method === "email"
                ? "border-slate-900 bg-slate-900 text-white"
                : "border-slate-200 text-slate-700 hover:border-slate-300"
            }`}
          >
            邮件验证
          </button>
        </div>

        <div className="mt-4 flex items-center justify-between rounded-lg bg-slate-50 px-4 py-3 text-sm text-slate-600">
          <span>当前方式：{methodLabel}</span>
          <button
            type="button"
            onClick={handleRequestCode}
            disabled={requesting}
            className="text-slate-900 hover:text-slate-700 disabled:cursor-not-allowed disabled:text-slate-400"
          >
            {requesting ? "发送中..." : "发送验证码"}
          </button>
        </div>

        <form className="mt-4 space-y-4" onSubmit={handleVerify}>
          <label className="block space-y-1 text-sm">
            <span className="text-slate-700">验证码</span>
            <input
              className="w-full rounded-lg border px-3 py-2 text-sm"
              value={code}
              onChange={(event) => setCode(event.target.value)}
              placeholder="请输入 6 位验证码"
              required
            />
          </label>

          {message ? <p className="text-sm text-emerald-600">{message}</p> : null}
          {error ? <p className="text-sm text-rose-600">{error}</p> : null}

          <button
            type="submit"
            disabled={verifying}
            className="w-full rounded-lg bg-slate-900 px-4 py-2 text-sm font-semibold text-white hover:bg-slate-800 disabled:cursor-not-allowed disabled:opacity-60"
          >
            {verifying ? "验证中..." : "完成验证"}
          </button>
        </form>
      </div>
    </div>
  );
}
