import Link from "next/link";

const LOCALES = ["zh", "en"] as const;
type Locale = (typeof LOCALES)[number];

type PageProps = {
  params: {
    locale?: string;
    order?: string;
  };
};

const COPY: Record<
  Locale,
  {
    tagline: string;
    title: string;
    intro: string;
    orderLabel: string;
    orderHelp: string;
    contact: string;
    backCta: string;
  }
> = {
  zh: {
    tagline: "San Qin 三秦面馆",
    title: "感谢下单 Thank you!",
    intro:
      "支付已完成，感谢您的支持。我们正在确认订单详情，请保持手机畅通以接收短信更新。Payment confirmed — we are reviewing the order details and will text you updates shortly.",
    orderLabel: "订单编号 Order number",
    orderHelp:
      "请保留此编号以便查询或到店取餐时出示。Keep this reference handy for pickup or any inquiries.",
    contact: "如需调整订单，请致电门店或通过短信联系我们。If you need any changes, reach us by phone or text.",
    backCta: "返回菜单 Back to menu",
  },
  en: {
    tagline: "San Qin Noodle House 三秦面馆",
    title: "Thank you! 感谢下单",
    intro:
      "Payment confirmed. Thanks for supporting us! We are double-checking the order details—please keep your phone available for text updates. 支付已完成，请保持手机畅通以接收短信通知。",
    orderLabel: "Your order number 订单编号",
    orderHelp:
      "Keep this number for reference when picking up or reaching out. 取餐或咨询时请出示此编号。",
    contact: "Need to adjust anything? Call the restaurant or send us a text. 如需修改订单，请致电或短信联系我们。",
    backCta: "Back to menu 返回菜单",
  },
};

export default function ThankYouPage({ params }: PageProps) {
  const rawLocale = params?.locale ?? "";
  const locale = (LOCALES.includes(rawLocale as Locale) ? rawLocale : "en") as Locale;

  const rawOrder = params?.order ?? "";
  const orderNumber = decodeURIComponent(rawOrder);
  const copy = COPY[locale];

  return (
    <main className="flex min-h-screen flex-col items-center justify-center bg-slate-50 p-6 text-slate-900">
      <div className="w-full max-w-xl space-y-6 rounded-3xl border border-slate-200 bg-white p-8 text-center shadow-lg">
        <div className="space-y-2">
          <p className="text-sm font-semibold uppercase tracking-[0.3em] text-slate-500">{copy.tagline}</p>
          <h1 className="text-3xl font-semibold text-slate-900">{copy.title}</h1>
          <p className="text-base text-slate-600">{copy.intro}</p>
        </div>

        <div className="space-y-2 rounded-2xl border border-slate-200 bg-slate-50 p-6">
          <p className="text-sm font-medium text-slate-500">{copy.orderLabel}</p>
          <p className="text-2xl font-bold tracking-wide text-slate-900">{orderNumber || "--"}</p>
          <p className="text-sm text-slate-500">{copy.orderHelp}</p>
        </div>

        <div className="space-y-3">
          <p className="text-sm text-slate-600">{copy.contact}</p>
          <Link
            href={`/${locale}`}
            className="inline-flex items-center justify-center rounded-full bg-slate-900 px-5 py-2 text-sm font-semibold text-white transition hover:bg-slate-700"
          >
            {copy.backCta}
          </Link>
        </div>
      </div>
    </main>
  );
}
