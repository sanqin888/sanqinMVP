'use client';

import { useEffect, useState } from 'react';
import { useParams, useRouter, useSearchParams } from 'next/navigation';
import type { Locale } from '@/lib/i18n/locales';
import { useSession } from '@/lib/auth-session';
import { ApiError, apiFetch } from '@/lib/api/client';
import {
  formatCanadianPhoneForApi,
  formatCanadianPhoneForDisplay,
  isValidCanadianPhone,
  normalizeCanadianPhoneInput,
  stripCanadianCountryCode,
} from '@/lib/phone';

type MembershipSummary = {
  phone?: string | null;
  phoneVerified?: boolean;
};

type OnboardingStatus = {
  finalized: boolean;
  birthdayYear?: number | null;
  birthdayMonth?: number | null;
  hasReferrer: boolean;
};

type PhoneStep = 'INPUT_PHONE' | 'INPUT_CODE';

function isSafelyAtLeast13(year: number, month: number): boolean {
  const now = new Date();
  const yearDifference = now.getFullYear() - year;
  return yearDifference > 13 || (yearDifference === 13 && now.getMonth() + 1 > month);
}

export default function MembershipInfoPage() {
  const router = useRouter();
  const { locale } = useParams<{ locale: Locale }>();
  const searchParams = useSearchParams();
  const { status } = useSession();

  const isZh = locale === 'zh';
  const nextParam = searchParams?.get('next') ?? '';
  const sourceParam = searchParams?.get('source') ?? '';
  const resolvedNext = nextParam.startsWith('/')
    ? nextParam
    : `/${locale}/membership`;
  const needsPhoneVerification = sourceParam === 'google';

  const [referrerEmail, setReferrerEmail] = useState('');
  const [phone, setPhone] = useState('');
  const [phoneCode, setPhoneCode] = useState('');
  const [phoneStep, setPhoneStep] = useState<PhoneStep>('INPUT_PHONE');
  const [phoneCountdown, setPhoneCountdown] = useState(0);
  const [phoneVerified, setPhoneVerified] = useState(false);
  const [birthYear, setBirthYear] = useState('');
  const [birthMonth, setBirthMonth] = useState('');
  const [loading, setLoading] = useState(false);
  const [phoneLoading, setPhoneLoading] = useState(false);
  const [pageLoading, setPageLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [phoneError, setPhoneError] = useState<string | null>(null);
  const [birthdayError, setBirthdayError] = useState<string | null>(null);

  useEffect(() => {
    if (status === 'unauthenticated') {
      const params = new URLSearchParams({ redirect: resolvedNext });
      router.replace(`/${locale}/membership/login?${params.toString()}`);
    }
  }, [status, router, locale, resolvedNext]);

  useEffect(() => {
    if (status !== 'authenticated') return;
    let cancelled = false;

    const load = async () => {
      try {
        const [summary, onboarding] = await Promise.all([
          apiFetch<MembershipSummary>('/membership/summary'),
          apiFetch<OnboardingStatus>('/membership/onboarding'),
        ]);
        if (cancelled) return;

        if (onboarding.finalized) {
          router.replace(resolvedNext);
          return;
        }
        if (summary.phone) setPhone(stripCanadianCountryCode(summary.phone));
        setPhoneVerified(Boolean(summary.phoneVerified));
        if (onboarding.birthdayYear) setBirthYear(String(onboarding.birthdayYear));
        if (onboarding.birthdayMonth) setBirthMonth(String(onboarding.birthdayMonth));
      } catch (err) {
        console.error(err);
        if (!cancelled) {
          setError(
            isZh
              ? '会员注册信息加载失败，请稍后重试。'
              : 'Failed to load membership registration information.',
          );
        }
      } finally {
        if (!cancelled) setPageLoading(false);
      }
    };

    void load();
    return () => {
      cancelled = true;
    };
  }, [status, router, resolvedNext, isZh]);

  useEffect(() => {
    if (phoneCountdown <= 0) return;
    const timer = window.setTimeout(() => {
      setPhoneCountdown((prev) => Math.max(prev - 1, 0));
    }, 1000);
    return () => window.clearTimeout(timer);
  }, [phoneCountdown]);

  const handleRequestPhoneCode = async () => {
    if (!isValidCanadianPhone(phone)) {
      setPhoneError(
        isZh
          ? '请输入有效的加拿大手机号。'
          : 'Please enter a valid Canadian phone number.',
      );
      return;
    }
    try {
      setPhoneLoading(true);
      setPhoneError(null);
      await apiFetch('/auth/phone/enroll/request', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ phone: formatCanadianPhoneForApi(phone) }),
      });
      setPhoneStep('INPUT_CODE');
      setPhoneCountdown(60);
      setPhoneCode('');
    } catch (err) {
      console.error(err);
      setPhoneError(
        isZh ? '验证码发送失败，请稍后重试。' : 'Failed to send code.',
      );
    } finally {
      setPhoneLoading(false);
    }
  };

  const handleVerifyPhoneCode = async () => {
    if (!isValidCanadianPhone(phone) || !phoneCode.trim()) {
      setPhoneError(
        isZh
          ? '请输入有效的加拿大手机号和验证码。'
          : 'Please enter a valid Canadian phone number and code.',
      );
      return;
    }
    try {
      setPhoneLoading(true);
      setPhoneError(null);
      await apiFetch('/auth/phone/enroll/verify', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          phone: formatCanadianPhoneForApi(phone),
          code: phoneCode.trim(),
        }),
      });
      setPhoneVerified(true);
    } catch (err) {
      console.error(err);
      setPhoneError(
        isZh ? '验证码错误或已过期，请重试。' : 'Invalid or expired code.',
      );
    } finally {
      setPhoneLoading(false);
    }
  };

  const validateBirthday = () => {
    const year = Number(birthYear);
    const month = Number(birthMonth);
    if (!birthYear.trim() || !birthMonth.trim()) {
      setBirthdayError(
        isZh ? '请输入出生年份和月份。' : 'Please enter your birth year and month.',
      );
      return null;
    }
    if (
      !Number.isInteger(year) ||
      !Number.isInteger(month) ||
      year < 1900 ||
      month < 1 ||
      month > 12
    ) {
      setBirthdayError(
        isZh ? '请输入有效的出生年份和月份。' : 'Please enter a valid birth year and month.',
      );
      return null;
    }
    if (!isSafelyAtLeast13(year, month)) {
      setBirthdayError(
        isZh
          ? 'SanQ 会员服务不向 13 岁以下儿童开放。'
          : 'SanQ membership is not available to children under 13.',
      );
      return null;
    }
    setBirthdayError(null);
    return { year, month };
  };

  const handleFinalize = async (includeReferrer: boolean) => {
    if (needsPhoneVerification && !phoneVerified) {
      setError(
        isZh ? '请先完成手机号验证。' : 'Please verify your phone number first.',
      );
      return;
    }

    const birthday = validateBirthday();
    if (!birthday) return;

    const trimmedEmail = referrerEmail.trim();
    if (includeReferrer && !/^\S+@\S+\.\S+$/.test(trimmedEmail)) {
      setError(
        isZh
          ? '请输入有效的推荐人会员邮箱。'
          : 'Please enter a valid referrer member email.',
      );
      return;
    }

    try {
      setLoading(true);
      setError(null);
      await apiFetch('/membership/onboarding', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          birthdayYear: birthday.year,
          birthdayMonth: birthday.month,
          referrerEmail: includeReferrer ? trimmedEmail : null,
        }),
      });
      router.replace(resolvedNext);
    } catch (err) {
      if (err instanceof ApiError) {
        if (err.status === 404) {
          setError(
            isZh
              ? '未找到该推荐人，请确认会员邮箱。'
              : 'Referrer not found. Please check the member email.',
          );
          return;
        }
        if (err.status === 409) {
          router.replace(resolvedNext);
          return;
        }
        if (err.status === 400) {
          setError(
            isZh
              ? '提交的信息无效，请检查出生年月和推荐人邮箱。'
              : 'Invalid information. Check the birth year/month and referrer email.',
          );
          return;
        }
      }
      console.error(err);
      setError(
        isZh ? '会员信息保存失败，请稍后重试。' : 'Failed to save membership information.',
      );
    } finally {
      setLoading(false);
    }
  };

  if (pageLoading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-slate-50 text-sm text-slate-500">
        {isZh ? '正在加载会员信息…' : 'Loading membership information…'}
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-slate-50">
      <header className="border-b border-slate-200 bg-white">
        <div className="mx-auto flex max-w-3xl items-center justify-center px-4 py-3">
          <div className="text-sm font-medium text-slate-900">
            {isZh ? '完成会员注册' : 'Complete membership registration'}
          </div>
        </div>
      </header>

      <main className="mx-auto flex max-w-md flex-col px-4 py-10">
        <h1 className="mb-2 text-2xl font-semibold text-slate-900">
          {isZh ? '会员信息' : 'Member information'}
        </h1>
        <p className="mb-6 text-xs leading-relaxed text-slate-500">
          {isZh
            ? '出生年份和月份用于确认会员最低年龄资格及生日月权益。推荐人仅可在本次注册流程中填写；提交或跳过后不能再新增或更改。'
            : 'Birth year and month are used for minimum-age eligibility and birthday-month benefits. A referrer can only be entered during this registration flow; after you submit or skip, it cannot be added or changed.'}
        </p>

        {needsPhoneVerification ? (
          <section className="mb-6 rounded-2xl bg-white p-4 shadow-sm ring-1 ring-slate-200">
            <div className="mb-3 text-sm font-medium text-slate-900">
              {isZh ? '验证会员手机号码' : 'Verify member phone number'}
            </div>
            {phoneVerified ? (
              <p className="text-xs text-emerald-600">
                {isZh ? '手机号已验证。' : 'Phone verified.'}
              </p>
            ) : phoneStep === 'INPUT_PHONE' ? (
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
                    onChange={(e) => setPhone(normalizeCanadianPhoneInput(e.target.value))}
                    placeholder={isZh ? '请输入手机号' : 'Enter your phone number'}
                    className="w-full border-0 p-0 text-sm text-slate-900 focus:outline-none"
                  />
                </div>
                {phoneError ? <p className="mt-3 text-xs text-rose-500">{phoneError}</p> : null}
                <button
                  type="button"
                  onClick={handleRequestPhoneCode}
                  disabled={phoneLoading}
                  className="mt-4 w-full rounded-xl bg-emerald-600 px-4 py-2 text-sm font-medium text-white hover:bg-emerald-700 disabled:opacity-60"
                >
                  {phoneLoading ? (isZh ? '发送中…' : 'Sending…') : isZh ? '获取验证码' : 'Send code'}
                </button>
              </>
            ) : (
              <>
                <label className="block text-xs font-medium text-slate-700">
                  {isZh ? '验证码' : 'Verification code'}
                </label>
                <input
                  type="text"
                  inputMode="numeric"
                  value={phoneCode}
                  maxLength={6}
                  onChange={(e) => setPhoneCode(e.target.value.replace(/\D/g, ''))}
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
                    onClick={handleRequestPhoneCode}
                    disabled={phoneLoading || phoneCountdown > 0}
                    className="font-medium text-emerald-600 disabled:text-slate-400"
                  >
                    {phoneCountdown > 0
                      ? isZh
                        ? `重新发送 (${phoneCountdown}s)`
                        : `Resend (${phoneCountdown}s)`
                      : isZh
                        ? '重新发送'
                        : 'Resend'}
                  </button>
                </div>
                {phoneError ? <p className="mt-3 text-xs text-rose-500">{phoneError}</p> : null}
                <button
                  type="button"
                  onClick={handleVerifyPhoneCode}
                  disabled={phoneLoading}
                  className="mt-4 w-full rounded-xl bg-emerald-600 px-4 py-2 text-sm font-medium text-white hover:bg-emerald-700 disabled:opacity-60"
                >
                  {phoneLoading ? (isZh ? '验证中…' : 'Verifying…') : isZh ? '完成验证' : 'Verify'}
                </button>
              </>
            )}
          </section>
        ) : null}

        <section className="mb-6 rounded-2xl bg-white p-4 shadow-sm ring-1 ring-slate-200">
          <div className="mb-3 text-sm font-medium text-slate-900">
            {isZh ? '出生年月' : 'Birth year and month'}
          </div>
          <div className="grid grid-cols-2 gap-3">
            <input
              type="text"
              inputMode="numeric"
              value={birthYear}
              maxLength={4}
              onChange={(e) => {
                setBirthYear(e.target.value.replace(/\D/g, ''));
                setBirthdayError(null);
              }}
              placeholder={isZh ? '年份，如 1999' : 'Year, e.g. 1999'}
              className="w-full rounded-xl border border-slate-200 px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-slate-400"
            />
            <input
              type="text"
              inputMode="numeric"
              value={birthMonth}
              maxLength={2}
              onChange={(e) => {
                setBirthMonth(e.target.value.replace(/\D/g, ''));
                setBirthdayError(null);
              }}
              placeholder={isZh ? '月份' : 'Month'}
              className="w-full rounded-xl border border-slate-200 px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-slate-400"
            />
          </div>
          <p className="mt-2 text-xs text-slate-500">
            {isZh
              ? '我们不要求完整出生日期。会员服务不向 13 岁以下儿童开放。'
              : 'We do not require your full date of birth. Membership is not available to children under 13.'}
          </p>
          {birthdayError ? <p className="mt-3 text-xs text-rose-500">{birthdayError}</p> : null}
        </section>

        <section className="rounded-2xl bg-white p-4 shadow-sm ring-1 ring-slate-200">
          <div className="mb-2 text-sm font-medium text-slate-900">
            {isZh ? '推荐人（可选）' : 'Referrer (optional)'}
          </div>
          <p className="mb-3 text-xs leading-relaxed text-slate-500">
            {isZh
              ? '只接受推荐人的 SanQ 会员邮箱。邮箱仅用于找到对应会员账户，推荐关系绑定到账户本身。'
              : 'Enter the referrer’s SanQ member email only. The email is used to find the member account; the referral is bound to the account itself.'}
          </p>
          <input
            type="email"
            autoComplete="email"
            value={referrerEmail}
            onChange={(e) => {
              setReferrerEmail(e.target.value);
              setError(null);
            }}
            placeholder={isZh ? '推荐人会员邮箱' : 'Referrer member email'}
            className="w-full rounded-xl border border-slate-200 px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-slate-400"
          />

          {error ? <p className="mt-3 text-xs text-rose-500">{error}</p> : null}

          <button
            type="button"
            onClick={() => void handleFinalize(true)}
            disabled={loading || (needsPhoneVerification && !phoneVerified)}
            className="mt-4 w-full rounded-xl bg-slate-900 px-4 py-2.5 text-sm font-medium text-white hover:bg-slate-800 disabled:cursor-not-allowed disabled:opacity-50"
          >
            {loading ? (isZh ? '保存中…' : 'Saving…') : isZh ? '保存并完成注册' : 'Save and finish registration'}
          </button>
          <button
            type="button"
            onClick={() => void handleFinalize(false)}
            disabled={loading || (needsPhoneVerification && !phoneVerified)}
            className="mt-3 w-full rounded-xl border border-slate-300 bg-white px-4 py-2.5 text-sm font-medium text-slate-700 hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-50"
          >
            {isZh ? '不填写推荐人，完成注册' : 'Finish without a referrer'}
          </button>
          <p className="mt-3 text-center text-[11px] leading-relaxed text-slate-500">
            {isZh
              ? '提交或跳过推荐人后，此推荐关系设置不能再修改。'
              : 'After you submit or skip the referrer, this referral setting cannot be changed.'}
          </p>
        </section>
      </main>
    </div>
  );
}
