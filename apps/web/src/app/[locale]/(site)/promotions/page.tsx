'use client';

import Link from 'next/link';
import { useCallback, useEffect, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import type { Locale } from '@/lib/i18n/locales';
import { useSession } from '@/lib/auth-session';
import { apiFetch } from '@/lib/api/client';

type ClaimableProgram = {
  programStableId: string;
  titleZh: string;
  titleEn: string | null;
  giftValue: string | null;
  validFrom: string | null;
  validTo: string | null;
  perUserLimit: number;
  issuedToUser: number;
  canClaim: boolean;
  unavailableReason: 'TOTAL_LIMIT_REACHED' | 'USER_LIMIT_REACHED' | null;
};

function formatDate(value: string | null, locale: Locale) {
  if (!value) return null;
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return null;
  return new Intl.DateTimeFormat(locale === 'zh' ? 'zh-CA' : 'en-CA', {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
  }).format(date);
}

export default function PromotionsClaimPage() {
  const router = useRouter();
  const { locale } = useParams<{ locale: Locale }>();
  const { status } = useSession();
  const isZh = locale === 'zh';
  const [programs, setPrograms] = useState<ClaimableProgram[]>([]);
  const [promoCode, setPromoCode] = useState('');
  const [loading, setLoading] = useState(true);
  const [claimingId, setClaimingId] = useState<string | null>(null);
  const [claimingCode, setClaimingCode] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  const loadPrograms = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const data = await apiFetch<ClaimableProgram[]>('/promotions/claimable');
      setPrograms(data ?? []);
    } catch (err) {
      console.error(err);
      setError(
        err instanceof Error
          ? err.message
          : isZh
            ? '加载可领取活动失败。'
            : 'Failed to load claimable promotions.',
      );
    } finally {
      setLoading(false);
    }
  }, [isZh]);

  useEffect(() => {
    if (status === 'unauthenticated') {
      router.replace(
        `/${locale}/membership/login?redirect=${encodeURIComponent(`/${locale}/promotions`)}`,
      );
      return;
    }
    if (status === 'authenticated') void loadPrograms();
  }, [loadPrograms, locale, router, status]);

  async function claimProgram(program: ClaimableProgram) {
    setClaimingId(program.programStableId);
    setError(null);
    setSuccess(null);
    try {
      await apiFetch(`/promotions/programs/${program.programStableId}/claim`, {
        method: 'POST',
      });
      setSuccess(
        isZh
          ? `已领取：${program.titleZh}`
          : `Claimed: ${program.titleEn ?? program.titleZh}`,
      );
      await loadPrograms();
    } catch (err) {
      console.error(err);
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setClaimingId(null);
    }
  }

  async function claimPromoCode() {
    const code = promoCode.trim();
    if (!code) {
      setError(isZh ? '请输入 Promo Code。' : 'Enter a promo code.');
      return;
    }
    setClaimingCode(true);
    setError(null);
    setSuccess(null);
    try {
      const result = await apiFetch<{
        titleZh: string;
        titleEn: string | null;
      }>('/promotions/promo-code/claim', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ code }),
      });
      setPromoCode('');
      setSuccess(
        isZh
          ? `兑换成功：${result.titleZh}`
          : `Redeemed: ${result.titleEn ?? result.titleZh}`,
      );
      await loadPrograms();
    } catch (err) {
      console.error(err);
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setClaimingCode(false);
    }
  }

  return (
    <main className="mx-auto min-h-[70vh] max-w-4xl space-y-6 px-4 py-8 sm:px-6">
      <header className="space-y-2">
        <p className="text-xs font-semibold uppercase tracking-[0.3em] text-amber-700">
          SanQ Roujiamo
        </p>
        <h1 className="text-3xl font-bold text-slate-900">
          {isZh ? '优惠活动' : 'Promotions'}
        </h1>
        <p className="text-sm text-slate-600">
          {isZh
            ? '领取当前可用的会员优惠，或输入 Promo Code 将优惠券加入你的账户。'
            : 'Claim available member offers or enter a promo code to add coupons to your account.'}
        </p>
      </header>

      <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
        <h2 className="text-lg font-semibold text-slate-900">
          {isZh ? 'Promo Code' : 'Promo code'}
        </h2>
        <div className="mt-3 flex flex-col gap-3 sm:flex-row">
          <input
            value={promoCode}
            onChange={(event) => setPromoCode(event.target.value.toUpperCase())}
            placeholder={isZh ? '输入兑换码' : 'Enter code'}
            autoCapitalize="characters"
            className="min-w-0 flex-1 rounded-md border border-slate-300 px-3 py-2 text-sm uppercase"
          />
          <button
            type="button"
            disabled={claimingCode}
            onClick={() => void claimPromoCode()}
            className="rounded-md bg-slate-900 px-5 py-2 text-sm font-semibold text-white disabled:opacity-60"
          >
            {claimingCode ? (isZh ? '兑换中…' : 'Redeeming…') : isZh ? '兑换' : 'Redeem'}
          </button>
        </div>
      </section>

      {error ? (
        <div className="rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-700">
          {error}
        </div>
      ) : null}
      {success ? (
        <div className="rounded-lg border border-emerald-200 bg-emerald-50 p-3 text-sm text-emerald-700">
          {success}
        </div>
      ) : null}

      <section className="space-y-3">
        <div className="flex items-center justify-between gap-3">
          <h2 className="text-xl font-semibold text-slate-900">
            {isZh ? '可领取活动' : 'Offers to claim'}
          </h2>
          <Link
            href={`/${locale}/membership`}
            className="text-sm font-medium text-amber-700 hover:text-amber-600"
          >
            {isZh ? '查看我的优惠券' : 'My coupons'}
          </Link>
        </div>

        {loading ? (
          <p className="text-sm text-slate-500">{isZh ? '加载中…' : 'Loading…'}</p>
        ) : programs.length === 0 ? (
          <div className="rounded-2xl border border-dashed border-slate-300 bg-slate-50 p-6 text-sm text-slate-600">
            {isZh ? '当前没有可公开领取的活动。' : 'There are no public claim offers right now.'}
          </div>
        ) : (
          <div className="grid gap-4 md:grid-cols-2">
            {programs.map((program) => {
              const endDate = formatDate(program.validTo, locale);
              const title = isZh
                ? program.titleZh
                : program.titleEn ?? program.titleZh;
              return (
                <article
                  key={program.programStableId}
                  className="flex flex-col justify-between rounded-2xl border border-amber-200 bg-amber-50/40 p-5"
                >
                  <div className="space-y-2">
                    <h3 className="text-lg font-semibold text-slate-900">{title}</h3>
                    {program.giftValue ? (
                      <p className="text-sm font-medium text-amber-800">{program.giftValue}</p>
                    ) : null}
                    {endDate ? (
                      <p className="text-xs text-slate-500">
                        {isZh ? `活动截止：${endDate}` : `Offer ends: ${endDate}`}
                      </p>
                    ) : null}
                  </div>
                  <button
                    type="button"
                    disabled={!program.canClaim || claimingId === program.programStableId}
                    onClick={() => void claimProgram(program)}
                    className="mt-5 rounded-md bg-amber-600 px-4 py-2 text-sm font-semibold text-white disabled:cursor-not-allowed disabled:bg-slate-300"
                  >
                    {claimingId === program.programStableId
                      ? isZh
                        ? '领取中…'
                        : 'Claiming…'
                      : program.canClaim
                        ? isZh
                          ? '领取'
                          : 'Claim'
                        : isZh
                          ? '已领取 / 不可领取'
                          : 'Claimed / unavailable'}
                  </button>
                </article>
              );
            })}
          </div>
        )}
      </section>
    </main>
  );
}
