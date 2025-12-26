//Users/apple/sanqinMVP/apps/web/src/middleware.ts
import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { getToken } from "next-auth/jwt";
import { isAdminEmail } from "@/lib/admin-access";

const LOCALES = ["zh", "en"] as const;
type Locale = (typeof LOCALES)[number];

function pickFromAcceptLanguage(accept: string | null): Locale {
  if (!accept) return "en";
  // 只要优先里出现 zh，即选 zh；否则 en
  return /(?:^|[,\s])zh(?:-|;|,|\s|$)/i.test(accept) ? "zh" : "en";
}

function startsWithLocale(pathname: string): pathname is `/${Locale}${string}` {
  return /^\/(zh|en)(\/|$)/.test(pathname);
}

function ensureCookie(res: NextResponse, locale: Locale) {
  // 记一个 1 年有效的 locale Cookie，Root Layout 用它来设置 <html lang>
  res.cookies.set("locale", locale, {
    path: "/",
    maxAge: 60 * 60 * 24 * 365,
  });
}

export async function middleware(req: NextRequest) {
  const { pathname, search } = req.nextUrl;
  // 跳过静态资源与 API
  if (
    pathname.startsWith("/_next") ||
    pathname.startsWith("/api") ||
    pathname.startsWith("/favicon") ||
    pathname.startsWith("/assets") ||
    pathname.match(/\.(?:css|js|png|jpg|jpeg|gif|svg|ico|webp|avif|woff2?)$/)
  ) {
    return NextResponse.next();
  }

  // 已有前缀：同步 Cookie 并放行
  if (startsWithLocale(pathname)) {
    const locale = (pathname.split("/")[1] as Locale) || "en";
    if (pathname.startsWith(`/${locale}/admin`)) {
      const token = await getToken({
        req: req as Parameters<typeof getToken>[0]["req"],
        secret: process.env.NEXTAUTH_SECRET,
      });
      const email = typeof token?.email === "string" ? token.email : undefined;
      const role = typeof token?.role === "string" ? token.role : undefined;
      const isAdmin = role === "ADMIN" && isAdminEmail(email);
      if (!isAdmin) {
        const url = req.nextUrl.clone();
        url.pathname = `/${locale}`;
        url.search = "";
        const res = NextResponse.redirect(url);
        ensureCookie(res, locale);
        return res;
      }
    }

    const res = NextResponse.next();
    ensureCookie(res, locale);
    return res;
  }

  // 无前缀：决定语言并 308 到 /{locale}{path}
  const cookieLocale = (req.cookies.get("locale")?.value as Locale) || null;
  const acceptLocale = pickFromAcceptLanguage(req.headers.get("accept-language"));
  const locale: Locale = cookieLocale && LOCALES.includes(cookieLocale) ? cookieLocale : acceptLocale;

  const url = req.nextUrl.clone();
  url.pathname = `/${locale}${pathname}`;
  // 保留查询参数
  url.search = search;

  const res = NextResponse.redirect(url, { status: 308 });
  ensureCookie(res, locale);
  return res;
}

export const config = {
  matcher: [
    // 捕获所有页面请求（静态资源等在上面已手动排除）
    "/((?!_next|.*\\..*).*)",
  ],
};
