// apps/web/src/components/store/PosDeviceFrame.tsx

"use client";

import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { usePathname } from "next/navigation";
import type { Locale } from "@/lib/i18n/locales";
import LocaleSwitcher from "@/components/LocaleSwitcher";
import { ScheduledOrdersRail } from "@/components/store/ScheduledOrdersRail";

function PosToolbarLocalePortal({ locale }: { locale: Locale }) {
  const [target, setTarget] = useState<HTMLDivElement | null>(null);

  useEffect(() => {
    const orderingMain = document.querySelector("[data-pos-ordering-main]");
    const actions = orderingMain?.querySelector("main > header > div:last-child");
    if (!(actions instanceof HTMLElement)) return;

    const mount = document.createElement("div");
    mount.setAttribute("data-pos-locale-switcher", "");
    mount.className = "shrink-0";
    actions.prepend(mount);
    setTarget(mount);

    return () => {
      setTarget(null);
      mount.remove();
    };
  }, []);

  if (!target) return null;
  return createPortal(
    <LocaleSwitcher locale={locale} variant="device" />,
    target,
  );
}

export function PosDeviceFrame({
  children,
  locale,
}: {
  children: React.ReactNode;
  locale: Locale;
}) {
  const pathname = usePathname();
  const normalizedPath = pathname?.replace(/\/$/, "") ?? "";
  const isOrderingPage = normalizedPath === `/${locale}/store/pos`;

  if (!isOrderingPage) return <>{children}</>;

  return (
    <div className="grid h-dvh w-screen grid-cols-[clamp(208px,16vw,224px)_minmax(0,1fr)] overflow-hidden bg-slate-950 text-slate-50">
      <ScheduledOrdersRail locale={locale} />
      <div
        data-pos-ordering-main
        className="pos-device-ordering-main min-h-0 min-w-0 overflow-hidden"
      >
        {children}
        <PosToolbarLocalePortal locale={locale} />
      </div>
    </div>
  );
}
