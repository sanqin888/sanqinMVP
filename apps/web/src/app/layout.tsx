//Users/apple/sanqinMVP/apps/web/src/app

import type { Metadata } from "next";
import { cookies, headers } from "next/headers";
import "./globals.css";
import type { Locale } from "@/lib/i18n/locales";

export const metadata: Metadata = {
  title: "San Qin Noodle House",
  description:
    "San Qin Noodle House online ordering experience with Clover checkout integration.",
};

// 服务器端检测语言：优先 Cookie('locale')，否则看 Accept-Language
async function detectLang(): Promise<Locale> {
  const cookieStore = await cookies();
  const c = cookieStore.get("locale")?.value;
  if (c === "zh" || c === "en") return c;

  const hdrs = await headers();
  const accept = hdrs.get("accept-language") || "";
  return /(?:^|[,\s])zh(?:-|;|,|\s|$)/i.test(accept) ? "zh" : "en";
}

export default async function RootLayout({ children }: { children: React.ReactNode }) {
  const serverLocale = await detectLang();
  const htmlLang = serverLocale === "zh" ? "zh-Hans" : "en";

  return (
    <html lang={htmlLang} suppressHydrationWarning>
      <body className="antialiased">{children}</body>
    </html>
  );
}
