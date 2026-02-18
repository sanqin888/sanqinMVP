import { hasAnalyticsConsent } from "@/lib/analytics-consent";

type AnalyticsPayload = Record<string, string | number | boolean | null | undefined>;

declare global {
  interface Window {
    dataLayer?: Array<Record<string, unknown>>;
  }
}

export function trackClientEvent(
  event: string,
  payload: AnalyticsPayload = {},
) {
  if (typeof window === "undefined") return;
  if (!hasAnalyticsConsent()) return;

  const data = {
    event,
    ...payload,
    ts: Date.now(),
  };

  window.dataLayer = window.dataLayer ?? [];
  window.dataLayer.push(data);
}

