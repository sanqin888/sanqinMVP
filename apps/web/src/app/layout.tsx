// apps/web/src/app/layout.tsx
import type { Metadata } from "next";
import { cookies, headers } from "next/headers";
import "./globals.css";
import type { Locale } from "@/lib/i18n/locales";
import { AuthProvider } from "./providers";

export const metadata: Metadata = {
  title: "SanQ Rougamo",
  description:
    "SanQ Rougamo online ordering experience with Clover checkout integration.",
  manifest: "/manifest.webmanifest",
  icons: {
    apple: [
      {
        url: "/images/icon-180.png",
        sizes: "180x180",
        type: "image/png",
      },
    ],
  },
  appleWebApp: {
    title: "SanQ Rougamo",
    statusBarStyle: "default",
    capable: true,
  },
  formatDetection: {
    telephone: false,
  },
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
      </body>
    </html>
  );
}
