export type AnalyticsConsentStatus = "accepted" | "rejected" | "unset";

const ANALYTICS_CONSENT_KEY = "sanqin_analytics_consent_v1";
const ANALYTICS_CONSENT_BY_USER_KEY = "sanqin_analytics_consent_by_user_v1";
const CONSENT_EVENT_NAME = "sanqin:analytics-consent-changed";

type ConsentByUser = Record<string, Exclude<AnalyticsConsentStatus, "unset">>;

function readRawConsent(): string | null {
  if (typeof window === "undefined") return null;
  return window.localStorage.getItem(ANALYTICS_CONSENT_KEY);
}

function readConsentByUser(): ConsentByUser {
  if (typeof window === "undefined") return {};
  const raw = window.localStorage.getItem(ANALYTICS_CONSENT_BY_USER_KEY);
  if (!raw) return {};

  try {
    const parsed = JSON.parse(raw) as unknown;
    if (!parsed || typeof parsed !== "object") return {};

    return Object.entries(parsed).reduce<ConsentByUser>((acc, [key, value]) => {
      if (value === "accepted" || value === "rejected") {
        acc[key] = value;
      }
      return acc;
    }, {});
  } catch {
    return {};
  }
}

function normalizeSubjectKey(subjectKey?: string): string | null {
  if (!subjectKey) return null;
  const normalized = subjectKey.trim();
  return normalized.length > 0 ? normalized : null;
}

export function getAnalyticsConsentStatus(subjectKey?: string): AnalyticsConsentStatus {
  const normalizedSubjectKey = normalizeSubjectKey(subjectKey);
  if (normalizedSubjectKey) {
    const byUser = readConsentByUser();
    const value = byUser[normalizedSubjectKey];
    if (value === "accepted" || value === "rejected") return value;
  }

  const value = readRawConsent();
  if (value === "accepted" || value === "rejected") return value;
  return "unset";
}

export function hasAnalyticsConsent(subjectKey?: string): boolean {
  return getAnalyticsConsentStatus(subjectKey) === "accepted";
}

export function setAnalyticsConsent(status: Exclude<AnalyticsConsentStatus, "unset">, subjectKey?: string) {
  if (typeof window === "undefined") return;

  window.localStorage.setItem(ANALYTICS_CONSENT_KEY, status);

  const normalizedSubjectKey = normalizeSubjectKey(subjectKey);
  if (normalizedSubjectKey) {
    const byUser = readConsentByUser();
    byUser[normalizedSubjectKey] = status;
    window.localStorage.setItem(ANALYTICS_CONSENT_BY_USER_KEY, JSON.stringify(byUser));
  }

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
