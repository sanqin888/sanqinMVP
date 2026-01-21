// apps/web/src/app/[locale]/thank-you/[order]/InvoiceButton.tsx

"use client";

import { useMemo, useState } from "react";
import { apiFetch } from "@/lib/api/client";
import { useSession } from "@/lib/auth-session";
import type { Locale } from "@/lib/i18n/locales";

type Props = {
  orderStableId: string;
  locale: Locale;
};

const COPY: Record<
  Locale,
  {
    button: string;
    sending: string;
    memberHint: (email: string) => string;
    guestHint: string;
    modalTitle: string;
    emailLabel: string;
    emailPlaceholder: string;
    cancel: string;
    submit: string;
    success: string;
    failed: string;
    invalidEmail: string;
  }
> = {
  en: {
    button: "Send invoice",
    sending: "Sending…",
    memberHint: (email) => `We will send the invoice to ${email}.`,
    guestHint: "Enter your email address to receive the invoice.",
    modalTitle: "Send invoice",
    emailLabel: "Email address",
    emailPlaceholder: "you@example.com",
    cancel: "Cancel",
    submit: "Send",
    success: "Invoice sent. Please check your inbox.",
    failed: "Failed to send invoice. Please try again.",
    invalidEmail: "Please enter a valid email address.",
  },
  zh: {
    button: "发送账单",
    sending: "发送中…",
    memberHint: (email) => `账单将发送到会员邮箱：${email}`,
    guestHint: "请输入邮箱地址以接收账单。",
    modalTitle: "发送账单",
    emailLabel: "邮箱地址",
    emailPlaceholder: "you@example.com",
    cancel: "取消",
    submit: "发送",
    success: "账单已发送，请查收邮箱。",
    failed: "账单发送失败，请稍后重试。",
    invalidEmail: "请输入有效的邮箱地址。",
  },
};

function isValidEmail(value: string) {
  return value.trim().length > 3 && value.includes("@");
}

export function InvoiceButton({ orderStableId, locale }: Props) {
  const { data: session, status } = useSession();
  const memberEmail = session?.user?.email ?? "";
  const isMember = status === "authenticated" && !!memberEmail;
  const [isSending, setIsSending] = useState(false);
  const [showModal, setShowModal] = useState(false);
  const [emailInput, setEmailInput] = useState("");
  const [message, setMessage] = useState<{
    type: "success" | "error";
    text: string;
  } | null>(null);

  const copy = COPY[locale];

  const hint = useMemo(() => {
    if (isMember) {
      return copy.memberHint(memberEmail);
    }
    return copy.guestHint;
  }, [copy, isMember, memberEmail]);

  const sendInvoice = async (email?: string) => {
    setIsSending(true);
    setMessage(null);
    try {
      const endpoint = isMember
        ? `/orders/${encodeURIComponent(orderStableId)}/invoice/email/member`
        : `/orders/${encodeURIComponent(orderStableId)}/invoice/email`;

      await apiFetch(endpoint, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          email,
          locale,
        }),
      });

      setMessage({ type: "success", text: copy.success });
      setShowModal(false);
    } catch (err) {
      const fallback = err instanceof Error ? err.message : copy.failed;
      setMessage({ type: "error", text: fallback });
    } finally {
      setIsSending(false);
    }
  };

  const handlePrimaryClick = () => {
    if (isMember) {
      void sendInvoice();
      return;
    }
    setShowModal(true);
  };

  const handleGuestSubmit = (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!isValidEmail(emailInput)) {
      setMessage({ type: "error", text: copy.invalidEmail });
      return;
    }
    void sendInvoice(emailInput.trim());
  };

  return (
    <div className="mx-auto mt-4 max-w-xl rounded-2xl border border-slate-200 bg-white/80 px-4 py-5 text-center sm:px-6">
      <div className="text-sm font-semibold text-slate-900">
        {copy.button}
      </div>
      <p className="mt-2 text-xs text-slate-500">{hint}</p>
      <button
        type="button"
        onClick={handlePrimaryClick}
        disabled={isSending || status === "loading"}
        className="mt-3 inline-flex items-center justify-center rounded-xl bg-slate-900 px-4 py-2 text-sm font-semibold text-white transition hover:bg-slate-700 disabled:cursor-not-allowed disabled:opacity-60"
      >
        {isSending ? copy.sending : copy.button}
      </button>
      {message ? (
        <p
          className={`mt-2 text-xs ${
            message.type === "success" ? "text-emerald-600" : "text-rose-600"
          }`}
        >
          {message.text}
        </p>
      ) : null}

      {showModal ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
          <div className="w-full max-w-md rounded-2xl border bg-white p-6 shadow-xl">
            <div className="text-lg font-semibold text-slate-900">
              {copy.modalTitle}
            </div>
            <form className="mt-4 space-y-4" onSubmit={handleGuestSubmit}>
              <label className="block space-y-1 text-left text-sm">
                <span className="text-slate-700">{copy.emailLabel}</span>
                <input
                  type="email"
                  value={emailInput}
                  onChange={(event) => setEmailInput(event.target.value)}
                  placeholder={copy.emailPlaceholder}
                  className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm"
                />
              </label>
              <div className="flex items-center justify-end gap-3">
                <button
                  type="button"
                  onClick={() => setShowModal(false)}
                  className="rounded-lg border border-slate-200 px-4 py-2 text-sm text-slate-600 hover:bg-slate-50"
                >
                  {copy.cancel}
                </button>
                <button
                  type="submit"
                  disabled={isSending}
                  className="rounded-lg bg-slate-900 px-4 py-2 text-sm font-semibold text-white hover:bg-slate-700 disabled:cursor-not-allowed disabled:opacity-60"
                >
                  {isSending ? copy.sending : copy.submit}
                </button>
              </div>
            </form>
          </div>
        </div>
      ) : null}
    </div>
  );
}
