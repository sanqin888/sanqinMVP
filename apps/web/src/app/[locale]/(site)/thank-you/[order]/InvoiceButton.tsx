// apps/web/src/app/[locale]/thank-you/[order]/InvoiceButton.tsx

"use client";

import { useMemo, useState } from "react";
import { apiFetch } from "@/lib/api/client";
import { useSession } from "@/lib/auth-session";
import type { Locale } from "@/lib/i18n/locales";
import CustomerModalShell, {
  CustomerModalHeader,
} from "@/components/site/CustomerModalShell";

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
    memberNoEmailHint: string;
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
    memberNoEmailHint: "No email is linked to your account yet. Please enter one to receive the invoice.",
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
    memberNoEmailHint: "当前会员资料未绑定邮箱，请先填写接收账单邮箱。",
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
  const isAuthenticated = status === "authenticated";
  const isMember = isAuthenticated && !!memberEmail;
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
    if (isAuthenticated) {
      return copy.memberNoEmailHint;
    }
    return copy.guestHint;
  }, [copy, isAuthenticated, isMember, memberEmail]);

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
    <div className="mx-auto mt-4 max-w-xl rounded-3xl border border-[#87362E]/10 bg-[#fffaf5] px-4 py-5 text-center shadow-sm sm:px-6">
      <div className="text-sm font-bold text-stone-900">
        {copy.button}
      </div>
      <p className="mt-2 text-xs text-stone-500">{hint}</p>
      <button
        type="button"
        onClick={handlePrimaryClick}
        disabled={isSending || status === "loading"}
        className="mt-3 inline-flex items-center justify-center rounded-full bg-[#87362E] px-5 py-2.5 text-sm font-bold text-white transition hover:bg-[#6f2c26] disabled:cursor-not-allowed disabled:opacity-60"
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
        <CustomerModalShell ariaLabel={copy.modalTitle} maxWidthClassName="max-w-md">
          <CustomerModalHeader
            title={copy.modalTitle}
            closeLabel={locale === "zh" ? "关闭" : "Close"}
            onClose={() => setShowModal(false)}
          />
          <form
            className="space-y-4 bg-[#fff7ef] px-5 py-5 sm:px-6"
            onSubmit={handleGuestSubmit}
          >
            <label className="block space-y-1.5 text-left text-sm">
              <span className="font-semibold text-stone-700">{copy.emailLabel}</span>
              <input
                type="email"
                value={emailInput}
                onChange={(event) => setEmailInput(event.target.value)}
                placeholder={copy.emailPlaceholder}
                className="w-full rounded-2xl border border-[#87362E]/15 bg-white px-3 py-2.5 text-sm text-stone-700 outline-none transition focus:border-[#87362E]/45 focus:ring-2 focus:ring-[#87362E]/10"
              />
            </label>
            <div className="flex items-center justify-end gap-3">
              <button
                type="button"
                onClick={() => setShowModal(false)}
                className="rounded-full border border-[#87362E]/20 bg-white px-4 py-2 text-sm font-bold text-[#87362E] transition hover:bg-[#fff3ea]"
              >
                {copy.cancel}
              </button>
              <button
                type="submit"
                disabled={isSending}
                className="rounded-full bg-[#87362E] px-5 py-2 text-sm font-bold text-white transition hover:bg-[#6f2c26] disabled:cursor-not-allowed disabled:opacity-60"
              >
                {isSending ? copy.sending : copy.submit}
              </button>
            </div>
          </form>
        </CustomerModalShell>
      ) : null}
    </div>
  );
}
