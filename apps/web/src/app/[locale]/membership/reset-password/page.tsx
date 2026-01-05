'use client';

import { useState } from 'react';
import Link from 'next/link';
import { useParams, useRouter, useSearchParams } from 'next/navigation';
import type { Locale } from '@/lib/order/shared';
import { apiFetch } from '@/lib/api/client';

export default function ResetPasswordPage() {
  const { locale } = useParams<{ locale: Locale }>();
  const router = useRouter();
  const searchParams = useSearchParams();
  const isZh = locale === 'zh';

  const token = searchParams.get('token') ?? '';

  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);

  async function handleReset() {
    if (!token) {
      setError(isZh ? '重置链接无效。' : 'Invalid reset link.');
      return;
    }
    if (!password || password.length < 8) {
      setError(
        isZh ? '请设置至少 8 位的新密码。' : 'Please enter a password with at least 8 characters.',
      );
      return;
    }
    if (password !== confirmPassword) {
      setError(isZh ? '两次密码输入不一致。' : 'Passwords do not match.');
      return;
    }

    try {
      setLoading(true);
      setError(null);
      await apiFetch('/auth/password/reset/confirm', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ token, newPassword: password }),
      });
      setSuccess(true);
      setTimeout(() => {
        router.replace(`/${locale}/membership/login`);
      }, 1500);
    } catch (err) {
      console.error(err);
      setError(
        isZh
          ? '重置失败，请重新申请。'
          : 'Reset failed. Please request a new link.',
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
            {isZh ? '重置密码' : 'Reset password'}
          </div>
          <div className="w-10" />
        </div>
      </header>

      <main className="mx-auto flex max-w-md flex-col px-4 py-10">
        <h1 className="mb-4 text-2xl font-semibold text-slate-900">
          {isZh ? '设置新密码' : 'Set a new password'}
        </h1>

        <div className="rounded-2xl bg-white p-4 shadow-sm ring-1 ring-slate-200">
          <label className="block text-xs font-medium text-slate-700">
            {isZh ? '新密码' : 'New password'}
          </label>
          <input
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            placeholder={isZh ? '至少 8 位' : 'At least 8 characters'}
            className="mt-1 w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm text-slate-900 focus:outline-none focus:ring-1 focus:ring-slate-400"
          />

          <label className="mt-4 block text-xs font-medium text-slate-700">
            {isZh ? '确认新密码' : 'Confirm password'}
          </label>
          <input
            type="password"
            value={confirmPassword}
            onChange={(e) => setConfirmPassword(e.target.value)}
            placeholder={isZh ? '再次输入密码' : 'Re-enter password'}
            className="mt-1 w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm text-slate-900 focus:outline-none focus:ring-1 focus:ring-slate-400"
          />

          {error && (
            <p className="mt-3 text-center text-xs text-rose-500">{error}</p>
          )}

          {success ? (
            <p className="mt-4 text-center text-xs text-emerald-600">
              {isZh ? '密码已更新，正在跳转登录。' : 'Password updated. Redirecting to login...'}
            </p>
          ) : (
            <button
              type="button"
              onClick={handleReset}
              disabled={loading}
              className="mt-4 flex w-full items-center justify-center rounded-xl bg-emerald-600 px-4 py-2 text-sm font-medium text-white hover:bg-emerald-700 disabled:cursor-not-allowed disabled:opacity-60"
            >
              {loading
                ? isZh
                  ? '提交中...'
                  : 'Submitting...'
                : isZh
                  ? '更新密码'
                  : 'Update password'}
            </button>
          )}
        </div>
      </main>
    </div>
  );
}
