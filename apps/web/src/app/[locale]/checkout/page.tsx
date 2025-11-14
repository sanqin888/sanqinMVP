"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { usePathname, useRouter, useSearchParams, useParams } from "next/navigation";
import { apiFetch } from "@/lib/api-client";
import { usePersistentCart } from "@/lib/cart";
import {
  ConfirmationState,
  HOSTED_CHECKOUT_CURRENCY,
  LANGUAGE_NAMES,
  LOCALES,
  type Locale,
  type LocalizedCartItem,
  type ScheduleSlot,
  TAX_ON_DELIVERY,
  TAX_RATE,
  UI_STRINGS,
  addLocaleToPath,
  formatWithOrder,
  formatWithTotal,
  localizeMenuItem,
  MENU_ITEM_LOOKUP,
  type HostedCheckoutResponse,
} from "@/lib/order/shared";

export default function CheckoutPage() {
  const pathname = usePathname() || "/";
  const params = useParams<{ locale?: string }>();
  const locale = (params?.locale === "zh" ? "zh" : "en") as Locale;

  const router = useRouter();
  const searchParams = useSearchParams();
  const q = searchParams?.toString();

  const strings = UI_STRINGS[locale];
  const orderHref = q ? `/${locale}?${q}` : `/${locale}`;

  const { items, updateNotes, updateQuantity } = usePersistentCart();

  const localizedCartItems = useMemo<LocalizedCartItem[]>(() => {
    return items
      .map((entry) => {
        const definition = MENU_ITEM_LOOKUP.get(entry.itemId);
        if (!definition) return null;
        return { ...entry, item: localizeMenuItem(definition, locale) };
      })
      .filter((item): item is LocalizedCartItem => Boolean(item));
  }, [items, locale]);

  const [fulfillment, setFulfillment] = useState<"pickup" | "delivery">("pickup");
  const [schedule, setSchedule] = useState<ScheduleSlot>("asap");
  const [customer, setCustomer] = useState({
    name: "",
    phone: "",
    address: "",
    notes: "",
  });
  const [confirmation, setConfirmation] = useState<ConfirmationState | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const currencyFormatter = useMemo(
    () =>
      new Intl.NumberFormat(locale === "zh" ? "zh-Hans-CA" : "en-CA", {
        style: "currency",
        currency: HOSTED_CHECKOUT_CURRENCY,
        minimumFractionDigits: 2,
        maximumFractionDigits: 2,
      }),
    [locale],
  );

  const formatMoney = (x: number) => currencyFormatter.format(x).replace(/^CA\$\s?/, "$");

  const subtotal = useMemo(
    () => localizedCartItems.reduce((total, cartItem) => total + cartItem.item.price * cartItem.quantity, 0),
    [localizedCartItems],
  );

  const serviceFee: number = 0;
  const deliveryFee = fulfillment === "delivery" && subtotal > 0 ? 6 : 0;
  const taxableBase = subtotal + (TAX_ON_DELIVERY ? deliveryFee : 0);
  const tax = Math.round(taxableBase * TAX_RATE * 100) / 100;
  const total = subtotal + deliveryFee + tax;

  const canPlaceOrder =
    localizedCartItems.length > 0 &&
    customer.name.trim().length > 0 &&
    customer.phone.trim().length >= 6 &&
    (fulfillment === "pickup" || customer.address.trim().length > 5);

  const scheduleLabel = strings.scheduleOptions.find((option) => option.id === schedule)?.label ?? "";

  const handleCustomerChange = (field: "name" | "phone" | "address" | "notes", value: string) => {
    setCustomer((prev) => ({ ...prev, [field]: value }));
  };

  const handlePlaceOrder = async () => {
    if (!canPlaceOrder || isSubmitting) return;

    setErrorMessage(null);
    setConfirmation(null);

    const orderNumber = `SQ${Date.now().toString().slice(-6)}`;
    const totalCents = Math.round(total * 100);

    try {
      setIsSubmitting(true);

      const payload = {
        locale,
        amountCents: totalCents,
        currency: HOSTED_CHECKOUT_CURRENCY,
        referenceId: orderNumber,
        description: `San Qin online order ${orderNumber}`,
        returnUrl:
          typeof window !== "undefined"
            ? `${window.location.origin}/${locale}/thank-you/${orderNumber}`
            : undefined,
        metadata: {
          fulfillment,
          schedule,
          customer,
          subtotal,
          tax,
          taxRate: TAX_RATE,
          serviceFee,
          deliveryFee,
          items: localizedCartItems.map((cartItem) => ({
            id: cartItem.itemId,
            name: cartItem.item.name,
            quantity: cartItem.quantity,
            notes: cartItem.notes,
            price: cartItem.item.price,
          })),
        },
      };

      const { checkoutUrl } = await apiFetch<HostedCheckoutResponse>("/clover/pay/online/hosted-checkout", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });

      if (!checkoutUrl) {
        throw new Error(strings.errors.missingCheckoutUrl);
      }

      if (typeof window !== "undefined") {
        window.location.href = checkoutUrl;
      } else {
        setConfirmation({ orderNumber, total, fulfillment });
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : strings.errors.checkoutFailed;
      setErrorMessage(message);
      setConfirmation({ orderNumber, total, fulfillment });
    } finally {
      setIsSubmitting(false);
    }
  };

  const payButtonLabel = isSubmitting ? strings.processing : formatWithTotal(strings.payCta, currencyFormatter.format(total));

  return (
    <div className="space-y-10 pb-24">
      <section className="rounded-3xl bg-white p-6 shadow-sm">
        <div className="flex flex-col gap-6 md:flex-row md:items-center md:justify-between">
          <div>
            <h1 className="text-2xl font-semibold text-slate-900">{strings.cartTitle}</h1>
            <p className="mt-2 max-w-xl text-sm text-slate-600">{strings.paymentHint}</p>
          </div>
          <div className="flex flex-col items-start gap-3 md:items-end">
            <div className="flex items-center gap-2 text-xs text-slate-500">
              <span className="font-medium">{strings.languageSwitch}</span>
              <div className="inline-flex gap-1 rounded-full bg-slate-200 p-1">
                {LOCALES.map((code) => (
                  <button
                    key={code}
                    type="button"
                    onClick={() => {
                      try {
                        document.cookie = `locale=${code}; path=/; max-age=${60 * 60 * 24 * 365}`;
                        localStorage.setItem("preferred-locale", code);
                      } catch {}
                      const nextPath = addLocaleToPath(code, pathname || "/");
                      router.push(q ? `${nextPath}?${q}` : nextPath);
                    }}
                    className={`rounded-full px-3 py-1 text-xs font-medium transition ${
                      locale === code ? "bg-white text-slate-900 shadow" : "text-slate-600 hover:bg-white/70"
                    }`}
                    aria-pressed={locale === code}
                  >
                    {LANGUAGE_NAMES[code]}
                  </button>
                ))}
              </div>
            </div>
            <Link
              href={orderHref}
              className="inline-flex items-center gap-2 rounded-full border border-slate-200 px-4 py-2 text-xs font-semibold text-slate-600 transition hover:border-slate-300 hover:bg-slate-50"
            >
              {locale === "zh" ? "返回菜单" : "Back to menu"}
            </Link>
          </div>
        </div>
      </section>

      <section className="rounded-3xl border border-slate-200 bg-white p-6 shadow-lg">
        {localizedCartItems.length === 0 ? (
          <div className="space-y-4 text-center text-sm text-slate-500">
            <p>{strings.cartEmpty}</p>
            <div>
              <Link
                href={orderHref}
                className="inline-flex items-center gap-2 rounded-full bg-slate-900 px-4 py-2 text-sm font-semibold text-white transition hover:bg-slate-700"
              >
                {locale === "zh" ? "去点餐" : "Browse dishes"}
              </Link>
            </div>
          </div>
        ) : (
          <div className="space-y-6">
            <ul className="space-y-4">
              {localizedCartItems.map((cartItem) => (
                <li key={cartItem.itemId} className="rounded-2xl border border-slate-200 p-4">
                  <div className="flex items-start justify-between gap-4">
                    <div>
                      <p className="text-sm font-semibold text-slate-900">{cartItem.item.name}</p>
                      <p className="mt-1 text-xs text-slate-500">
                        {currencyFormatter.format(cartItem.item.price)} × {cartItem.quantity}
                      </p>
                    </div>
                    <div className="flex items-center gap-2">
                      <button
                        type="button"
                        onClick={() => updateQuantity(cartItem.itemId, -1)}
                        className="grid h-8 w-8 place-items-center rounded-full border border-slate-200 text-lg font-semibold text-slate-600 transition hover:bg-slate-100"
                        aria-label={strings.quantity.decrease}
                      >
                        −
                      </button>
                      <span className="min-w-[1.5rem] text-center text-sm font-medium">{cartItem.quantity}</span>
                      <button
                        type="button"
                        onClick={() => updateQuantity(cartItem.itemId, 1)}
                        className="grid h-8 w-8 place-items-center rounded-full border border-slate-200 text-lg font-semibold text-slate-600 transition hover:bg-slate-100"
                        aria-label={strings.quantity.increase}
                      >
                        +
                      </button>
                    </div>
                  </div>
                  <label className="mt-3 block text-xs font-medium text-slate-500">
                    {strings.cartNotesLabel}
                    <textarea
                      value={cartItem.notes}
                      onChange={(event) => updateNotes(cartItem.itemId, event.target.value)}
                      placeholder={strings.cartNotesPlaceholder}
                      className="mt-1 w-full rounded-2xl border border-slate-200 bg-slate-50 p-2 text-sm text-slate-700 focus:border-slate-400 focus:outline-none"
                      rows={2}
                    />
                  </label>
                </li>
              ))}
            </ul>

            <div className="space-y-4">
              <div>
                <h3 className="text-xs font-semibold uppercase tracking-[0.3em] text-slate-500">
                  {strings.fulfillmentLabel}
                </h3>
                <div className="mt-3 grid grid-cols-2 gap-3 text-sm font-medium">
                  <button
                    type="button"
                    onClick={() => setFulfillment("pickup")}
                    className={`rounded-2xl border px-3 py-2 ${
                      fulfillment === "pickup"
                        ? "border-slate-900 bg-slate-900 text-white"
                        : "border-slate-200 bg-slate-50 text-slate-600"
                    }`}
                  >
                    {strings.fulfillment.pickup}
                  </button>
                  <button
                    type="button"
                    onClick={() => setFulfillment("delivery")}
                    className={`rounded-2xl border px-3 py-2 ${
                      fulfillment === "delivery"
                        ? "border-slate-900 bg-slate-900 text-white"
                        : "border-slate-200 bg-slate-50 text-slate-600"
                    }`}
                  >
                    {strings.fulfillment.delivery}
                  </button>
                </div>
              </div>

              <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4 text-sm text-slate-600">
                <div className="flex items-center justify-between text-xs">
                  <span>{strings.summary.subtotal}</span>
                  <span>{currencyFormatter.format(subtotal)}</span>
                </div>
                {serviceFee > 0 ? (
                  <div className="mt-2 flex items-center justify-between text-xs">
                    <span>{strings.summary.serviceFee}</span>
                    <span>{currencyFormatter.format(serviceFee)}</span>
                  </div>
                ) : null}
                <div className="mt-2 flex items-center justify-between text-xs">
                  <span>{strings.summary.tax}</span>
                  <span>{formatMoney(tax)}</span>
                </div>
                {fulfillment === "delivery" ? (
                  <div className="mt-2 flex items-center justify-between text-xs">
                    <span>{strings.summary.deliveryFee}</span>
                    <span>{currencyFormatter.format(deliveryFee)}</span>
                  </div>
                ) : null}
                <div className="mt-3 border-t border-slate-200 pt-3 text-sm font-semibold text-slate-900">
                  <div className="flex items-center justify-between">
                    <span>{strings.summary.total}</span>
                    <span>{currencyFormatter.format(total)}</span>
                  </div>
                </div>
              </div>

              {fulfillment === "delivery" ? (
                <div className="space-y-3">
                  <label className="block text-xs font-semibold uppercase tracking-[0.3em] text-slate-500">
                    {strings.scheduleLabel}
                    <select
                      value={schedule}
                      onChange={(event) => setSchedule(event.target.value as ScheduleSlot)}
                      className="mt-2 w-full rounded-2xl border border-slate-200 bg-white p-2 text-sm text-slate-700 focus:border-slate-400 focus:outline-none"
                    >
                      {strings.scheduleOptions.map((option) => (
                        <option key={option.id} value={option.id}>
                          {option.label}
                        </option>
                      ))}
                    </select>
                  </label>
                </div>
              ) : (
                <p className="rounded-2xl bg-slate-100 p-3 text-xs text-slate-600">
                  {strings.fulfillment.pickupNote}
                </p>
              )}

              <div className="space-y-3">
                <h3 className="text-xs font-semibold uppercase tracking-[0.3em] text-slate-500">
                  {strings.contactInfoLabel}
                </h3>
                <label className="block text-xs font-medium text-slate-600">
                  {strings.contactFields.name}
                  <input
                    value={customer.name}
                    onChange={(event) => handleCustomerChange("name", event.target.value)}
                    placeholder={strings.contactFields.namePlaceholder}
                    className="mt-1 w-full rounded-2xl border border-slate-200 bg-white p-2 text-sm text-slate-700 focus:border-slate-400 focus:outline-none"
                  />
                </label>
                <label className="block text-xs font-medium text-slate-600">
                  {strings.contactFields.phone}
                  <input
                    value={customer.phone}
                    onChange={(event) => handleCustomerChange("phone", event.target.value)}
                    placeholder={strings.contactFields.phonePlaceholder}
                    className="mt-1 w-full rounded-2xl border border-slate-200 bg-white p-2 text-sm text-slate-700 focus:border-slate-400 focus:outline-none"
                  />
                </label>
                {fulfillment === "delivery" ? (
                  <label className="block text-xs font-medium text-slate-600">
                    {strings.contactFields.address}
                    <textarea
                      value={customer.address}
                      onChange={(event) => handleCustomerChange("address", event.target.value)}
                      placeholder={strings.contactFields.addressPlaceholder}
                      className="mt-1 w-full rounded-2xl border border-slate-200 bg-white p-2 text-sm text-slate-700 focus:border-slate-400 focus:outline-none"
                      rows={2}
                    />
                  </label>
                ) : null}
                <label className="block text-xs font-medium text-slate-600">
                  {strings.contactFields.notes}
                  <textarea
                    value={customer.notes}
                    onChange={(event) => handleCustomerChange("notes", event.target.value)}
                    placeholder={strings.contactFields.notesPlaceholder}
                    className="mt-1 w-full rounded-2xl border border-slate-200 bg-white p-2 text-sm text-slate-700 focus:border-slate-400 focus:outline-none"
                    rows={2}
                  />
                </label>
              </div>

              <div className="space-y-2">
                <p className="text-xs text-slate-500">{strings.paymentHint}</p>
                {errorMessage ? (
                  <div className="rounded-2xl border border-red-200 bg-red-50 p-3 text-xs text-red-600">{errorMessage}</div>
                ) : null}
              </div>

              <button
                type="button"
                onClick={handlePlaceOrder}
                disabled={!canPlaceOrder || isSubmitting}
                className="w-full rounded-full bg-emerald-600 px-5 py-3 text-sm font-semibold text-white transition enabled:hover:bg-emerald-500 disabled:cursor-not-allowed disabled:bg-emerald-200"
              >
                {payButtonLabel}
              </button>
            </div>

            {confirmation ? (
              <div className="rounded-3xl border border-emerald-200 bg-emerald-50 p-4 text-sm text-emerald-700">
                <p className="font-semibold">{strings.confirmation.title}</p>
                <p className="mt-1">
                  {formatWithOrder(
                    confirmation.fulfillment === "delivery" ? strings.confirmation.delivery : strings.confirmation.pickup,
                    confirmation.orderNumber,
                    currencyFormatter.format(confirmation.total),
                    scheduleLabel,
                  )}
                </p>
                <p className="mt-1 text-xs text-emerald-600">
                  {formatWithOrder(
                    confirmation.fulfillment === "delivery"
                      ? strings.confirmation.deliveryMeta
                      : strings.confirmation.pickupMeta,
                    confirmation.orderNumber,
                    currencyFormatter.format(confirmation.total),
                    scheduleLabel,
                  )}
                </p>
              </div>
            ) : null}
          </div>
        )}
      </section>
    </div>
  );
}
