//Users/apple/sanqinMVP/apps/web/src/middleware.ts
import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { resolveLocalePreference } from "./lib/i18n/detect-locale";

const SESSION_COOKIE_NAME = "session_id";
const POS_DEVICE_ID_COOKIE = "posDeviceId";
const POS_DEVICE_KEY_COOKIE = "posDeviceKey";

type Locale = "zh" | "en";

const SEO_BOT_UA_RE =
  /(googlebot|bingbot|yandexbot|baiduspider|duckduckbot|slurp|facebookexternalhit|twitterbot|linkedinbot)/i;

function startsWithLocale(pathname: string): pathname is `/${Locale}${string}` {
  return /^\/(zh|en)(\/|$)/.test(pathname);
}

function isSeoCrawler(userAgent: string | null): boolean {
  if (!userAgent) return false;
  return SEO_BOT_UA_RE.test(userAgent);
}

function ensureCookie(res: NextResponse, locale: Locale) {
  res.cookies.set("locale", locale, {
    path: "/",
    maxAge: 60 * 60 * 24 * 365,
  });
}

function ensureLocaleCookieIfNeeded(
  req: NextRequest,
  res: NextResponse,
  locale: Locale,
) {
  const currentLocale = req.cookies.get("locale")?.value;
  if (currentLocale === locale) {
    return;
  }
  ensureCookie(res, locale);
}

function redirectToStaffLogin(
  req: NextRequest,
  locale: Locale,
  options?: { needDevice?: boolean },
) {
  const url = req.nextUrl.clone();
  const next = `${req.nextUrl.pathname}${req.nextUrl.search}`;
  url.pathname = `/${locale}/staff/login`;
  url.search = "";
  url.searchParams.set("next", next);
  if (options?.needDevice) {
    url.searchParams.set("needDevice", "1");
  }
  const res = NextResponse.redirect(url);
  ensureLocaleCookieIfNeeded(req, res, locale);
  return res;
}

export async function middleware(req: NextRequest) {
  const { pathname, search } = req.nextUrl;
  if (
    pathname.startsWith("/_next") ||
    pathname.startsWith("/api") ||
    pathname.startsWith("/clover/oauth/") ||
    pathname.startsWith("/favicon") ||
    pathname.startsWith("/assets") ||
    pathname.match(/\.(?:css|js|png|jpg|jpeg|gif|svg|ico|webp|avif|woff2?)$/)
  ) {
    return NextResponse.next();
  }

  if (startsWithLocale(pathname)) {
    const locale = (pathname.split("/")[1] as Locale) || "en";

    if (pathname.startsWith(`/${locale}/staff/login`)) {
      const res = NextResponse.next();
      ensureLocaleCookieIfNeeded(req, res, locale);
      return res;
    }

    if (pathname.startsWith(`/${locale}/store/pos`)) {
      if (pathname.startsWith(`/${locale}/store/pos/login`)) {
        const res = NextResponse.next();
        ensureLocaleCookieIfNeeded(req, res, locale);
        return res;
      }

      const sessionId = req.cookies.get(SESSION_COOKIE_NAME)?.value;
      if (!sessionId) {
        return redirectToStaffLogin(req, locale);
      }

      const did = req.cookies.get(POS_DEVICE_ID_COOKIE)?.value;
      const dkey = req.cookies.get(POS_DEVICE_KEY_COOKIE)?.value;
      if (!did || !dkey) {
        return redirectToStaffLogin(req, locale, { needDevice: true });
      }
    }

    if (pathname.startsWith(`/${locale}/accounting`)) {
      if (pathname.startsWith(`/${locale}/accounting/login`)) {
        const res = NextResponse.next();
        ensureLocaleCookieIfNeeded(req, res, locale);
        return res;
      }

      const sessionId = req.cookies.get(SESSION_COOKIE_NAME)?.value;
      if (!sessionId) {
        return redirectToStaffLogin(req, locale);
      }
    }

    if (pathname.startsWith(`/${locale}/admin`)) {
      if (
        pathname.startsWith(`/${locale}/admin/login`) ||
        pathname.startsWith(`/${locale}/admin/accept-invite`)
      ) {
        const res = NextResponse.next();
        ensureLocaleCookieIfNeeded(req, res, locale);
        return res;
      }

      const sessionId = req.cookies.get(SESSION_COOKIE_NAME)?.value;
      if (!sessionId) {
        return redirectToStaffLogin(req, locale);
      }
    }

    const res = NextResponse.next();
    ensureLocaleCookieIfNeeded(req, res, locale);
    return res;
  }

  const hasSession = Boolean(req.cookies.get(SESSION_COOKIE_NAME)?.value);
  const memberLocale = hasSession
    ? (req.cookies.get("member_locale")?.value as Locale) || null
    : null;
  const preferredLocale =
    (req.cookies.get("preferred_locale")?.value as Locale) || null;
  const seoBot = isSeoCrawler(req.headers.get("user-agent"));
  const locale: Locale = seoBot
    ? "en"
    : resolveLocalePreference({
        manualLocale: preferredLocale,
        memberLocale,
        acceptLanguage: req.headers.get("accept-language"),
      });

  const url = req.nextUrl.clone();
  url.pathname = `/${locale}${pathname}`;
  url.search = search;

  const res = NextResponse.redirect(url, { status: 308 });
  ensureCookie(res, locale);
  return res;
}

export const config = {
  matcher: [
    "/((?!_next|.*\\..*).*)",
  ],
};
