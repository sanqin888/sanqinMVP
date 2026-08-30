// apps/web/src/app/[locale]/admin/2fa/page.tsx
"use client";

import { useEffect, useMemo, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { ApiError, apiFetch, getApiErrorMessage } from "@/lib/api/client";
import type { Locale } from "@/lib/i18n/locales";

type Method = "sms" | "email";

type SessionPayload = {
  requiresTwoFactor?: boolean;
};

type OperationStatusPayload = {
  ok?: boolean;
  error?: string;
};

export default function AdminTwoFactorPage() {
  const router = useRouter();
  const params = useParams();
  const locale =
    typeof params?.locale === "string" && (params.locale === "zh" || params.locale === "en")
      ? (params.locale as Locale)
      : "en";

  const [method, setMethod] = useState<Method>("email");
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
      try {
        const data = await apiFetch<SessionPayload>("/auth/me", {
          unauthorized: "throw",
        });
        if (data.requiresTwoFactor === false && mounted) {
          router.replace(`/${locale}/admin`);
        }
      } catch (error) {
        if (!(error instanceof ApiError)) throw error;
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
      await apiFetch<OperationStatusPayload>(`/auth/2fa/${method}/request`, {
        method: "POST",
        unauthorized: "throw",
      });
      setMessage(`验证码已发送到${methodLabel}。`);
    } catch (err) {
      setError(getApiErrorMessage(err, "发送失败"));
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
      await apiFetch<OperationStatusPayload>(`/auth/2fa/${method}/verify`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ code }),
        unauthorized: "throw",
      });
      router.push(`/${locale}/admin`);
    } catch (err) {
      setError(getApiErrorMessage(err, "验证失败"));
    } finally {
      setVerifying(false);
    }
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-slate-50 px-4">
      <div className="w-full max-w-md rounded-2xl border bg-white p-6 shadow-sm">
        <h1 className="text-xl font-semibold text-slate-900">后台二次验证</h1>
        <p className="mt-2 text-sm text-slate-500">默认使用邮件验证，可切换到短信验证。</p>

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
            邮件验证（默认）
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
