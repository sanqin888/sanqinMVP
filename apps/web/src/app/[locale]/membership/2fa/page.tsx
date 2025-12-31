//Users/apple/sanqinMVP/apps/web/src/app/[locale]/membership/2fa/page.tsx
'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useParams, useRouter, useSearchParams } from 'next/navigation';
import type { Locale } from '@/lib/order/shared';
import { useSession } from '@/lib/auth-session';
import { apiFetch, ApiError } from '@/lib/api-client';

export default function MembershipTwoFactorPage() {
  const { locale } = useParams<{ locale: Locale }>();
  const router = useRouter();
  const searchParams = useSearchParams();
  const { data: session, status } = useSession();

  const isZh = locale === 'zh';
  const next = searchParams.get('next') ?? `/${locale}/membership`;

  const [code, setCode] = useState('');
  const [sending, setSending] = useState(false);
  const [verifying, setVerifying] = useState(false);
  const [rememberDevice, setRememberDevice] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [countdown, setCountdown] = useState(0);

  useEffect(() => {
    if (status === 'unauthenticated') {
      router.replace(`/${locale}/membership/login`);
    }
  }, [status, router, locale]);

  useEffect(() => {
    if (status !== 'authenticated') return;

    // ✅ 如果后端告知这个 session 不需要 2FA，就别停留在 2FA 页
    const requiresTwoFactor = (session?.user as any)?.requiresTwoFactor;
    if (requiresTwoFactor === false) {
      router.replace(next);
      return;
    }

    if (session?.user?.mfaVerifiedAt) {
      router.replace(next);
    }
  }, [status, session?.user, router, next]);

  useEffect(() => {
    if (countdown <= 0) return;
    const timer = window.setTimeout(() => {
      setCountdown((prev) => (prev > 0 ? prev - 1 : 0));
    }, 1000);
    return () => window.clearTimeout(timer);
  }, [countdown]);

  async function handleRequestCode() {
  try {
    setSending(true);
    setError(null);
    await apiFetch('/auth/2fa/sms/request', { method: 'POST' });
    setCountdown(60);
  } catch (err) {
    console.error(err);

    // ✅ 后端明确说没开 2FA：说明不该走 2FA challenge，直接走 next
    if (err instanceof ApiError && String(err.message).includes('mfa not enabled')) {
      router.replace(next);
      return;
    }

    setError(
      isZh ? '验证码发送失败，请稍后再试。' : 'Failed to send code. Please try again.',
    );
  } finally {
    setSending(false);
  }
}

  async function handleVerifyCode() {
    if (!code.trim()) {
      setError(isZh ? '请输入验证码。' : 'Please enter the code.');
      return;
    }

    try {
      setVerifying(true);
      setError(null);
      await apiFetch('/auth/2fa/sms/verify', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ code: code.trim(), rememberDevice }),
      });
      router.replace(next);
    } catch (err) {
      console.error(err);
      setError(
        isZh
          ? '验证码无效或已过期。'
          : 'The code is invalid or expired.',
      );
    } finally {
      setVerifying(false);
    }
  }

  return (
    <div className="min-h-screen bg-slate-50">
      <header className="border-b border-slate-200 bg-white">
        <div className="mx-auto flex max-w-3xl items-center justify-between px-4 py-3">
          <Link
            href={`/${locale}`}
            className="text-sm text-slate-600 hover:text-slate-900"
          >
            ← {isZh ? '返回首页' : 'Back to home'}
          </Link>
          <div className="text-sm font-medium text-slate-900">
            {isZh ? '两步验证' : 'Two-factor authentication'}
          </div>
          <div className="w-10" />
        </div>
      </header>

      <main className="mx-auto flex max-w-md flex-col px-4 py-10">
        <h1 className="mb-4 text-2xl font-semibold text-slate-900">
          {isZh ? '输入短信验证码' : 'Enter your SMS code'}
        </h1>
        <p className="mb-6 text-sm text-slate-600">
          {isZh
            ? '我们已向你已绑定的手机号发送验证码。'
            : 'We sent a verification code to your verified phone.'}
        </p>

        <div className="rounded-2xl bg-white p-4 shadow-sm ring-1 ring-slate-200">
          <label className="block text-xs font-medium text-slate-700">
            {isZh ? '验证码' : 'Verification code'}
          </label>
          <div className="mt-2 flex gap-2">
            <input
              type="text"
              value={code}
              onChange={(e) => setCode(e.target.value)}
              placeholder={isZh ? '6 位数字' : '6-digit code'}
              className="flex-1 rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm text-slate-900 focus:outline-none focus:ring-1 focus:ring-slate-400"
            />
            <button
              type="button"
              onClick={handleRequestCode}
              disabled={sending || countdown > 0}
              className="whitespace-nowrap rounded-xl border border-slate-300 bg-white px-3 py-2 text-xs font-medium text-slate-700 hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-60"
            >
              {countdown > 0
                ? isZh
                  ? `重新发送 (${countdown}s)`
                  : `Resend (${countdown}s)`
                : isZh
                  ? '发送验证码'
                  : 'Send code'}
            </button>
          </div>

          <label className="mt-3 flex items-center gap-2 text-xs text-slate-600">
            <input
              type="checkbox"
              checked={rememberDevice}
              onChange={(e) => setRememberDevice(e.target.checked)}
              className="h-4 w-4 rounded border-slate-300 text-slate-900"
            />
            {isZh ? '记住此设备，30 天内免验证' : 'Remember this device for 30 days'}
          </label>

          {error && (
            <p className="mt-3 text-center text-xs text-rose-500">{error}</p>
          )}

          <button
            type="button"
            onClick={handleVerifyCode}
            disabled={verifying}
            className="mt-4 flex w-full items-center justify-center rounded-xl bg-emerald-600 px-4 py-2 text-sm font-medium text-white hover:bg-emerald-700 disabled:cursor-not-allowed disabled:opacity-60"
          >
            {verifying
              ? isZh
                ? '验证中...'
                : 'Verifying...'
              : isZh
                ? '完成验证'
                : 'Verify'}
          </button>
        </div>
      </main>
    </div>
  );
}
