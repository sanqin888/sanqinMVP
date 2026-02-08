export const DEFAULT_CLOVER_SDK_URL = "https://checkout.clover.com/sdk.js";

export function loadScript(src: string): Promise<void> {
  return new Promise((resolve, reject) => {
    const existing = document.querySelector(`script[src="${src}"]`);
    if (existing) {
      resolve();
      return;
    }
    const script = document.createElement("script");
    script.src = src;
    script.async = true;
    script.onload = () => resolve();
    script.onerror = () =>
      reject(new Error(`Failed to load Clover SDK script: ${src}`));
    document.head.appendChild(script);
  });
}

type BrowserInfo = {
  browserAcceptHeader: string;
  browserJavascriptEnabled: boolean;
  browserScreenWidth: string;
  browserScreenHeight: string;
  browserUserAgent: string;
  browserColorDepth: string;
  browserLanguage: string;
  browserJavaEnabled: boolean;
  browserTZ: string;
  browserOrigin: string;
};

export function build3dsBrowserInfo(): BrowserInfo {
  const nav =
    typeof window !== "undefined" ? window.navigator : (undefined as Navigator | undefined);
  const scr = typeof window !== "undefined" ? window.screen : undefined;
  const safeNumber = (value: number | undefined | null, fallback: number) =>
    Number.isFinite(value) ? (value as number) : fallback;
  const safeString = (value: unknown, fallback: string) =>
    typeof value === "string" && value.trim().length > 0 ? value : fallback;
  const timezoneOffset = (() => {
    try {
      return Math.abs(new Date().getTimezoneOffset());
    } catch {
      return 0;
    }
  })();
  return {
    browserAcceptHeader: "*/*",
    browserJavascriptEnabled: true,
    browserScreenWidth: String(safeNumber(scr?.width, 0)),
    browserScreenHeight: String(safeNumber(scr?.height, 0)),
    browserUserAgent: safeString(nav?.userAgent, "unknown"),
    browserColorDepth: String(safeNumber(scr?.colorDepth, 24)),
    browserLanguage: safeString(
      nav?.language || nav?.languages?.[0],
      "en",
    ),
    browserJavaEnabled: !!(nav as unknown as { javaEnabled?: () => boolean })
      ?.javaEnabled?.(),
    browserTZ: String(timezoneOffset),
    browserOrigin:
      typeof window !== "undefined"
        ? safeString(window.location?.origin, "unknown")
        : "unknown",
  };
}

export function normalizeCanadianPostalCode(value: string): string {
  const cleaned = value.toUpperCase().replace(/[^A-Z0-9]/g, "");
  if (cleaned.length <= 3) return cleaned;
  if (cleaned.length >= 6) {
    return `${cleaned.slice(0, 3)} ${cleaned.slice(3, 6)}`;
  }
  return `${cleaned.slice(0, 3)} ${cleaned.slice(3)}`;
}

export function isValidCanadianPostalCode(value: string): boolean {
  return /^[A-Z]\d[A-Z] ?\d[A-Z]\d$/.test(value.trim().toUpperCase());
}
