// apps/web/src/app/[locale]/membership/login/page.tsx
'use client';

import { useEffect, useState } from 'react';
import { useRouter, useParams } from 'next/navigation';
import Link from 'next/link';
import { signIn, useSession } from 'next-auth/react';
import type { Locale } from '@/lib/order/shared';
import { apiFetch } from '@/lib/api-client';

// ✅ 和当前后端保持一致：success 布尔值即可
type PhoneVerifyResponse = {
  success: boolean;
};

export default function MemberLoginPage() {
  const router = useRouter();
  const { locale } = useParams<{ locale: Locale }>();
  const { status } = useSession();

  const isZh = locale === 'zh';

  // —— 原有字段 ——
  const [referrerEmail, setReferrerEmail] = useState<string>('');
  const [birthdayMonth, setBirthdayMonth] = useState<string>('');
  const [birthdayDay, setBirthdayDay] = useState<string>('');
  const [error, setError] = useState<string | null>(null);
  const [marketingOptIn, setMarketingOptIn] = useState(false);

  // —— 新增：手机号 + 验证码相关状态 ——
  const [phone, setPhone] = useState<string>('');
  const [phoneCode, setPhoneCode] = useState<string>('');
  const [isSendingCode, setIsSendingCode] = useState(false);
  const [isVerifyingCode, setIsVerifyingCode] = useState(false);
  const [phoneVerified, setPhoneVerified] = useState(false);
  // ⚠️ 现在后端不再返回 verificationToken，我们前端自己用一个简单标记字符串（例如 '1'）
  const [phoneVerificationToken, setPhoneVerificationToken] = useState<string | null>(null);
  const [countdown, setCountdown] = useState<number>(0); // 发送验证码后的倒计时（秒）
  const [trustedPhone, setTrustedPhone] = useState<string | null>(null);

  // 登录后直接跳会员中心
  useEffect(() => {
    if (status === 'authenticated') {
      router.replace(`/${locale}/membership`);
    }
  }, [status, router, locale]);

  // 设备级：如果这台设备之前已经验证过一个手机号，自动预填并视为已验证
  useEffect(() => {
    if (typeof window === 'undefined') return;

    try {
      const raw = window.localStorage.getItem('sanqin_phone_trusted');
      if (!raw) return;

      const saved = JSON.parse(raw) as { phone?: string; verifiedAt?: number };
      if (!saved.phone) return;

      setTrustedPhone(saved.phone);
      setPhone(saved.phone);
      setPhoneVerified(true);
      setPhoneVerificationToken(null); // 老会员下次登录不再依赖 token
    } catch (err) {
      console.error('Failed to read sanqin_phone_trusted', err);
    }
  }, []);

  // 短信倒计时
  useEffect(() => {
    if (countdown <= 0) return;
    const timer = window.setTimeout(() => {
      setCountdown((prev) => (prev > 0 ? prev - 1 : 0));
    }, 1000);
    return () => {
      window.clearTimeout(timer);
    };
  }, [countdown]);

  // 校验推荐人邮箱 / 生日（原逻辑）
  function validateInputs(): boolean {
    // 1) 推荐人邮箱（可空，填了就要是邮箱格式）
    const emailTrimmed = referrerEmail.trim();
    if (emailTrimmed) {
      const ok = /\S+@\S+\.\S+/.test(emailTrimmed);
      if (!ok) {
        setError(isZh ? '推荐人邮箱格式不正确' : 'Referrer email format is invalid');
        return false;
      }
    }

    // 2) 生日（只要填了任意一个，就要求月份/日期都合法）
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
          isZh ? '生日月份/日期不合法' : 'Birthday month/day is not valid.',
        );
        return false;
      }
    }

    setError(null);
    return true;
  }

  function validatePhoneBasic(): boolean {
    const trimmed = phone.trim();
    if (!trimmed) {
      setError(isZh ? '请先填写手机号' : 'Please enter your phone number.');
      return false;
    }

    // 简单长度校验
    const digits = trimmed.replace(/\D/g, '');
    if (digits.length < 8 || digits.length > 15) {
      setError(
        isZh ? '手机号格式看起来不正确' : 'Phone number format does not look valid.',
      );
      return false;
    }

    return true;
  }

  // 发送验证码
  async function handleSendCode() {
    setError(null);
    if (!validatePhoneBasic()) return;

    try {
      setIsSendingCode(true);

      // ✅ 使用现在后端已经在用的接口：/auth/phone/request-code
      await apiFetch<PhoneVerifyResponse>('/auth/phone/request-code', {
        method: 'POST',
        body: JSON.stringify({ phone: phone.trim(), locale }),
        headers: {
          'Content-Type': 'application/json',
        },
      });

      setCountdown(60); // 60 秒内不能重复发送
    } catch (err) {
      console.error(err);
      setError(
        isZh ? '验证码发送失败，请稍后再试' : 'Failed to send verification code. Please try again.',
      );
    } finally {
      setIsSendingCode(false);
    }
  }

  // 校验验证码
  async function handleVerifyCode() {
    setError(null);
    if (!validatePhoneBasic()) return;

    const codeTrimmed = phoneCode.trim();
    if (!codeTrimmed) {
      setError(isZh ? '请输入短信验证码' : 'Please enter the SMS code.');
      return;
    }

    try {
      setIsVerifyingCode(true);

      // ✅ 使用统一的 verify 接口：/auth/phone/verify-code
      const res = await apiFetch<PhoneVerifyResponse>('/auth/phone/verify-code', {
        method: 'POST',
        body: JSON.stringify({ phone: phone.trim(), code: codeTrimmed }),
        headers: {
          'Content-Type': 'application/json',
        },
      });

      // apiFetch 遇到非 2xx 会直接 throw，所以这里一般 success=true
      if (!res.success) {
        setPhoneVerified(false);
        setPhoneVerificationToken(null);
        setError(
          isZh ? '验证码不正确或已失效' : 'Verification code is invalid or expired.',
        );
        return;
      }
      // ✅ 校验成功：本地标记为已验证，并给一个简单的“验证凭证”字符串
      setPhoneVerified(true);
      setPhoneVerificationToken('1'); // 现在先用固定字符串，后端只需要知道“已经验证过了”
      setError(null);
      // ✅ 记住这台设备上已经验证过的手机号
      const trimmedPhone = phone.trim();
      setTrustedPhone(trimmedPhone);
      if (typeof window !== 'undefined') {
        try {
          window.localStorage.setItem(
            'sanqin_phone_trusted',
            JSON.stringify({
              phone: trimmedPhone,
              verifiedAt: Date.now(),
            }),
          );
        } catch (err) {
          console.error('Failed to save sanqin_phone_trusted', err);
        }
      }
    } catch (err) {
      console.error(err);
      setPhoneVerified(false);
      setPhoneVerificationToken(null);
      setError(
        isZh ? '验证码校验失败，请稍后再试' : 'Failed to verify code. Please try again.',
      );
    } finally {
      setIsVerifyingCode(false);
    }
  }

  // 点击 Google 登录：必须先通过手机验证
  function handleGoogleLogin() {
    // 先校验推荐人邮箱 / 生日等
    if (!validateInputs()) return;

    // 再检查手机号是否已验证
    if (!phoneVerified) {
      setError(
        isZh
          ? '请先完成手机号验证，再继续使用 Google 登录。'
          : 'Please verify your phone number before continuing with Google.',
      );
      return;
    }

    // ⭐ 把可选信息 + 手机号 + 验证凭证存本地，用于会员中心页面“首次注册补充资料”
    if (typeof window !== 'undefined') {
      try {
        const payload = {
          phone: phone.trim(),
          phoneVerificationToken, // 现在就是 '1'
          referrerEmail: referrerEmail.trim() || null,
          birthdayMonth: birthdayMonth ? String(birthdayMonth).trim() : null,
          birthdayDay: birthdayDay ? String(birthdayDay).trim() : null,
          marketingEmailOptIn: marketingOptIn,
        };
        window.localStorage.setItem(
          'sanqin_membership_prefill',
          JSON.stringify(payload),
        );
      } catch (err) {
        console.error('Failed to save membership prefill', err);
      }
    }

    // 把必要信息也塞到 callbackUrl 的 query（方便后端 / 会员中心用）
    const params = new URLSearchParams();
    params.set('phone', phone.trim());
    if (phoneVerificationToken) {
      params.set('pv', phoneVerificationToken);
    }

    const emailTrimmed = referrerEmail.trim();
    if (emailTrimmed) params.set('referrerEmail', emailTrimmed);
    if (birthdayMonth.trim()) params.set('birthdayMonth', birthdayMonth.trim());
    if (birthdayDay.trim()) params.set('birthdayDay', birthdayDay.trim());

    const base = `/${locale}/membership`;
    const callbackUrl =
      params.toString().length > 0 ? `${base}?${params.toString()}` : base;

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
          {isZh ? '先验证手机号，再使用 Google 登录' : 'Verify your phone, then sign in with Google'}
        </h1>
        <p className="mb-6 text-sm text-slate-600">
          {isZh
            ? '手机号仅用于账号安全和发送优惠短信，不会公开展示。首次注册时需要完成验证。'
            : 'Your phone number is used for account security and SMS offers only. Verification is required when you first sign up.'}
        </p>

        {/* 手机号 */}
        <div className="mt-4">
          <label className="block text-xs font-medium text-slate-700">
            {isZh ? '手机号（必填）' : 'Phone number (required)'}
          </label>
          <input
            type="tel"
            value={phone}
            onChange={(e) => {
              const next = e.target.value;
              setPhone(next);
              setError(null);

              const normalize = (v: string) => v.replace(/\D/g, '');

              if (!next.trim()) {
                // 清空 -> 一定视为未验证
                setPhoneVerified(false);
                setPhoneVerificationToken(null);
              } else if (
                trustedPhone &&
                normalize(next) === normalize(trustedPhone)
              ) {
                // 和“受信任手机号”一致 -> 视为已验证（哪怕这次没有 token）
                setPhoneVerified(true);
              } else {
                // 改成了别的号 -> 必须重新验证
                setPhoneVerified(false);
                setPhoneVerificationToken(null);
              }
            }}
            onBlur={validatePhoneBasic}
            placeholder={
              isZh ? '请输入常用手机号' : 'Enter your mobile phone number'
            }
            className="mt-1 w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm text-slate-900 focus:outline-none focus:ring-1 focus:ring-slate-400"
          />
          <p className="mt-1 text-[11px] text-slate-400">
            {isZh
              ? '我们会给这个号码发送一次性验证码。'
              : 'We will send a one-time verification code to this number.'}
          </p>
        </div>

        {/* 验证码输入 + 按钮 */}
        <div className="mt-3">
          <label className="block text-xs font-medium text-slate-700">
            {isZh ? '短信验证码' : 'SMS verification code'}
          </label>
          <div className="mt-1 flex gap-2">
            <input
              type="text"
              value={phoneCode}
              onChange={(e) => {
                setPhoneCode(e.target.value);
                setError(null);
              }}
              placeholder={isZh ? '6 位数字验证码' : '6-digit code'}
              className="flex-1 rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm text-slate-900 focus:outline-none focus:ring-1 focus:ring-slate-400"
            />
            <button
              type="button"
              onClick={handleSendCode}
              disabled={isSendingCode || countdown > 0}
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
            <button
              type="button"
              onClick={handleVerifyCode}
              disabled={isVerifyingCode || !phoneCode.trim() || phoneVerified}
              className="whitespace-nowrap rounded-xl bg-emerald-600 px-3 py-2 text-xs font-medium text-white hover:bg-emerald-700 disabled:cursor-not-allowed disabled:opacity-60"
            >
              {phoneVerified
                ? isZh
                  ? '已验证'
                  : 'Verified'
                : isZh
                  ? '验证'
                  : 'Verify'}
            </button>
          </div>
          {phoneVerified && (
            <p className="mt-1 text-[11px] text-emerald-600">
              {isZh
                ? '手机号已通过验证，可以继续使用 Google 登录。'
                : 'Phone number verified. You can now continue with Google.'}
            </p>
          )}
        </div>

        {/* 推荐人邮箱 */}
        <div className="mt-4">
          <label className="block text-xs font-medium text-slate-700">
            {isZh ? '推荐人邮箱（可选）' : 'Referrer email (optional)'}
          </label>
          <input
            type="email"
            value={referrerEmail}
            onChange={(e) => {
              setReferrerEmail(e.target.value);
              setError(null);
            }}
            onBlur={validateInputs}
            placeholder={
              isZh ? '例如：friend@example.com' : 'e.g. friend@example.com'
            }
            className="mt-1 w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm text-slate-900 focus:outline-none focus:ring-1 focus:ring-slate-400"
          />
          <p className="mt-1 text-[11px] text-slate-400">
            {isZh
              ? '如填写，请确认邮箱地址，后面不可添加或更改，我们会给推荐人发放推荐奖励。'
              : 'If you fill this in, please double-check the email address. It cannot be added or changed later, and any referral rewards will be sent to this person.'}
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
              onChange={(e) => {
                setBirthdayMonth(e.target.value);
                setError(null);
              }}
              onBlur={validateInputs}
              placeholder={isZh ? '月' : 'MM'}
              className="w-1/2 rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm text-slate-900 focus:outline-none focus:ring-1 focus:ring-slate-400"
            />
            <input
              type="number"
              min={1}
              max={31}
              value={birthdayDay}
              onChange={(e) => {
                setBirthdayDay(e.target.value);
                setError(null);
              }}
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

        {/* 营销邮件勾选 */}
        <div className="mt-4">
          <label className="flex items-start gap-2 text-xs text-slate-600">
            <input
              type="checkbox"
              className="mt-0.5 h-4 w-4 rounded border-slate-300 text-slate-900"
              checked={marketingOptIn}
              onChange={(e) => {
                setMarketingOptIn(e.target.checked);
                setError(null);
              }}
            />
            <span>
              {isZh
                ? '我同意接收新品、优惠活动等邮件通知（可随时在会员中心取消订阅）。'
                : 'I agree to receive occasional emails about new items and promotions (you can unsubscribe anytime in your account settings).'}
            </span>
          </label>
        </div>

        {error && (
          <p className="mt-3 text-center text-xs text-rose-500">{error}</p>
        )}

        <div className="mt-6 rounded-2xl bg-white p-4 shadow-sm ring-1 ring-slate-200">
          <button
            type="button"
            onClick={handleGoogleLogin}
            className="flex w-full items-center justify-center gap-2 rounded-xl bg-slate-900 px-4 py-2 text-sm font-medium text-white hover:bg-slate-800 disabled:opacity-60"
            disabled={!phoneVerified}
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
