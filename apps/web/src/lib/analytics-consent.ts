export type AnalyticsConsentStatus = "accepted" | "rejected" | "unset";

const ANALYTICS_CONSENT_KEY = "sanqin_analytics_consent_v1";
const CONSENT_EVENT_NAME = "sanqin:analytics-consent-changed";

function readRawConsent(): string | null {
  if (typeof window === "undefined") return null;
  return window.localStorage.getItem(ANALYTICS_CONSENT_KEY);
}

export function getAnalyticsConsentStatus(): AnalyticsConsentStatus {
  const value = readRawConsent();
  if (value === "accepted" || value === "rejected") return value;
  return "unset";
}

export function hasAnalyticsConsent(): boolean {
  return getAnalyticsConsentStatus() === "accepted";
}

export function setAnalyticsConsent(status: Exclude<AnalyticsConsentStatus, "unset">) {
  if (typeof window === "undefined") return;
  window.localStorage.setItem(ANALYTICS_CONSENT_KEY, status);
  window.dispatchEvent(new CustomEvent(CONSENT_EVENT_NAME, { detail: status }));
}

export function onAnalyticsConsentChange(callback: (status: AnalyticsConsentStatus) => void) {
  if (typeof window === "undefined") return () => {};

  const handleChange = () => {
    callback(getAnalyticsConsentStatus());
  };

  const handleCustomEvent = (event: Event) => {
    const detail = event instanceof CustomEvent ? event.detail : undefined;
    if (detail === "accepted" || detail === "rejected") {
      callback(detail);
      return;
    }
    handleChange();
  };

  window.addEventListener("storage", handleChange);
  window.addEventListener(CONSENT_EVENT_NAME, handleCustomEvent);

  return () => {
    window.removeEventListener("storage", handleChange);
    window.removeEventListener(CONSENT_EVENT_NAME, handleCustomEvent);
  };
}
