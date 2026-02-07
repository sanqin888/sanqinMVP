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
  const nav = window.navigator;
  const scr = window.screen;
  return {
    browserAcceptHeader: "*/*",
    browserJavascriptEnabled: true,
    browserScreenWidth: String(scr.width),
    browserScreenHeight: String(scr.height),
    browserUserAgent: nav.userAgent,
    browserColorDepth: String(scr.colorDepth ?? 24),
    browserLanguage: nav.language || "en",
    browserJavaEnabled: !!(nav as unknown as { javaEnabled?: () => boolean })
      .javaEnabled?.(),
    browserTZ: String(Math.abs(new Date().getTimezoneOffset())),
    browserOrigin: window.location.origin,
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
