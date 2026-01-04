// apps/web/src/app/[locale]/membership/login/page.tsx
'use client';

import { useEffect, useState } from 'react';
import { useRouter, useParams } from 'next/navigation';
import Link from 'next/link';
import { useSession, signIn } from '@/lib/auth-session';
import type { Locale } from '@/lib/order/shared';
import { apiFetch } from '@/lib/api-client';

export default function MemberLoginPage() {
  const router = useRouter();
  const { locale } = useParams<{ locale: Locale }>();
  const { data: session, status } = useSession();

  const isZh = locale === 'zh';

  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [referrerEmail, setReferrerEmail] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (status === 'authenticated') {
      if (session?.user?.mfaVerifiedAt) {
        router.replace(`/${locale}/membership`);
      } else {
        router.replace(`/${locale}/membership/2fa`);
      }
    }
  }, [status, session?.user?.mfaVerifiedAt, router, locale]);

  async function handlePasswordLogin() {
    if (!email.trim() || !password) {
      setError(isZh ? '请填写邮箱和密码。' : 'Please enter email and password.');
      return;
    }

    try {
      setLoading(true);
      setError(null);

      const res = await apiFetch<{
        success?: boolean;
        requiresTwoFactor?: boolean;
      }>('/auth/login/password', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: email.trim(), password }),
      });

      if (res?.requiresTwoFactor) {
        router.replace(`/${locale}/membership/2fa`);
        return;
      }

      const referrerEmailTrimmed = referrerEmail.trim();
      if (referrerEmailTrimmed) {
        try {
          await apiFetch('/membership/referrer', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ referrerEmail: referrerEmailTrimmed }),
          });
        } catch (referrerError) {
          console.error(referrerError);
          setError(
            isZh
              ? '推荐人邮箱有误，请确认后重新输入或清空。'
              : 'Referrer email not found. Please verify it or clear the field.',
          );
          return;
        }
      }

      router.replace(`/${locale}/membership`);
    } catch (err) {
      console.error(err);
      setError(
        isZh
          ? '登录失败，请检查邮箱和密码。'
          : 'Login failed. Please check your email and password.',
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
            ? '你可以使用 Google 账号或邮箱密码登录。'
            : 'Sign in with Google or with your email and password.'}
        </p>

        <div className="rounded-2xl bg-white p-4 shadow-sm ring-1 ring-slate-200">
          <button
            type="button"
            onClick={() => signIn('google', { callbackUrl: `/${locale}/membership` })}
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

          <label className="mt-4 block text-xs font-medium text-slate-700">
            {isZh ? '密码' : 'Password'}
          </label>
          <input
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            placeholder={isZh ? '请输入密码' : 'Enter your password'}
            className="mt-1 w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm text-slate-900 focus:outline-none focus:ring-1 focus:ring-slate-400"
          />

          <div className="mt-3 flex items-center justify-between">
            <Link
              href={`/${locale}/membership/forgot-password`}
              className="text-xs text-slate-500 hover:text-slate-700"
            >
              {isZh ? '忘记密码？' : 'Forgot password?'}
            </Link>
          </div>

          <label className="mt-4 block text-xs font-medium text-slate-700">
            {isZh ? '推荐人：' : 'Referrer:'}
          </label>
          <input
            type="email"
            value={referrerEmail}
            onChange={(e) => setReferrerEmail(e.target.value)}
            placeholder={isZh ? '请输入推荐人邮箱' : 'Enter referrer email'}
            className="mt-1 w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm text-slate-900 focus:outline-none focus:ring-1 focus:ring-slate-400"
          />
          <p className="mt-2 text-xs text-slate-500">
            {isZh
              ? '提示：注册成功后，推荐人邮箱将无法添加或修改，请确认填写无误。'
              : 'Note: After registration, the referrer email cannot be added or changed. Please confirm it is correct.'}
          </p>

          {error && (
            <p className="mt-3 text-center text-xs text-rose-500">{error}</p>
          )}

          <button
            type="button"
            onClick={handlePasswordLogin}
            disabled={loading}
            className="mt-4 flex w-full items-center justify-center rounded-xl bg-emerald-600 px-4 py-2 text-sm font-medium text-white hover:bg-emerald-700 disabled:cursor-not-allowed disabled:opacity-60"
          >
            {loading
              ? isZh
                ? '登录中...'
                : 'Signing in...'
              : isZh
                ? '邮箱登录'
                : 'Sign in with email'}
          </button>
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
