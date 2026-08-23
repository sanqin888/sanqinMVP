// apps/web/src/components/store/PosDeviceFrame.tsx

"use client";

import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { usePathname } from "next/navigation";
import type { Locale } from "@/lib/i18n/locales";
import { apiFetch } from "@/lib/api/client";
import LocaleSwitcher from "@/components/LocaleSwitcher";
import {
  ScheduledOrdersRail,
  type ScheduledOrderSummary,
  type ScheduledOrdersRailStatus,
} from "@/components/store/ScheduledOrdersRail";

const SCHEDULED_ORDERS_REFRESH_MS = 5_000;

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function isScheduledOrderSummary(value: unknown): value is ScheduledOrderSummary {
  if (!isRecord(value)) return false;
  const channel = value.channel;
  return (
    typeof value.orderStableId === "string" &&
    typeof value.orderNumber === "string" &&
    (channel === "web" || channel === "in_store" || channel === "ubereats") &&
    typeof value.productionStartAt === "string" &&
    typeof value.scheduledFor === "string" &&
    typeof value.itemCount === "number"
  );
}

function parseScheduledOrders(value: unknown): ScheduledOrderSummary[] {
  if (!isRecord(value) || !Array.isArray(value.orders)) {
    throw new Error("Invalid scheduled orders response");
  }
  const orders = value.orders.filter(isScheduledOrderSummary);
  if (orders.length !== value.orders.length) {
    throw new Error("Invalid scheduled order item");
  }
  return orders;
}

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
  const [scheduledOrders, setScheduledOrders] = useState<
    ScheduledOrderSummary[]
  >([]);
  const [scheduledStatus, setScheduledStatus] =
    useState<ScheduledOrdersRailStatus>("loading");

  useEffect(() => {
    if (!isOrderingPage) return;

    let cancelled = false;

    async function loadScheduledOrders() {
      try {
        const payload = await apiFetch<unknown>(
          "/orders/scheduled?poll=pos-scheduled-rail",
        );
        const orders = parseScheduledOrders(payload);
        if (cancelled) return;
        setScheduledOrders(orders);
        setScheduledStatus("ready");
      } catch {
        if (!cancelled) setScheduledStatus("error");
      }
    }

    void loadScheduledOrders();
    const timer = window.setInterval(
      () => void loadScheduledOrders(),
      SCHEDULED_ORDERS_REFRESH_MS,
    );

    return () => {
      cancelled = true;
      window.clearInterval(timer);
    };
  }, [isOrderingPage]);

  if (!isOrderingPage) return <>{children}</>;

  return (
    <div className="grid h-dvh w-screen grid-cols-[clamp(208px,16vw,224px)_minmax(0,1fr)] overflow-hidden bg-slate-950 text-slate-50">
      <ScheduledOrdersRail
        locale={locale}
        orders={scheduledOrders}
        status={scheduledStatus}
      />
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
