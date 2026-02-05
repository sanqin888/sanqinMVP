// apps/web/src/app/[locale]/membership/info/page.tsx
'use client';

import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
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
  referrerEmail?: string | null;
};

type PhoneStep = 'INPUT_PHONE' | 'INPUT_CODE';

export default function MembershipReferrerPage() {
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
  const [loading, setLoading] = useState(false);
  const [phoneLoading, setPhoneLoading] = useState(false);
  const [birthMonth, setBirthMonth] = useState('');
  const [birthDay, setBirthDay] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [phoneError, setPhoneError] = useState<string | null>(null);
  const [birthdayError, setBirthdayError] = useState<string | null>(null);

  const canSubmitReferrer = useMemo(() => {
    if (needsPhoneVerification && !phoneVerified) return false;
    return true;
  }, [needsPhoneVerification, phoneVerified]);

  useEffect(() => {
    if (status === 'unauthenticated') {
      const params = new URLSearchParams({ redirect: resolvedNext });
      router.replace(`/${locale}/membership/login?${params.toString()}`);
    }
  }, [status, router, locale, resolvedNext]);

  useEffect(() => {
    if (status !== 'authenticated') return;
    let canceled = false;

    const loadSummary = async () => {
      try {
        const summary = await apiFetch<MembershipSummary>('/membership/summary');
        if (canceled) return;

        if (summary.referrerEmail) {
          router.replace(resolvedNext);
          return;
        }

        if (summary.phone) setPhone(stripCanadianCountryCode(summary.phone));
        setPhoneVerified(Boolean(summary.phoneVerified));
      } catch (err) {
        console.error(err);
      }
    };

    void loadSummary();

    return () => {
      canceled = true;
    };
  }, [status, router, resolvedNext]);

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

  const handleSubmitReferrer = async () => {
    if (needsPhoneVerification && !phoneVerified) {
      setError(
        isZh
          ? '请先完成手机号验证。'
          : 'Please verify your phone number first.',
      );
      return;
    }


    const month = Number(birthMonth);
    const day = Number(birthDay);
    if (!birthMonth.trim() || !birthDay.trim()) {
      setBirthdayError(
        isZh ? '请输入生日月份和日期。' : 'Please enter your birth month and day.',
      );
      return;
    }
    if (
      Number.isNaN(month) ||
      Number.isNaN(day) ||
      month < 1 ||
      month > 12 ||
      day < 1 ||
      day > [31, 29, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31][month - 1]
    ) {
      setBirthdayError(
        isZh ? '请输入有效的生日（月/日）。' : 'Please enter a valid birthday (month/day).',
      );
      return;
    }
    setBirthdayError(null);

    const trimmed = referrerEmail.trim();
    if (!trimmed) {
      router.replace(resolvedNext);
      return;
    }

    const looksLikeEmail = /^\S+@\S+\.\S+$/.test(trimmed);
    const looksLikePhone = /^\+?[0-9\s()\-]{6,}$/.test(trimmed);
    if (!looksLikeEmail && !looksLikePhone) {
      setError(
        isZh
          ? '请输入正确的邮箱或手机号。'
          : 'Please enter a valid email or phone.',
      );
      return;
    }

    try {
      setLoading(true);
      setError(null);
      await apiFetch('/membership/referrer', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ referrerInput: trimmed }),
      });
      router.replace(resolvedNext);
    } catch (err) {
      if (err instanceof ApiError) {
        if (err.status === 404) {
          setError(
            isZh
              ? '未找到该推荐人，请确认邮箱或手机号。'
              : 'Referrer not found. Please check the email or phone.',
          );
          return;
        }
        if (err.status === 400) {
          setError(
            isZh
              ? '请输入有效的推荐人邮箱或手机号。'
              : 'Please enter a valid referrer email or phone.',
          );
          return;
        }
      }
      console.error(err);
      setError(
        isZh ? '推荐人信息填写失败，请稍后再试。' : 'Failed to save referrer.',
      );
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-slate-50">
      <header className="border-b border-slate-200 bg-white">
        <div className="mx-auto flex max-w-3xl items-center justify-between px-4 py-3">
          <Link
            href={resolvedNext}
            className="text-sm text-slate-600 hover:text-slate-900"
          >
            ← {isZh ? '稍后填写' : 'Skip for now'}
          </Link>
          <div className="text-sm font-medium text-slate-900">
            {isZh ? '会员信息' : 'Member information'}
          </div>
          <div className="w-10" />
        </div>
      </header>

      <main className="mx-auto flex max-w-md flex-col px-4 py-10">
        <h1 className="mb-6 text-2xl font-semibold text-slate-900">
          {isZh ? '会员信息' : 'Member information'}
        </h1>

        <div className="mb-6 rounded-2xl bg-white p-4 shadow-sm ring-1 ring-slate-200">
            <div className="mb-3 text-sm font-medium text-slate-900">
              {isZh ? '绑定会员手机号码' : 'Bind member phone number'}
            </div>
            {phoneVerified ? (
              <p className="text-xs text-emerald-600">
                {isZh ? '手机号已验证。' : 'Phone verified.'}
              </p>
            ) : (
              <>
                {phoneStep === 'INPUT_PHONE' && (
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
                        placeholder={
                          isZh ? '请输入手机号' : 'Enter your phone number'
                        }
                        className="w-full border-0 p-0 text-sm text-slate-900 focus:outline-none"
                      />
                    </div>
                    {phoneError && (
                      <p className="mt-3 text-center text-xs text-rose-500">
                        {phoneError}
                      </p>
                    )}
                    <button
                      type="button"
                      onClick={handleRequestPhoneCode}
                      disabled={phoneLoading}
                      className="mt-4 flex w-full items-center justify-center rounded-xl bg-emerald-600 px-4 py-2 text-sm font-medium text-white hover:bg-emerald-700 disabled:cursor-not-allowed disabled:opacity-60"
                    >
                      {phoneLoading
                        ? isZh
                          ? '发送中...'
                          : 'Sending...'
                        : isZh
                          ? '获取验证码'
                          : 'Send code'}
                    </button>
                  </>
                )}

                {phoneStep === 'INPUT_CODE' && (
                  <>
                    <label className="block text-xs font-medium text-slate-700">
                      {isZh ? '验证码' : 'Verification code'}
                    </label>
                    <input
                      type="text"
                      inputMode="numeric"
                      value={phoneCode}
                      maxLength={6}
                      onChange={(e) => setPhoneCode(e.target.value)}
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
                        className="text-xs font-medium text-emerald-600 hover:text-emerald-700 disabled:cursor-not-allowed disabled:text-slate-400"
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

                    {phoneError && (
                      <p className="mt-3 text-center text-xs text-rose-500">
                        {phoneError}
                      </p>
                    )}

                    <button
                      type="button"
                      onClick={handleVerifyPhoneCode}
                      disabled={phoneLoading}
                      className="mt-4 flex w-full items-center justify-center rounded-xl bg-emerald-600 px-4 py-2 text-sm font-medium text-white hover:bg-emerald-700 disabled:cursor-not-allowed disabled:opacity-60"
                    >
                      {phoneLoading
                        ? isZh
                          ? '验证中...'
                          : 'Verifying...'
                        : isZh
                          ? '完成验证'
                          : 'Verify'}
                    </button>
                  </>
                )}
              </>
            )}
          <div className="mt-5 border-t border-slate-100 pt-4">
            <label className="block text-xs font-medium text-slate-700">
              {isZh ? '生日（月/日）' : 'Birthday (month/day)'}
            </label>
            <div className="mt-1 grid grid-cols-2 gap-3">
              <input
                type="text"
                inputMode="numeric"
                value={birthMonth}
                maxLength={2}
                onChange={(e) => {
                  setBirthMonth(e.target.value.replace(/\D/g, ''));
                  setBirthdayError(null);
                }}
                placeholder={isZh ? '月' : 'Month'}
                className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm text-slate-900 focus:outline-none focus:ring-1 focus:ring-slate-400"
              />
              <input
                type="text"
                inputMode="numeric"
                value={birthDay}
                maxLength={2}
                onChange={(e) => {
                  setBirthDay(e.target.value.replace(/\D/g, ''));
                  setBirthdayError(null);
                }}
                placeholder={isZh ? '日' : 'Day'}
                className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm text-slate-900 focus:outline-none focus:ring-1 focus:ring-slate-400"
              />
            </div>
            <p className="mt-2 text-xs text-slate-500">
              {isZh
                ? '（将在您生日月发送会员专属生日礼包）'
                : '(A member birthday gift will be sent during your birthday month.)'}
            </p>
          </div>

          {birthdayError && (
            <p className="mt-3 text-center text-xs text-rose-500">
              {birthdayError}
            </p>
          )}


          </div>

        <div className="rounded-2xl bg-white p-4 shadow-sm ring-1 ring-slate-200">
          <p className="mb-3 text-sm text-slate-600">
            {isZh
              ? '推荐人邮箱或手机号用于绑定推荐关系，提交后不可更改，如跳过不可补充。'
              : 'Referrer email or phone is used to bind the referral relationship and cannot be changed after submission. If skipped, it cannot be added later.'}
          </p>
          <label className="block text-xs font-medium text-slate-700">
            {isZh ? '推荐人邮箱或手机号（可选）' : 'Referrer email or phone (optional)'}
          </label>
          <input
            type="text"
            value={referrerEmail}
            onChange={(e) => setReferrerEmail(e.target.value)}
            placeholder={
              isZh ? '请输入推荐人邮箱或手机号' : 'Enter referrer email or phone'
            }
            className="mt-1 w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm text-slate-900 focus:outline-none focus:ring-1 focus:ring-slate-400"
          />

          {error && (
            <p className="mt-3 text-center text-xs text-rose-500">{error}</p>
          )}

          <button
            type="button"
            onClick={handleSubmitReferrer}
            disabled={loading || !canSubmitReferrer}
            className="mt-4 flex w-full items-center justify-center rounded-xl bg-slate-900 px-4 py-2 text-sm font-medium text-white hover:bg-slate-800 disabled:cursor-not-allowed disabled:opacity-60"
          >
            {loading
              ? isZh
                ? '提交中...'
                : 'Saving...'
              : isZh
                ? '完成'
                : 'Finish'}
          </button>
        </div>

        <p className="mt-4 text-xs text-slate-500">
          {isZh
            ? '填写后将立即生效，若没有推荐人也可跳过。'
            : 'You can skip if you do not have a referrer.'}
        </p>
      </main>
    </div>
  );
}
