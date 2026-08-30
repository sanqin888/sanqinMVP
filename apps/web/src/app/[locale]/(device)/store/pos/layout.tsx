// apps/web/src/app/[locale]/(device)/store/pos/layout.tsx
import { redirect } from "next/navigation";
import { cookies } from "next/headers";
import type { ReactNode } from "react";
import type { Locale } from "@/lib/i18n/locales";
import { serverApiFetch } from "@/server/api";
import { PosDeviceFrame } from "@/components/store/PosDeviceFrame";
import { PosSessionKeepAlive } from "./PosSessionKeepAlive";

const SESSION_COOKIE_NAME = "session_id";

type StaffSessionResponse = {
  userStableId?: string;
  email?: string;
  role?: string;
};

async function fetchStaffSession(): Promise<StaffSessionResponse | null> {
  try {
    return await serverApiFetch<StaffSessionResponse>("/auth/me", {
      forwardCookies: true,
    });
  } catch {
    return null;
  }
}

export default async function PosLayout({
  children,
  params,
}: {
  children: ReactNode;
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  const safeLocale: Locale = locale === "zh" || locale === "en" ? locale : "en";

  const cookieStore = await cookies();
  const sessionId = cookieStore.get(SESSION_COOKIE_NAME)?.value;
  if (!sessionId) {
    return children;
  }

  const session = await fetchStaffSession();
  const role = session?.role;

  if (role !== "ADMIN" && role !== "STAFF") {
    redirect(`/${safeLocale}/store/pos/login`);
  }

  return (
    <>
      <PosSessionKeepAlive />
      <PosDeviceFrame locale={safeLocale}>{children}</PosDeviceFrame>
    </>
  );
}
