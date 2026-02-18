"use client";

import { useEffect, useState } from "react";
import {
  getAnalyticsConsentStatus,
  onAnalyticsConsentChange,
  setAnalyticsConsent,
  type AnalyticsConsentStatus,
} from "@/lib/analytics-consent";

type Props = {
  locale: "zh" | "en";
};

export default function AnalyticsConsentControls({ locale }: Props) {
  const isZh = locale === "zh";
  const [status, setStatus] = useState<AnalyticsConsentStatus>("unset");
  const [isManageOpen, setIsManageOpen] = useState(false);

  useEffect(() => {
    setStatus(getAnalyticsConsentStatus());
    return onAnalyticsConsentChange((nextStatus) => {
      setStatus(nextStatus);
    });
  }, []);

  const showBanner = status === "unset";

  return (
    <>
      {showBanner ? (
        <div className="fixed inset-x-0 bottom-0 z-50 border-t border-slate-200 bg-white/95 px-4 py-3 backdrop-blur">
          <div className="mx-auto flex w-full max-w-5xl flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <p className="text-xs text-slate-700 sm:text-sm">
              {isZh
                ? "我们使用基础分析埋点（如页面访问、加购、结账点击）来改进点餐体验。您可以选择是否允许分析追踪。"
                : "We use basic analytics events (such as page views, add-to-cart, and checkout clicks) to improve ordering experience. You can choose whether to allow analytics tracking."}
            </p>
            <div className="flex shrink-0 items-center gap-2">
              <button
                type="button"
                onClick={() => setAnalyticsConsent("rejected")}
                className="rounded-full border border-slate-300 px-3 py-1.5 text-xs font-semibold text-slate-700 transition hover:bg-slate-100"
              >
                {isZh ? "拒绝" : "Reject"}
              </button>
              <button
                type="button"
                onClick={() => setAnalyticsConsent("accepted")}
                className="rounded-full bg-slate-900 px-3 py-1.5 text-xs font-semibold text-white transition hover:bg-slate-700"
              >
                {isZh ? "同意" : "Accept"}
              </button>
            </div>
          </div>
        </div>
      ) : null}

      <div className="flex items-center gap-2 text-xs">
        <button
          type="button"
          onClick={() => setIsManageOpen((open) => !open)}
          className="underline underline-offset-2 hover:text-gray-800"
        >
          {isZh ? "隐私偏好" : "Privacy preferences"}
        </button>
        <span className="text-gray-400">
          {isZh
            ? `当前：${status === "accepted" ? "已同意分析" : "已拒绝分析"}`
            : `Current: ${status === "accepted" ? "Analytics allowed" : "Analytics declined"}`}
        </span>
      </div>

      {isManageOpen ? (
        <div className="mt-2 flex flex-wrap items-center gap-2 text-xs">
          <button
            type="button"
            onClick={() => setAnalyticsConsent("accepted")}
            className="rounded-full border border-slate-300 px-3 py-1 transition hover:bg-slate-100"
          >
            {isZh ? "允许分析" : "Allow analytics"}
          </button>
          <button
            type="button"
            onClick={() => setAnalyticsConsent("rejected")}
            className="rounded-full border border-slate-300 px-3 py-1 transition hover:bg-slate-100"
          >
            {isZh ? "关闭分析" : "Disable analytics"}
          </button>
        </div>
      ) : null}
    </>
  );
}
