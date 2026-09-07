"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useMemo, useState } from "react";
import { apiFetch } from "@/lib/api/client";
import { useSession } from "@/lib/auth-session";

type Props = {
  locale: "zh" | "en";
};

type MarketingSubscriptionOfferResponse = {
  marketingEmailOptIn: boolean;
  emailLinked: boolean;
  offer: {
    couponCount: number;
    giftValue: string;
  } | null;
};

const DISMISS_COOLDOWN_MS = 30 * 24 * 60 * 60 * 1000;

function dismissalKey(userStableId: string) {
  return `sanq:marketing-subscription-prompt:dismissed:${userStableId}`;
}

function wasRecentlyDismissed(userStableId: string) {
  try {
    const raw = window.localStorage.getItem(dismissalKey(userStableId));
    if (!raw) return false;
    const dismissedAt = Number(raw);
    return Number.isFinite(dismissedAt) && Date.now() - dismissedAt < DISMISS_COOLDOWN_MS;
  } catch {
    return false;
  }
}

function rememberDismissal(userStableId: string) {
  try {
    window.localStorage.setItem(dismissalKey(userStableId), String(Date.now()));
  } catch {
    // Storage can be unavailable in privacy-restricted browsers. Dismissal still
    // applies to the current render through local component state.
  }
}

function formatGiftValue(value: string) {
  const trimmed = value.trim();
  if (/^(?:CA)?\$/i.test(trimmed)) return trimmed;
  return `$${trimmed}`;
}

export default function MarketingSubscriptionPrompt({ locale }: Props) {
  const pathname = usePathname();
  const { data: session, status } = useSession();
  const [offerState, setOfferState] = useState<MarketingSubscriptionOfferResponse | null>(null);
  const [dismissed, setDismissed] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const isZh = locale === "zh";
  const userStableId = session?.user?.userStableId;

  const shouldCheck = useMemo(() => {
    if (status !== "authenticated" || !userStableId) return false;
    if (session?.user?.role !== "CUSTOMER") return false;
    if (session?.user?.requiresTwoFactor && !session.user.mfaVerifiedAt) return false;
    if (pathname?.includes("/membership/login") || pathname?.includes("/membership/2fa")) {
      return false;
    }
    return true;
  }, [pathname, session?.user, status, userStableId]);

  useEffect(() => {
    setOfferState(null);
    setDismissed(false);
    setError(null);

    if (!shouldCheck || !userStableId) return;
    if (wasRecentlyDismissed(userStableId)) {
      setDismissed(true);
      return;
    }

    const controller = new AbortController();
    const loadOffer = async () => {
      try {
        const data = await apiFetch<MarketingSubscriptionOfferResponse>(
          "/membership/marketing-subscription-offer",
          { signal: controller.signal },
        );
        if (!controller.signal.aborted) setOfferState(data);
      } catch (loadError) {
        if (!controller.signal.aborted) {
          console.error("Failed to load marketing subscription offer", loadError);
        }
      }
    };

    void loadOffer();
    return () => controller.abort();
  }, [shouldCheck, userStableId]);

  const handleDismiss = () => {
    if (userStableId) rememberDismissal(userStableId);
    setDismissed(true);
  };

  const handleSubscribe = async () => {
    if (!offerState || saving) return;
    if (!offerState.emailLinked) {
      setError(
        isZh
          ? "请先在会员中心绑定邮箱，再开启营销邮件订阅。"
          : "Please link an email in Member Center before enabling marketing emails.",
      );
      return;
    }

    setSaving(true);
    setError(null);
    try {
      await apiFetch("/membership/marketing-consent", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ marketingEmailOptIn: true }),
      });
      setOfferState({ ...offerState, marketingEmailOptIn: true, offer: null });
    } catch (subscribeError) {
      console.error("Failed to enable marketing subscription", subscribeError);
      setError(
        isZh
          ? "订阅开启失败，请稍后再试。"
          : "Could not enable the subscription. Please try again later.",
      );
    } finally {
      setSaving(false);
    }
  };

  const offer = offerState?.offer;
  if (
    dismissed ||
    !shouldCheck ||
    !offerState ||
    offerState.marketingEmailOptIn ||
    !offer ||
    offer.couponCount <= 0
  ) {
    return null;
  }

  const giftValue = offer.giftValue.trim();

  return (
    <div className="fixed inset-0 z-[70] flex items-end justify-center bg-black/30 p-4 sm:items-center" role="presentation">
      <section
        role="dialog"
        aria-modal="true"
        aria-labelledby="marketing-subscription-title"
        className="w-full max-w-lg rounded-3xl border border-[#87362E]/15 bg-[#fffdfa] p-5 shadow-2xl sm:p-6"
      >
        <div className="flex items-start justify-between gap-4">
          <div>
            <p className="text-xs font-bold uppercase tracking-[0.18em] text-[#87362E]/70">
              {isZh ? "会员专属" : "Member exclusive"}
            </p>
            <h2 id="marketing-subscription-title" className="mt-1 text-2xl font-bold text-stone-900">
              {isZh ? "订阅 SanQ 优惠与新品通知" : "Subscribe to SanQ offers & new-item updates"}
            </h2>
          </div>
          <button
            type="button"
            onClick={handleDismiss}
            className="grid h-9 w-9 shrink-0 place-items-center rounded-full text-xl text-stone-400 transition hover:bg-stone-100 hover:text-stone-700"
            aria-label={isZh ? "关闭" : "Close"}
          >
            ×
          </button>
        </div>

        <p className="mt-4 text-sm leading-6 text-stone-600">
          {isZh
            ? "开启营销邮件订阅，获取 SanQ 的优惠活动、新品和会员专属消息。"
            : "Opt in to marketing emails for SanQ promotions, new items, and member-only updates."}
        </p>

        <div className="mt-4 rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3 text-amber-950">
          <p className="font-semibold">
            {isZh
              ? `首次订阅可获得 ${offer.couponCount} 张优惠券，价值 ${formatGiftValue(giftValue)}`
              : `First-time subscribers can receive ${offer.couponCount} coupons, valued at ${formatGiftValue(giftValue)}`}
          </p>
          <p className="mt-1 text-xs leading-5 text-amber-900/80">
            {isZh
              ? "奖励内容以当前有效的订阅礼包为准。"
              : "Reward details follow the currently active subscription bundle."}
          </p>
        </div>

        <p className="mt-4 text-xs leading-5 text-stone-500">
          {isZh
            ? "点击开启即表示你同意接收 SanQ 的营销邮件。你可以随时在会员中心取消订阅。"
            : "By enabling this option, you consent to receive SanQ marketing emails. You can unsubscribe anytime in Member Center."}
          {" "}
          <Link href={`/${locale}/legal/privacy`} className="font-semibold text-[#87362E] underline underline-offset-2">
            {isZh ? "隐私政策" : "Privacy policy"}
          </Link>
        </p>

        {error ? (
          <div className="mt-3 rounded-xl bg-red-50 px-3 py-2 text-sm text-red-700">
            {error}
            {!offerState.emailLinked ? (
              <>
                {" "}
                <Link href={`/${locale}/membership`} className="font-semibold underline underline-offset-2">
                  {isZh ? "前往会员中心" : "Go to Member Center"}
                </Link>
              </>
            ) : null}
          </div>
        ) : null}

        <div className="mt-5 flex flex-col-reverse gap-2 sm:flex-row sm:items-center sm:justify-end">
          <button
            type="button"
            onClick={handleDismiss}
            className="rounded-full px-5 py-2.5 text-sm font-semibold text-stone-600 transition hover:bg-stone-100"
          >
            {isZh ? "暂时不要" : "Not now"}
          </button>
          <button
            type="button"
            onClick={() => void handleSubscribe()}
            disabled={saving}
            className="rounded-full bg-[#87362E] px-5 py-2.5 text-sm font-bold text-white shadow-sm transition hover:bg-[#6f2c26] disabled:cursor-not-allowed disabled:opacity-60"
          >
            {saving
              ? isZh
                ? "正在开启…"
                : "Enabling…"
              : isZh
                ? "开启订阅并领取礼包"
                : "Subscribe & claim gift"}
          </button>
        </div>
      </section>
    </div>
  );
}
