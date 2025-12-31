'use client';

import { useState } from 'react';
import Link from 'next/link';
import { useParams } from 'next/navigation';
import type { Locale } from '@/lib/order/shared';
import { apiFetch } from '@/lib/api-client';

export default function ForgotPasswordPage() {
  const { locale } = useParams<{ locale: Locale }>();
  const isZh = locale === 'zh';

  const [email, setEmail] = useState('');
  const [sent, setSent] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit() {
    if (!email.trim()) {
      setError(isZh ? '请输入邮箱。' : 'Please enter your email.');
      return;
    }

    try {
      setLoading(true);
      setError(null);
      await apiFetch('/auth/password/reset/request', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: email.trim() }),
      });
      setSent(true);
    } catch (err) {
      console.error(err);
      setError(
        isZh
          ? '请求失败，请稍后再试。'
          : 'Request failed. Please try again.',
      );
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="min-h-screen bg-slate-50">
      <header className="border-b border-slate-200 bg-white">
        <div className="mx-auto flex max-w-3xl items-center justify-between px-4 py-3">
          <Link
            href={`/${locale}/membership/login`}
            className="text-sm text-slate-600 hover:text-slate-900"
          >
            ← {isZh ? '返回登录' : 'Back to login'}
          </Link>
          <div className="text-sm font-medium text-slate-900">
            {isZh ? '找回密码' : 'Forgot password'}
          </div>
          <div className="w-10" />
        </div>
      </header>

      <main className="mx-auto flex max-w-md flex-col px-4 py-10">
        <h1 className="mb-4 text-2xl font-semibold text-slate-900">
          {isZh ? '发送重置链接' : 'Send reset link'}
        </h1>
        <p className="mb-6 text-sm text-slate-600">
          {isZh
            ? '请输入注册邮箱，我们会发送重置密码链接。'
            : 'Enter your email and we will send a reset link.'}
        </p>

        <div className="rounded-2xl bg-white p-4 shadow-sm ring-1 ring-slate-200">
          <label className="block text-xs font-medium text-slate-700">
            {isZh ? '邮箱' : 'Email'}
          </label>
          <input
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder={isZh ? '请输入邮箱' : 'Enter your email'}
            className="mt-1 w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm text-slate-900 focus:outline-none focus:ring-1 focus:ring-slate-400"
          />

          {error && (
            <p className="mt-3 text-center text-xs text-rose-500">{error}</p>
          )}

          {sent ? (
            <p className="mt-4 text-center text-xs text-emerald-600">
              {isZh
                ? '如果邮箱存在，我们已发送重置链接。'
                : 'If the email exists, we sent a reset link.'}
            </p>
          ) : (
            <button
              type="button"
              onClick={handleSubmit}
              disabled={loading}
              className="mt-4 flex w-full items-center justify-center rounded-xl bg-emerald-600 px-4 py-2 text-sm font-medium text-white hover:bg-emerald-700 disabled:cursor-not-allowed disabled:opacity-60"
            >
              {loading
                ? isZh
                  ? '发送中...'
                  : 'Sending...'
                : isZh
                  ? '发送重置链接'
                  : 'Send reset link'}
            </button>
          )}
        </div>
      </main>
    </div>
  );
}
