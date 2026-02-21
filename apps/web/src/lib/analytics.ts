import { hasAnalyticsConsent } from "@/lib/analytics-consent";

type AnalyticsPayload = Record<string, string | number | boolean | null | undefined>;

type AnalyticsEvent = {
  event: string;
  payload: AnalyticsPayload;
  ts: number;
};

const ANALYTICS_INGEST_ENDPOINT = "/api/v1/analytics/events";

declare global {
  interface Window {
    dataLayer?: Array<Record<string, unknown>>;
  }
}

function sendEventToServer(event: AnalyticsEvent): void {
  if (typeof window === "undefined") return;

  const body = JSON.stringify({
    events: [event],
    locale: event.payload.locale,
    path: window.location.pathname,
  });

  if (typeof navigator !== "undefined" && typeof navigator.sendBeacon === "function") {
    const blob = new Blob([body], { type: "application/json" });
    navigator.sendBeacon(ANALYTICS_INGEST_ENDPOINT, blob);
    return;
  }

  void fetch(ANALYTICS_INGEST_ENDPOINT, {
    method: "POST",
    credentials: "include",
    headers: {
      "content-type": "application/json",
    },
    keepalive: true,
    body,
  }).catch(() => {
    // 埋点不影响主流程
  });
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

  sendEventToServer({
    event,
    payload,
    ts: data.ts,
  });
}
