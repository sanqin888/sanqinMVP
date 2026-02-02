// apps/web/src/app/layout.tsx
import type { Metadata } from "next";
import { cookies, headers } from "next/headers";
import Script from "next/script";
import "./globals.css";
import type { Locale } from "@/lib/i18n/locales";
import { AuthProvider } from "./providers";

export const metadata: Metadata = {
  title: "SanQ Rougamo",
  description:
    "SanQ Rougamo online ordering experience with Clover checkout integration.",
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

export default async function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const serverLocale = await detectLang();
  const htmlLang = serverLocale === "zh" ? "zh-Hans" : "en";

  return (
    <html lang={htmlLang} suppressHydrationWarning>
      <body className="antialiased">
        {/* ✅ 在这里包一层 AuthProvider，里面才可以安全 useSession() */}
        <AuthProvider>{children}</AuthProvider>
        <Script
          src={`https://maps.googleapis.com/maps/api/js?key=${process.env.NEXT_PUBLIC_GOOGLE_MAPS_KEY}&libraries=places`}
          strategy="lazyOnload"
        />
      </body>
    </html>
  );
}
