// apps/web/src/app/[locale]/membership/login/page.tsx
'use client';

import { useEffect, useState, useRef } from 'react';
import { useRouter, useParams, useSearchParams } from 'next/navigation';
import Link from 'next/link';
import { useSession, notifyAuthChange } from '@/lib/auth-session';
import type { Locale } from '@/lib/i18n/locales';
import { apiFetch } from '@/lib/api/client';
import {
  formatCanadianPhoneForApi,
  formatCanadianPhoneForDisplay,
  isValidCanadianPhone,
  normalizeCanadianPhoneInput,
} from '@/lib/phone';

const getBrowserLanguage = (): 'zh' | 'en' => {
  if (typeof navigator === 'undefined') return 'en';
  const primary = navigator.languages?.[0] ?? navigator.language ?? '';
  return primary.toLowerCase().startsWith('zh') ? 'zh' : 'en';
};

export default function MemberLoginPage() {
  const router = useRouter();
  const { locale } = useParams<{ locale: Locale }>();
  const searchParams = useSearchParams();
  const { status } = useSession();

  const isZh = locale === 'zh';
  const redirectParam =
    searchParams?.get('redirect') ?? searchParams?.get('next');
  const resolvedRedirect =
    redirectParam && redirectParam.startsWith('/')
      ? redirectParam
      : `/${locale}/membership`;

  const [phone, setPhone] = useState('');
  const [code, setCode] = useState('');
  const [step, setStep] = useState<'INPUT_PHONE' | 'INPUT_CODE'>('INPUT_PHONE');
  const [countdown, setCountdown] = useState(0);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const isHandlingRedirect = useRef(false);

  useEffect(() => {
    if (status === 'authenticated' && !isHandlingRedirect.current) {
      router.replace(resolvedRedirect);
    }
  }, [status, router, resolvedRedirect]);

  useEffect(() => {
    if (countdown <= 0) return;
    const timer = window.setTimeout(() => {
      setCountdown((prev) => Math.max(prev - 1, 0));
    }, 1000);
    return () => window.clearTimeout(timer);
  }, [countdown]);

  async function handleRequestCode() {
    if (!isValidCanadianPhone(phone)) {
      setError(
        isZh
          ? '请输入有效的加拿大手机号。'
          : 'Please enter a valid Canadian phone number.',
      );
      return;
    }

    try {
      setLoading(true);
      setError(null);

      await apiFetch('/auth/login/phone/request', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ phone: formatCanadianPhoneForApi(phone) }),
      });

      setStep('INPUT_CODE');
      setCountdown(60);
      setCode('');
    } catch (err) {
      console.error(err);
      setError(
        isZh ? '验证码发送失败，请稍后重试。' : 'Failed to send code.',
      );
    } finally {
      setLoading(false);
    }
  }

  async function handleVerifyCode() {
    if (!isValidCanadianPhone(phone) || !code.trim()) {
      setError(
        isZh
          ? '请输入有效的加拿大手机号和验证码。'
          : 'Please enter a valid Canadian phone number and code.',
      );
      return;
    }

    try {
      setLoading(true);
      setError(null);

      // 在调用 API 和 notifyAuthChange 之前，设置标记为 true
      // 这样可以阻止 useEffect 抢先重定向
      isHandlingRedirect.current = true;

      const result = await apiFetch<{ isNewUser?: boolean }>(
        '/auth/login/phone/verify',
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            phone: formatCanadianPhoneForApi(phone),
            code: code.trim(),
            language: getBrowserLanguage(),
          }),
        },
      );

      notifyAuthChange();

      if (result?.isNewUser) {
        const params = new URLSearchParams({
          next: resolvedRedirect,
          source: 'phone',
        });
        router.replace(`/${locale}/membership/referrer?${params.toString()}`);
        return;
      }

      router.replace(resolvedRedirect);
    } catch (err) {
      console.error(err);
    //如果出错，记得重置标记，允许后续可能的自动重定向（虽然出错通常停留在当前页）
      isHandlingRedirect.current = false;
      setError(
        isZh
          ? '验证码错误或已过期，请重试。'
          : 'Invalid or expired code. Please try again.',
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
            href={`/${locale}`}
            className="text-sm text-slate-600 hover:text-slate-900"
          >
            ← {isZh ? '返回首页' : 'Back to home'}
          </Link>
          <div className="text-sm font-medium text-slate-900">
            {isZh ? '会员登录' : 'Member Login'}
          </div>
          <div className="w-10" />
        </div>
      </header>

      <main className="mx-auto flex max-w-md flex-col px-4 py-10">
        <h1 className="mb-6 text-2xl font-semibold text-slate-900">
          {isZh ? '登录会员账号' : 'Sign in to your account'}
        </h1>
        <p className="mb-6 text-sm text-slate-600">
          {isZh
            ? '可以使用 Google 账号或手机号登录/注册。'
            : 'Sign-in/register with Google or with your mobile phone.'}
        </p>

        <div className="rounded-2xl bg-white p-4 shadow-sm ring-1 ring-slate-200">
          <button
            type="button"
            onClick={() => {
              const targetUrl = resolvedRedirect || `/${locale}/membership`;
              const params = new URLSearchParams({
                callbackUrl: targetUrl,
                language: getBrowserLanguage(),
              });
              window.location.href = `/api/v1/auth/oauth/google/start?${params.toString()}`;
            }}
            className="flex w-full items-center justify-center gap-2 rounded-xl bg-slate-900 px-4 py-2 text-sm font-medium text-white hover:bg-slate-800"
          >
            <span className="rounded bg-white px-1.5 py-0.5 text-xs font-bold text-slate-900">
              G
            </span>
            <span>{isZh ? '使用 Google 登录' : 'Continue with Google'}</span>
          </button>
        </div>

        <div className="my-6 flex items-center gap-3">
          <span className="h-px flex-1 bg-slate-200" />
          <span className="text-xs text-slate-400">{isZh ? '或' : 'OR'}</span>
          <span className="h-px flex-1 bg-slate-200" />
        </div>

        <div className="rounded-2xl bg-white p-4 shadow-sm ring-1 ring-slate-200">
          {step === 'INPUT_PHONE' && (
            <>
              <label className="block text-xs font-medium text-slate-700">
                {isZh ? '手机号' : 'Phone number'}
              </label>
              <div className="mt-1 flex items-center rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm text-slate-900 focus-within:ring-1 focus-within:ring-slate-400">
                <span className="mr-2 text-xs text-slate-500">+1</span>
                <input
                  type="tel"
                  inputMode="numeric"
                  value={phone}
                  onChange={(e) =>
                    setPhone(normalizeCanadianPhoneInput(e.target.value))
                  }
                  placeholder={isZh ? '请输入手机号' : 'Enter your phone number'}
                  className="w-full border-0 p-0 text-sm text-slate-900 focus:outline-none"
                />
              </div>

              {error && (
                <p className="mt-3 text-center text-xs text-rose-500">
                  {error}
                </p>
              )}

              <button
                type="button"
                onClick={handleRequestCode}
                disabled={loading}
                className="mt-4 flex w-full items-center justify-center rounded-xl bg-emerald-600 px-4 py-2 text-sm font-medium text-white hover:bg-emerald-700 disabled:cursor-not-allowed disabled:opacity-60"
              >
                {loading
                  ? isZh
                    ? '发送中...'
                    : 'Sending...'
                  : isZh
                    ? '获取验证码'
                    : 'Send code'}
              </button>
            </>
          )}

          {step === 'INPUT_CODE' && (
            <>
              <label className="block text-xs font-medium text-slate-700">
                {isZh ? '验证码' : 'Verification code'}
              </label>
              <input
                type="text"
                inputMode="numeric"
                value={code}
                maxLength={6}
                onChange={(e) => setCode(e.target.value)}
                placeholder={isZh ? '请输入6位验证码' : 'Enter 6-digit code'}
                className="mt-1 w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm text-slate-900 focus:outline-none focus:ring-1 focus:ring-slate-400"
              />

              <div className="mt-3 flex items-center justify-between text-xs text-slate-500">
                <span>
                  {isZh
                    ? `验证码已发送至 ${formatCanadianPhoneForDisplay(phone)}`
                    : `Code sent to ${formatCanadianPhoneForDisplay(phone)}`}
                </span>
                <button
                  type="button"
                  onClick={handleRequestCode}
                  disabled={loading || countdown > 0}
                  className="text-xs font-medium text-emerald-600 hover:text-emerald-700 disabled:cursor-not-allowed disabled:text-slate-400"
                >
                  {countdown > 0
                    ? isZh
                      ? `重新发送 (${countdown}s)`
                      : `Resend (${countdown}s)`
                    : isZh
                      ? '重新发送'
                      : 'Resend'}
                </button>
              </div>

              {error && (
                <p className="mt-3 text-center text-xs text-rose-500">
                  {error}
                </p>
              )}

              <button
                type="button"
                onClick={handleVerifyCode}
                disabled={loading}
                className="mt-4 flex w-full items-center justify-center rounded-xl bg-emerald-600 px-4 py-2 text-sm font-medium text-white hover:bg-emerald-700 disabled:cursor-not-allowed disabled:opacity-60"
              >
                {loading
                  ? isZh
                    ? '登录中...'
                    : 'Signing in...'
                  : isZh
                    ? '登录/注册'
                    : 'Sign in / Sign up'}
              </button>
            </>
          )}
        </div>

        <p className="mt-4 text-xs text-slate-500">
          {isZh
            ? '登录即表示你同意我们的网站条款和隐私政策。'
            : 'By signing in, you agree to our terms and privacy policy.'}
        </p>
      </main>
    </div>
  );
}
