// apps/web/src/app/[locale]/(device)/store/display/page.tsx
"use client";

import { useEffect, useMemo, useState } from "react";
import { useParams } from "next/navigation";
import type { Locale } from "@/lib/i18n/locales";
import {
  POS_DISPLAY_CHANNEL,
  POS_DISPLAY_STORAGE_KEY,
  type PosDisplayItem,
  type PosDisplaySnapshot,
} from "@/lib/pos-display";

function formatMoney(cents: number | null | undefined): string {
  const value = (cents ?? 0) / 100;
  return `$${value.toFixed(2)}`;
}

type Density = "relaxed" | "compact" | "two" | "dense" | "emergency";

function densityForItems(items: PosDisplayItem[]): Density {
  const modifierCount = items.reduce(
    (sum, item) => sum + (item.optionLines?.length ?? 0),
    0,
  );
  const weightedLines = items.length + modifierCount * 0.45;

  if (items.length <= 5 && weightedLines <= 7.5) return "relaxed";
  if (items.length <= 8 && weightedLines <= 11) return "compact";
  if (items.length <= 14 && weightedLines <= 19) return "two";
  if (items.length <= 20 && weightedLines <= 29) return "dense";
  return "emergency";
}

function columnsForDensity(density: Density): number {
  switch (density) {
    case "relaxed":
    case "compact":
      return 1;
    case "two":
    case "dense":
      return 2;
    case "emergency":
      return 3;
  }
}

function densityClasses(density: Density) {
  switch (density) {
    case "relaxed":
      return {
        card: "px-5 py-4",
        name: "text-2xl",
        modifier: "mt-2 text-sm",
        price: "mt-3 text-lg",
      };
    case "compact":
      return {
        card: "px-4 py-3",
        name: "text-xl",
        modifier: "mt-1.5 text-xs",
        price: "mt-2 text-base",
      };
    case "two":
      return {
        card: "px-4 py-3",
        name: "text-lg",
        modifier: "mt-1 text-xs",
        price: "mt-2 text-base",
      };
    case "dense":
      return {
        card: "px-3 py-2.5",
        name: "text-base",
        modifier: "mt-1 text-[11px]",
        price: "mt-1.5 text-sm",
      };
    case "emergency":
      return {
        card: "px-2.5 py-2",
        name: "text-sm",
        modifier: "mt-1 text-[10px]",
        price: "mt-1 text-xs",
      };
  }
}

function BilingualText({
  zh,
  en,
  locale,
}: {
  zh: string;
  en: string;
  locale: Locale;
}) {
  const zhText = <span className="text-amber-200">{zh}</span>;
  const enText = <span className="text-cyan-200">{en}</span>;
  const separator = <span className="mx-1.5 text-slate-500">/</span>;

  return locale === "zh" ? (
    <>
      {zhText}
      {separator}
      {enText}
    </>
  ) : (
    <>
      {enText}
      {separator}
      {zhText}
    </>
  );
}

function ItemBilingualName({
  item,
  locale,
}: {
  item: PosDisplayItem;
  locale: Locale;
}) {
  const zh = item.nameZh || item.nameEn;
  const en = item.nameEn || item.nameZh;

  if (!zh || !en || zh === en) {
    return <span className="text-slate-50">{zh || en}</span>;
  }

  return <BilingualText zh={zh} en={en} locale={locale} />;
}

function optionPrimaryLabel(
  option: NonNullable<PosDisplayItem["optionLines"]>[number],
  locale: Locale,
): string {
  if (locale === "zh") return option.labelZh || option.labelEn || option.label;
  return option.labelEn || option.labelZh || option.label;
}

function optionSecondaryLabel(
  option: NonNullable<PosDisplayItem["optionLines"]>[number],
  locale: Locale,
): string | null {
  const value = locale === "zh" ? option.labelEn : option.labelZh;
  const primary = optionPrimaryLabel(option, locale);
  return value && value !== primary ? value : null;
}

function OptionBilingualLabel({
  option,
  locale,
}: {
  option: NonNullable<PosDisplayItem["optionLines"]>[number];
  locale: Locale;
}) {
  const primary = optionPrimaryLabel(option, locale);
  const secondary = optionSecondaryLabel(option, locale);
  const primaryIsZh = locale === "zh";

  if (!secondary) {
    return <span className={primaryIsZh ? "text-amber-200" : "text-cyan-200"}>{primary}</span>;
  }

  return primaryIsZh ? (
    <>
      <span className="text-amber-200">{primary}</span>
      <span className="mx-1 text-slate-500">/</span>
      <span className="text-cyan-200">{secondary}</span>
    </>
  ) : (
    <>
      <span className="text-cyan-200">{primary}</span>
      <span className="mx-1 text-slate-500">/</span>
      <span className="text-amber-200">{secondary}</span>
    </>
  );
}

export default function StoreDisplayPage() {
  const params = useParams<{ locale?: string }>();
  const locale = (params?.locale === "en" ? "en" : "zh") as Locale;
  const isZh = locale === "zh";
  const [snapshot, setSnapshot] = useState<PosDisplaySnapshot | null>(null);

  useEffect(() => {
    const readSnapshot = () => {
      try {
        const raw = window.localStorage.getItem(POS_DISPLAY_STORAGE_KEY);
        if (!raw) {
          setSnapshot(null);
          return;
        }

        const parsed = JSON.parse(raw) as PosDisplaySnapshot;
        if (!parsed || !Array.isArray(parsed.items)) {
          setSnapshot(null);
          return;
        }
        setSnapshot(parsed);
      } catch (error) {
        console.warn("Failed to read POS display snapshot:", error);
        setSnapshot(null);
      }
    };

    readSnapshot();

    const handleStorage = (event: StorageEvent) => {
      if (event.key === POS_DISPLAY_STORAGE_KEY) readSnapshot();
    };
    window.addEventListener("storage", handleStorage);

    let channel: BroadcastChannel | null = null;
    try {
      if ("BroadcastChannel" in window) {
        channel = new BroadcastChannel(POS_DISPLAY_CHANNEL);
        channel.onmessage = (event: MessageEvent) => {
          const data = event.data as
            | { type: "snapshot"; snapshot: PosDisplaySnapshot }
            | { type: "clear" }
            | null;

          if (!data || typeof data !== "object") return;
          if (data.type === "clear") {
            setSnapshot(null);
            return;
          }
          if (data.type === "snapshot" && data.snapshot) {
            setSnapshot(data.snapshot);
          }
        };
      }
    } catch {
      channel = null;
    }

    const pollId = window.setInterval(readSnapshot, 800);

    return () => {
      window.removeEventListener("storage", handleStorage);
      window.clearInterval(pollId);
      try {
        channel?.close();
      } catch {
        // ignore
      }
    };
  }, []);

  const items = snapshot?.items ?? [];
  const density = useMemo(() => densityForItems(items), [items]);
  const columns = columnsForDensity(density);
  const rows = Math.max(1, Math.ceil(items.length / columns));
  const classes = densityClasses(density);

  const itemsSubtotalCents = useMemo(
    () => items.reduce((sum, item) => sum + (item.lineTotalCents ?? 0), 0),
    [items],
  );
  const discountCents = Math.max(0, snapshot?.discountCents ?? 0);
  const taxCents = snapshot?.taxCents ?? 0;
  const totalCents = snapshot?.totalCents ?? 0;
  const otherCreditsCents = Math.max(
    0,
    itemsSubtotalCents - discountCents + taxCents - totalCents,
  );
  const loyalty = snapshot?.loyalty;

  if (items.length === 0) {
    return (
      <main className="h-dvh w-screen overflow-hidden bg-slate-950 text-slate-50">
        <div className="flex h-full flex-col">
          <header className="flex h-16 shrink-0 items-center justify-between border-b border-slate-800 px-6">
            <div className="flex flex-col leading-tight">
              <div className="text-xl font-semibold tracking-wide">
                <BilingualText zh="三秦肉夹馍" en="SanQ Roujiamo" locale={locale} />
              </div>
              <div className="mt-0.5 text-xs font-medium">
                <BilingualText zh="顾客确认屏" en="Customer Display" locale={locale} />
              </div>
            </div>
            <div className="text-sm font-medium">
              <BilingualText zh="实时同步 POS" en="Live from POS" locale={locale} />
            </div>
          </header>
          <div className="flex flex-1 flex-col items-center justify-center px-12 text-center">
            <h1 className="text-5xl font-bold">
              <BilingualText zh="欢迎光临" en="Welcome" locale={locale} />
            </h1>
            <div className="mt-4 max-w-4xl text-2xl font-medium leading-relaxed">
              {isZh ? (
                <>
                  <p className="text-amber-200">
                    点餐过程中，菜品、选项、数量和金额会实时显示在这里，请您核对。
                  </p>
                  <p className="mt-2 text-cyan-200">
                    Your items, options, quantities, and totals will appear here in real time while we take your order. Please review them carefully.
                  </p>
                </>
              ) : (
                <>
                  <p className="text-cyan-200">
                    Your items, options, quantities, and totals will appear here in real time while we take your order. Please review them carefully.
                  </p>
                  <p className="mt-2 text-amber-200">
                    点餐过程中，菜品、选项、数量和金额会实时显示在这里，请您核对。
                  </p>
                </>
              )}
            </div>
          </div>
        </div>
      </main>
    );
  }

  return (
    <main className="h-dvh w-screen overflow-hidden bg-slate-950 text-slate-50">
      <div className="grid h-full grid-rows-[56px_minmax(0,1fr)]">
        <header className="flex items-center justify-between border-b border-slate-800 px-5">
          <h1 className="text-lg font-semibold">
            <BilingualText zh="请确认您的订单" en="Please review your order" locale={locale} />
          </h1>
          <div className="text-xs font-medium">
            <BilingualText
              zh="菜品 · 选项 · 数量 · 金额"
              en="Items · Options · Qty · Total"
              locale={locale}
            />
          </div>
        </header>

        <div className="grid min-h-0 grid-cols-[minmax(0,1fr)_clamp(300px,24vw,340px)] gap-3 p-3">
          <section className="min-h-0 overflow-hidden rounded-2xl border border-slate-800 bg-slate-900/70 p-2">
            <div
              className="grid h-full min-h-0 gap-2"
              style={{
                gridTemplateColumns: `repeat(${columns}, minmax(0, 1fr))`,
                gridTemplateRows: `repeat(${rows}, minmax(0, 1fr))`,
              }}
            >
              {items.map((item) => {
                const optionLines = item.optionLines ?? [];
                return (
                  <article
                    key={item.lineId ?? `${item.stableId}-${item.unitPriceCents}`}
                    className={`flex min-h-0 flex-col justify-between overflow-hidden rounded-xl border border-slate-800 bg-slate-950/70 ${classes.card}`}
                  >
                    <div className="min-h-0">
                      <div className={`${classes.name} font-semibold leading-tight`}>
                        <ItemBilingualName item={item} locale={locale} />
                      </div>

                      {optionLines.length > 0 ? (
                        <div className={`${classes.modifier} flex flex-wrap gap-x-1.5 gap-y-0.5 font-medium leading-tight`}>
                          {optionLines.map((option, index) => (
                            <span key={`${item.lineId ?? item.stableId}-option-${index}`}>
                              {index > 0 ? <span className="mr-1.5 text-slate-600">·</span> : null}
                              <OptionBilingualLabel option={option} locale={locale} />
                              {option.priceCents !== 0 ? (
                                <span className="ml-1 text-slate-300">
                                  {option.priceCents > 0 ? "+" : "-"}
                                  {formatMoney(Math.abs(option.priceCents))}
                                </span>
                              ) : null}
                            </span>
                          ))}
                        </div>
                      ) : null}
                    </div>

                    <div className={`${classes.price} flex items-end justify-between gap-3 border-t border-slate-800 pt-2 tabular-nums`}>
                      <div className="font-medium text-slate-300">
                        {formatMoney(item.unitPriceCents)}
                        <span className="mx-1.5 text-slate-500">×</span>
                        <span className="font-bold text-slate-50">{item.quantity}</span>
                      </div>
                      <div className="font-bold text-slate-50">
                        {formatMoney(item.lineTotalCents)}
                      </div>
                    </div>
                  </article>
                );
              })}
            </div>
          </section>

          <aside className="flex min-h-0 flex-col rounded-2xl border border-slate-800 bg-slate-900 px-5 py-5">
            <div className="text-sm font-semibold uppercase tracking-[0.16em]">
              <BilingualText zh="本单金额" en="Order total" locale={locale} />
            </div>

            <div className="mt-6 space-y-3 text-lg tabular-nums">
              <div className="flex justify-between gap-4">
                <span className="font-medium">
                  <BilingualText zh="小计" en="Subtotal" locale={locale} />
                </span>
                <span>{formatMoney(itemsSubtotalCents)}</span>
              </div>
              {discountCents > 0 ? (
                <div className="flex justify-between gap-4">
                  <span className="font-medium">
                    <BilingualText zh="优惠" en="Discount" locale={locale} />
                  </span>
                  <span className="text-emerald-300">-{formatMoney(discountCents)}</span>
                </div>
              ) : null}
              {otherCreditsCents > 0 ? (
                <div className="flex justify-between gap-4">
                  <span className="font-medium">
                    <BilingualText zh="其他抵扣" en="Credits" locale={locale} />
                  </span>
                  <span className="text-sky-300">-{formatMoney(otherCreditsCents)}</span>
                </div>
              ) : null}
              <div className="flex justify-between gap-4">
                <span className="font-medium">
                  <BilingualText zh="税费" en="Tax" locale={locale} />
                </span>
                <span>{formatMoney(taxCents)}</span>
              </div>
            </div>

            <div className="mt-6 border-t border-slate-700 pt-5">
              <div className="text-base font-semibold">
                <BilingualText zh="合计" en="TOTAL" locale={locale} />
              </div>
              <div className="mt-1 text-right text-5xl font-extrabold tracking-tight tabular-nums text-amber-300">
                {formatMoney(totalCents)}
              </div>
            </div>

            {loyalty ? (
              <div className="mt-auto rounded-xl border border-emerald-900/70 bg-emerald-950/30 px-3 py-3 text-sm">
                {typeof loyalty.pointsRedeemed === "number" && loyalty.pointsRedeemed > 0 ? (
                  <div className="flex justify-between gap-3">
                    <span className="font-medium">
                      <BilingualText zh="使用积分" en="Points used" locale={locale} />
                    </span>
                    <span className="font-semibold tabular-nums text-emerald-200">{loyalty.pointsRedeemed.toFixed(2)}</span>
                  </div>
                ) : null}
                {typeof loyalty.pointsEarned === "number" && loyalty.pointsEarned > 0 ? (
                  <div className="mt-1 flex justify-between gap-3">
                    <span className="font-medium">
                      <BilingualText zh="本单新增积分" en="Points earned" locale={locale} />
                    </span>
                    <span className="font-semibold tabular-nums text-emerald-200">+{loyalty.pointsEarned.toFixed(2)}</span>
                  </div>
                ) : null}
                {typeof loyalty.pointsBalanceAfter === "number" ? (
                  <div className="mt-1 flex justify-between gap-3">
                    <span className="font-medium">
                      <BilingualText zh="结算后积分" en="Balance after" locale={locale} />
                    </span>
                    <span className="tabular-nums text-slate-300">{loyalty.pointsBalanceAfter.toFixed(2)}</span>
                  </div>
                ) : null}
              </div>
            ) : null}
          </aside>
        </div>
      </div>
    </main>
  );
}
