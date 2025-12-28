// apps/web/src/app/[locale]/store/pos/login/page.tsx
"use client";

import { useRouter } from "next/navigation";
import { useParams } from "next/navigation";
import { useState } from "react";
import type { Locale } from "@/lib/order/shared";

export default function PosLoginPage() {
  const router = useRouter();
  const params = useParams();
  const locale =
    typeof params?.locale === "string" && (params.locale === "zh" || params.locale === "en")
      ? (params.locale as Locale)
      : "en";

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [enrollmentCode, setEnrollmentCode] = useState("");
  const [binding, setBinding] = useState(false);
  const [boundMessage, setBoundMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function handleBindDevice() {
    setError(null);
    setBoundMessage(null);
    setBinding(true);

    const meta = {
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
      const res = await fetch("/api/v1/pos/devices/claim", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ enrollmentCode, meta }),
        credentials: "include",
      });

      if (!res.ok) {
        const payload = await res.json().catch(() => null);
        const message =
          typeof payload?.message === "string"
            ? payload.message
            : `绑定失败 (${res.status})`;
        throw new Error(message);
      }

      setBoundMessage("设备已绑定，可继续登录。");
      setEnrollmentCode("");
    } catch (err) {
      const message = err instanceof Error ? err.message : "绑定失败";
      setError(message);
    } finally {
      setBinding(false);
    }
  }

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);
    setLoading(true);

    try {
      const res = await fetch("/api/v1/auth/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, password, purpose: "pos" }),
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

      router.push(`/${locale}/store/pos`);
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
        <h1 className="text-xl font-semibold text-slate-900">POS 登录</h1>
        <p className="mt-2 text-sm text-slate-500">
          使用员工或管理员账号登录 POS 系统。
        </p>

        <form className="mt-6 space-y-4" onSubmit={handleSubmit}>
          <label className="block space-y-1 text-sm">
            <span className="text-slate-700">设备绑定码</span>
            <div className="flex gap-2">
              <input
                className="w-full rounded-lg border px-3 py-2 text-sm"
                type="text"
                value={enrollmentCode}
                onChange={(event) => setEnrollmentCode(event.target.value)}
                placeholder="ENROLL-XXXX"
              />
              <button
                type="button"
                onClick={handleBindDevice}
                disabled={binding || !enrollmentCode.trim()}
                className="rounded-lg border border-slate-200 px-3 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-60"
              >
                {binding ? "绑定中..." : "绑定"}
              </button>
            </div>
            <span className="text-xs text-slate-500">
              首次使用请先输入设备绑定码完成绑定。
            </span>
          </label>

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

          {boundMessage ? (
            <p className="text-sm text-emerald-600">{boundMessage}</p>
          ) : null}
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
