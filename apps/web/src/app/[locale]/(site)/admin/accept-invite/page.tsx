// apps/web/src/app/[locale]/admin/accept-invite/page.tsx
"use client";

import { useRouter, useSearchParams, useParams } from "next/navigation";
import { useState } from "react";
import type { Locale } from "@/lib/i18n/locales";

export default function AcceptInvitePage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const params = useParams();
  const locale =
    typeof params?.locale === "string" && (params.locale === "zh" || params.locale === "en")
      ? (params.locale as Locale)
      : "en";

  const [token, setToken] = useState(searchParams?.get("token") ?? "");
  const [password, setPassword] = useState("");
  const [name, setName] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);
    setLoading(true);

    try {
      const res = await fetch("/api/v1/auth/accept-invite", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ token, password, name: name || undefined }),
      });

      if (!res.ok) {
        const payload = await res.json().catch(() => null);
        const message =
          typeof payload?.message === "string"
            ? payload.message
            : `邀请无效 (${res.status})`;
        throw new Error(message);
      }

      router.push(`/${locale}/store/pos/login`);
    } catch (err) {
      const message = err instanceof Error ? err.message : "邀请处理失败";
      setError(message);
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-slate-50 px-4">
      <div className="w-full max-w-md rounded-2xl border bg-white p-6 shadow-sm">
        <h1 className="text-xl font-semibold text-slate-900">接受邀请</h1>
        <p className="mt-2 text-sm text-slate-500">
          设置密码后即可使用邀请邮件中的账号登录后台。
        </p>

        <form className="mt-6 space-y-4" onSubmit={handleSubmit}>
          <label className="block space-y-1 text-sm">
            <span className="text-slate-700">邀请令牌</span>
            <input
              className="w-full rounded-lg border px-3 py-2 text-sm"
              type="text"
              required
              value={token}
              onChange={(event) => setToken(event.target.value)}
            />
          </label>

          <label className="block space-y-1 text-sm">
            <span className="text-slate-700">姓名</span>
            <input
              className="w-full rounded-lg border px-3 py-2 text-sm"
              type="text"
              value={name}
              onChange={(event) => setName(event.target.value)}
              placeholder="可选"
            />
          </label>

          <label className="block space-y-1 text-sm">
            <span className="text-slate-700">设置密码</span>
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
            {loading ? "提交中..." : "完成注册"}
          </button>
        </form>
      </div>
    </div>
  );
}
