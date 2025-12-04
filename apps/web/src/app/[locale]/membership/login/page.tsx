// apps/web/src/app/[locale]/membership/login/page.tsx
'use client';

import { useEffect, useState } from 'react';
import { useRouter, useParams } from 'next/navigation';
import Link from 'next/link';
import { signIn, useSession } from 'next-auth/react';
import type { Locale } from '@/lib/order/shared';

export default function MemberLoginPage() {
  const router = useRouter();
  const { locale } = useParams<{ locale: Locale }>();
  const { status } = useSession();

  const isZh = locale === 'zh';

  // 推荐人邮箱（可选，只能填一次）
  const [referrerEmail, setReferrerEmail] = useState<string>('');

  // 生日（月/日，可选，只能填一次），用字符串存，方便和 <input> 同步
  const [birthdayMonth, setBirthdayMonth] = useState<string>('');
  const [birthdayDay, setBirthdayDay] = useState<string>('');

  const [error, setError] = useState<string | null>(null);

  // 如果已经登录，直接跳会员中心
  useEffect(() => {
    if (status === 'authenticated') {
      router.replace(`/${locale}/membership`);
    }
  }, [status, router, locale]);

  function validateInputs(): boolean {
    // 1) 推荐人邮箱（可空，填了就要是邮箱格式）
    const emailTrimmed = referrerEmail.trim();
    if (emailTrimmed) {
      const ok = /\S+@\S+\.\S+/.test(emailTrimmed);
      if (!ok) {
        setError(
          isZh ? '推荐人邮箱格式不正确' : 'Referrer email format is invalid',
        );
        return false;
      }
    }

    // 2) 生日（只要填了任意一个，就要求年月日都合法）
    if (birthdayMonth || birthdayDay) {
      const m = Number(birthdayMonth);
      const d = Number(birthdayDay);

      if (
        !Number.isInteger(m) ||
        m < 1 ||
        m > 12 ||
        !Number.isInteger(d) ||
        d < 1 ||
        d > 31
      ) {
        setError(
          isZh
            ? '生日月份/日期不合法'
            : 'Birthday month/day is not valid.',
        );
        return false;
      }
    }

    setError(null);
    return true;
  }

function handleGoogleLogin() {
  // 点击登录前做一次前端校验
  if (!validateInputs()) return;

  // ⭐ 先把推荐人邮箱和生日存一份到 localStorage
  // OAuth 跳转走再回来之后，membership 页面会读这个 key，用一次就删掉
  if (typeof window !== 'undefined') {
    try {
      const payload = {
        referrerEmail: referrerEmail.trim() || null,
        birthdayMonth: birthdayMonth ? String(birthdayMonth).trim() : null,
        birthdayDay: birthdayDay ? String(birthdayDay).trim() : null,
      };
      window.localStorage.setItem(
        'sanqin_membership_prefill',
        JSON.stringify(payload),
      );
    } catch (err) {
      // 失败就算了，不影响正常登录
      console.error('Failed to save membership prefill', err);
    }
  }

    // 把可选信息拼到 callbackUrl 的 query 里
    const params = new URLSearchParams();

    const emailTrimmed = referrerEmail.trim();
    if (emailTrimmed) {
      params.set('referrerEmail', emailTrimmed);
    }
    if (birthdayMonth.trim()) {
      params.set('birthdayMonth', birthdayMonth.trim());
    }
    if (birthdayDay.trim()) {
      params.set('birthdayDay', birthdayDay.trim());
    }

    const base = `/${locale}/membership`;
    const callbackUrl =
      params.toString().length > 0 ? `${base}?${params.toString()}` : base;

    // 登录成功后回到当前语言的会员中心（带上 query）
    void signIn('google', {
      callbackUrl,
    });
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
          {isZh ? '使用 Google 登录' : 'Sign in with Google'}
        </h1>
        <p className="mb-6 text-sm text-slate-600">
          {isZh
            ? '使用 Google 账号登录成为会员。以下信息仅在首次注册时填写一次。'
            : 'Use your Google account to sign in. The following info is optional and can only be set once when you first sign up.'}
        </p>

        {/* 推荐人邮箱 */}
        <div className="mt-4">
          <label className="block text-xs font-medium text-slate-700">
            {isZh ? '推荐人邮箱（可选）' : 'Referrer email (optional)'}
          </label>
          <input
            type="email"
            value={referrerEmail}
            onChange={(e) => setReferrerEmail(e.target.value)}
            onBlur={validateInputs}
            placeholder={
              isZh ? '例如：friend@example.com' : 'e.g. friend@example.com'
            }
            className="mt-1 w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm text-slate-900 focus:outline-none focus:ring-1 focus:ring-slate-400"
          />
          <p className="mt-1 text-[11px] text-slate-400">
            {isZh
              ? '如填写，我们会在你实际消费时给推荐人发放奖励积分。'
              : 'If provided, the referrer will earn bonus points when you spend.'}
          </p>
        </div>

        {/* 生日（月 / 日） */}
        <div className="mt-4">
          <label className="block text-xs font-medium text-slate-700">
            {isZh ? '生日（可选，仅月/日）' : 'Birthday (optional, month/day)'}
          </label>
          <div className="mt-1 flex gap-2">
            <input
              type="number"
              min={1}
              max={12}
              value={birthdayMonth}
              onChange={(e) => setBirthdayMonth(e.target.value)}
              onBlur={validateInputs}
              placeholder={isZh ? '月' : 'MM'}
              className="w-1/2 rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm text-slate-900 focus:outline-none focus:ring-1 focus:ring-slate-400"
            />
            <input
              type="number"
              min={1}
              max={31}
              value={birthdayDay}
              onChange={(e) => setBirthdayDay(e.target.value)}
              onBlur={validateInputs}
              placeholder={isZh ? '日' : 'DD'}
              className="w-1/2 rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm text-slate-900 focus:outline-none focus:ring-1 focus:ring-slate-400"
            />
          </div>
          <p className="mt-1 text-[11px] text-slate-400">
            {isZh
              ? '只记录一次，后续不可修改。生日当天我们会发放生日优惠券。'
              : 'Can only be set once and cannot be changed later. We may send birthday coupons on that day.'}
          </p>
        </div>

        {error && (
          <p className="mt-3 text-center text-xs text-rose-500">{error}</p>
        )}

        <div className="mt-6 rounded-2xl bg-white p-4 shadow-sm ring-1 ring-slate-200">
          <button
            type="button"
            onClick={handleGoogleLogin}
            className="flex w-full items-center justify-center gap-2 rounded-xl bg-slate-900 px-4 py-2 text-sm font-medium text-white hover:bg-slate-800"
          >
            <span className="rounded bg-white px-1.5 py-0.5 text-xs font-bold text-slate-900">
              G
            </span>
            <span>{isZh ? '使用 Google 登录' : 'Continue with Google'}</span>
          </button>

          <p className="mt-4 text-xs text-slate-500">
            {isZh
              ? '登录即表示你同意我们的网站条款和隐私政策。你可以在会员中心“账户”中管理是否接收促销邮件。'
              : 'By signing in, you agree to our terms and privacy policy. You can manage your marketing email preferences anytime in your account settings.'}
          </p>
        </div>
      </main>
    </div>
  );
}
