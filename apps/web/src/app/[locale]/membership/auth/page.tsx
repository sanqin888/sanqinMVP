'use client';

import Link from 'next/link';
import { useParams } from 'next/navigation';
import { useMemo, useState } from 'react';

import type { Locale } from '@/lib/order/shared';

type Mode = 'login' | 'signup';

type AuthStrings = {
  pageTag: string;
  pageTitle: string;
  pageSubtitle: string;
  switchToLogin: string;
  switchToSignup: string;
  googleCta: string;
  googleBullets: string[];
  orText: string;
  emailLabel: string;
  emailPlaceholder: string;
  phoneLabel: string;
  phonePlaceholder: string;
  passwordLabel: string;
  passwordPlaceholder: string;
  nameLabel: string;
  namePlaceholder: string;
  submitLogin: string;
  submitSignup: string;
  rememberMe: string;
  forgotPassword: string;
  policyHint: string;
  backToMembership: string;
};

const STRINGS: Record<Locale, AuthStrings> = {
  zh: {
    pageTag: '会员登录 / 注册',
    pageTitle: '用最少信息完成会员登录或注册',
    pageSubtitle: '支持 Google 账号一键加入，也可用手机号或邮箱完成登录。',
    switchToLogin: '已有账号？去登录',
    switchToSignup: '新会员？去注册',
    googleCta: '使用 Google 账号继续',
    googleBullets: ['同步头像与邮箱', '免填长表单', '登录即享积分权益'],
    orText: '或',
    emailLabel: '邮箱',
    emailPlaceholder: 'name@example.com',
    phoneLabel: '手机号',
    phonePlaceholder: '请输入手机号',
    passwordLabel: '密码',
    passwordPlaceholder: '至少 8 位字符',
    nameLabel: '姓名（选填）',
    namePlaceholder: '用于配送信息',
    submitLogin: '登录',
    submitSignup: '注册并登录',
    rememberMe: '记住我',
    forgotPassword: '忘记密码？',
    policyHint: '继续即表示同意会员条款及隐私政策。',
    backToMembership: '返回会员中心',
  },
  en: {
    pageTag: 'Member sign in / join',
    pageTitle: 'Sign in or join with minimal info',
    pageSubtitle: 'Use Google for one-click access or continue with phone/email.',
    switchToLogin: 'Already a member? Sign in',
    switchToSignup: 'New here? Join now',
    googleCta: 'Continue with Google',
    googleBullets: ['Sync avatar & email', 'Skip long forms', 'Instant perks on login'],
    orText: 'or',
    emailLabel: 'Email',
    emailPlaceholder: 'name@example.com',
    phoneLabel: 'Phone',
    phonePlaceholder: 'Enter your phone',
    passwordLabel: 'Password',
    passwordPlaceholder: 'At least 8 characters',
    nameLabel: 'Name (optional)',
    namePlaceholder: 'For delivery details',
    submitLogin: 'Sign in',
    submitSignup: 'Join and sign in',
    rememberMe: 'Remember me',
    forgotPassword: 'Forgot password?',
    policyHint: 'By continuing, you agree to membership terms and privacy policy.',
    backToMembership: 'Back to membership',
  },
};

export default function MembershipAuthPage() {
  const params = useParams<{ locale?: string }>();
  const locale: Locale = params?.locale === 'en' ? 'en' : 'zh';
  const strings = STRINGS[locale];
  const [mode, setMode] = useState<Mode>('login');

  const googleLogo = useMemo(
    () => (
      <svg className="h-5 w-5" viewBox="0 0 24 24" fill="none" aria-hidden>
        <path
          d="M21.6 12.23c0-.64-.06-1.26-.17-1.86H12v3.52h5.4c-.23 1.25-.93 2.32-1.99 3.04v2.52h3.22c1.89-1.74 2.97-4.3 2.97-7.22Z"
          fill="#4285F4"
        />
        <path
          d="M12 22c2.7 0 4.97-.9 6.63-2.43l-3.22-2.52c-.9.6-2.05.95-3.4.95-2.62 0-4.85-1.77-5.64-4.15H3.06v2.6A9.99 9.99 0 0 0 12 22Z"
          fill="#34A853"
        />
        <path
          d="M6.36 13.85A5.99 5.99 0 0 1 5.97 12c0-.64.11-1.26.32-1.85V7.55H3.06A10 10 0 0 0 2 12c0 1.6.39 3.11 1.06 4.45l3.3-2.6Z"
          fill="#FBBC05"
        />
        <path
          d="M12 6.02c1.47 0 2.8.5 3.84 1.48l2.88-2.88A9.95 9.95 0 0 0 12 2a9.99 9.99 0 0 0-8.94 5.55l3.3 2.6C6.76 7.79 8.99 6.02 12 6.02Z"
          fill="#EA4335"
        />
      </svg>
    ),
    [],
  );

  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="space-y-1">
          <p className="text-sm text-gray-500">{strings.pageTag}</p>
          <h1 className="text-2xl font-semibold text-gray-900">{strings.pageTitle}</h1>
          <p className="text-sm text-gray-600">{strings.pageSubtitle}</p>
        </div>
        <Link
          href={`/${locale}/membership`}
          className="inline-flex items-center gap-2 rounded-lg border border-gray-200 px-3 py-2 text-sm font-semibold text-gray-700 transition hover:-translate-y-0.5 hover:shadow-sm"
        >
          ← {strings.backToMembership}
        </Link>
      </div>

      <section className="rounded-2xl border bg-white p-6 shadow-sm space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex gap-2 rounded-full bg-gray-100 p-1 text-xs font-semibold text-gray-700">
            <button
              type="button"
              onClick={() => setMode('login')}
              className={`rounded-full px-3 py-1 transition ${mode === 'login' ? 'bg-white shadow-sm' : ''}`}
            >
              {strings.switchToLogin}
            </button>
            <button
              type="button"
              onClick={() => setMode('signup')}
              className={`rounded-full px-3 py-1 transition ${mode === 'signup' ? 'bg-white shadow-sm' : ''}`}
            >
              {strings.switchToSignup}
            </button>
          </div>
          <p className="text-xs text-gray-500">{strings.policyHint}</p>
        </div>

        <div className="rounded-xl border bg-gradient-to-r from-amber-50 via-white to-blue-50 p-4 shadow-sm">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <div className="space-y-1">
              <p className="text-sm font-semibold text-amber-700">Google</p>
              <p className="text-sm text-gray-700">{strings.googleCta}</p>
              <ul className="flex flex-wrap gap-2 text-xs text-gray-600">
                {strings.googleBullets.map((bullet) => (
                  <li key={bullet} className="flex items-center gap-2 rounded-full bg-white px-3 py-1 shadow-sm">
                    <span className="h-2 w-2 rounded-full bg-emerald-500" aria-hidden />
                    {bullet}
                  </li>
                ))}
              </ul>
            </div>
            <button
              type="button"
              className="flex items-center gap-3 rounded-lg border border-gray-200 bg-white px-4 py-2 text-sm font-semibold text-gray-800 shadow-sm transition hover:-translate-y-0.5 hover:shadow"
            >
              <span className="flex h-9 w-9 items-center justify-center rounded-full bg-white shadow-inner">{googleLogo}</span>
              {strings.googleCta}
            </button>
          </div>
        </div>

        <div className="relative text-center text-xs text-gray-500">
          <span className="absolute left-0 top-1/2 w-full border-t" aria-hidden />
          <span className="relative bg-white px-2">{strings.orText}</span>
        </div>

        <form className="space-y-4">
          <div className="grid gap-4 sm:grid-cols-2">
            <label className="space-y-1 text-sm font-medium text-gray-700">
              <span>{strings.emailLabel}</span>
              <input
                type="email"
                placeholder={strings.emailPlaceholder}
                className="w-full rounded-lg border px-3 py-2 text-sm text-gray-900 placeholder:text-gray-400 focus:border-blue-400 focus:outline-none focus:ring-1 focus:ring-blue-200"
              />
            </label>
            <label className="space-y-1 text-sm font-medium text-gray-700">
              <span>{strings.phoneLabel}</span>
              <input
                type="tel"
                placeholder={strings.phonePlaceholder}
                className="w-full rounded-lg border px-3 py-2 text-sm text-gray-900 placeholder:text-gray-400 focus:border-blue-400 focus:outline-none focus:ring-1 focus:ring-blue-200"
              />
            </label>
          </div>

          {mode === 'signup' ? (
            <label className="space-y-1 text-sm font-medium text-gray-700">
              <span>{strings.nameLabel}</span>
              <input
                type="text"
                placeholder={strings.namePlaceholder}
                className="w-full rounded-lg border px-3 py-2 text-sm text-gray-900 placeholder:text-gray-400 focus:border-blue-400 focus:outline-none focus:ring-1 focus:ring-blue-200"
              />
            </label>
          ) : null}

          <label className="space-y-1 text-sm font-medium text-gray-700">
            <span>{strings.passwordLabel}</span>
            <input
              type="password"
              placeholder={strings.passwordPlaceholder}
              className="w-full rounded-lg border px-3 py-2 text-sm text-gray-900 placeholder:text-gray-400 focus:border-blue-400 focus:outline-none focus:ring-1 focus:ring-blue-200"
            />
          </label>

          <div className="flex flex-wrap items-center justify-between gap-3 text-sm text-gray-600">
            <label className="flex items-center gap-2">
              <input type="checkbox" className="h-4 w-4 rounded border-gray-300 text-blue-600 focus:ring-blue-200" />
              <span>{strings.rememberMe}</span>
            </label>
            <button type="button" className="text-blue-600 hover:underline">
              {strings.forgotPassword}
            </button>
          </div>

          <button
            type="submit"
            className="w-full rounded-lg bg-blue-600 px-4 py-2 text-sm font-semibold text-white shadow-sm transition hover:-translate-y-0.5 hover:bg-blue-700"
          >
            {mode === 'login' ? strings.submitLogin : strings.submitSignup}
          </button>
        </form>
      </section>
    </div>
  );
}
