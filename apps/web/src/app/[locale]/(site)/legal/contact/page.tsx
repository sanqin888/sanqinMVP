// apps/web/src/app/[locale]/legal/contact/page.tsx

import type { Metadata } from "next";
import Link from "next/link";
import type { Locale } from "@/lib/i18n/locales";
import { isLocale } from "@/lib/i18n/locales";
import { notFound } from "next/navigation";

export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: string }>;
}): Promise<Metadata> {
  const { locale } = await params;
  if (!isLocale(locale)) return {};
  const isZh = locale === "zh";

  return {
    title: isZh ? "三秦 · 联系我们" : "San Qin · Contact us",
  };
}

export default async function ContactPage({
  params,
}: {
  params: Promise<{ locale: Locale }>;
}) {
  const { locale } = await params;
  if (!isLocale(locale)) notFound();
  const isZh = locale === "zh";

  const mapEmbedSrc =
    "https://www.google.com/maps/embed?pb=!1m18!1m12!1m3!1d860.7447724525811!2d-79.41244863168872!3d43.76037647252751!2m3!1f0!2f0!3f0!3m2!1i1024!2i768!4f13.1!3m3!1m2!1s0x882b2dfb95c33ce1%3A0xf3a474361eec2a31!2z5LiJ56em6IKJ5aS56aaN!5e0!3m2!1szh-CN!2sca!4v1768280762067!5m2!1szh-CN!2sca";
  const mapNavigateUrl =
    "https://www.google.com/maps/dir/?api=1&destination=43.76037647252751,-79.41244863168872";

  return (
    <div className="space-y-6 text-sm text-slate-800">
      <header className="space-y-2">
        <h1 className="text-2xl font-semibold text-slate-900">
          {isZh ? "联系我们" : "Contact us"}
        </h1>
        <p className="text-xs text-slate-500">
          {isZh
            ? "SanQ Roujiamo（三秦肉夹馍）及 sanq.ca 门店管理与 Clover 支付集成应用由 SANQIN RESTAURANT 运营和提供。如有订单、会员、网站、门店应用、交易或隐私相关问题，请通过以下方式联系我们。"
            : "SANQIN RESTAURANT operates SanQ Roujiamo and provides the sanq.ca store-management and Clover payment integration app. Contact us below for questions about orders, membership, the website, store app, transactions, or privacy."}
        </p>
      </header>

      <section className="space-y-2">
        <h2 className="text-base font-semibold">
          {isZh ? "运营主体与联系方式" : "Operator & contact details"}
        </h2>
        <ul className="space-y-2">
          <li>
            <span className="font-semibold">
              {isZh ? "运营主体：" : "Operator: "}
            </span>
            SANQIN RESTAURANT
          </li>
          <li>
            <span className="font-semibold">{isZh ? "联系电话：" : "Phone: "}</span>
            +1 (437) 808-6888
          </li>
          <li>
            <span className="font-semibold">
              {isZh ? "客服邮箱：" : "Support email: "}
            </span>
            <a className="text-slate-900 underline" href="mailto:support@sanq.ca">
              support@sanq.ca
            </a>
          </li>
          <li>
            <span className="font-semibold">
              {isZh ? "应用支持时段：" : "App support hours: "}
            </span>
            {isZh ? "08:00–22:30（多伦多当地时间）" : "08:00–22:30, Toronto local time"}
          </li>
          <li>
            <span className="font-semibold">{isZh ? "地址：" : "Address: "}</span>
            Unit 138, 4750 Yonge St, North York, ON M2N 5M6, Canada
          </li>
        </ul>
      </section>

      <section className="space-y-2">
        <h2 className="text-base font-semibold">
          {isZh ? "隐私联系" : "Privacy contact"}
        </h2>
        <p>
          {isZh
            ? "如需访问、更正或申请删除个人信息、撤回可撤回的同意，或提出隐私问题及投诉，请联系 SANQIN RESTAURANT Privacy Officer，并发送邮件至 support@sanq.ca，注明“Privacy / 隐私”。我们会在必要的身份或授权核验后按适用要求处理，法定保存和交易争议等限制详见隐私政策。"
            : "For access, correction or deletion requests, withdrawal of consent where available, privacy questions, or complaints, contact the SANQIN RESTAURANT Privacy Officer at support@sanq.ca and include “Privacy” in the subject or message. We handle requests under applicable requirements after necessary identity or authority checks. See the Privacy Policy for legal-retention and transaction-dispute limitations."}
        </p>
      </section>

      <section className="space-y-2">
        <h2 className="text-base font-semibold">
          {isZh ? "门店应用支持与常见问题" : "Store app support & common questions"}
        </h2>
        <h3 className="font-semibold">
          {isZh ? "如何接入或停止 Clover 连接？" : "How do I connect or disconnect Clover?"}
        </h3>
        <p>
          {isZh
            ? "门店应用供 SanQ 自营门店的获授权人员使用。接入需适用的 Clover 商户账户、支持的支付设备、有效商户授权和网络连接，由我们协助安排。请由有权代表商户的人员联系支持；停止连接可使用 Clover 提供的授权或应用管理方式，或联系我们处理。"
            : "The store app is for authorized personnel at SanQ-operated stores. Setup requires an applicable Clover merchant account, supported payment hardware, valid merchant authorization, and connectivity. We assist with setup. An authorized merchant representative should contact support. To disconnect, use Clover's authorization or app-management facilities, or contact us."}
        </p>
        <h3 className="font-semibold">
          {isZh ? "付款或退款结果不确定怎么办？" : "What if a payment or refund result is unclear?"}
        </h3>
        <p>
          {isZh
            ? "请提供订单号、交易日期与金额，以及问题描述；如有交易收据，也可提供其中的交易编号。请先联系我们核查，避免因页面超时或未收到确认而重复付款或退款。我们可协助核对 SanQ 与 Clover 的记录，实际处理及到账时间仍取决于支付服务和发卡行。"
            : "Provide the order number, transaction date and amount, and a description of the issue. A transaction reference from a receipt can also help. Contact us to check before repeating a payment or refund because of a timeout or missing confirmation. We can compare SanQ and Clover records; processing and credit times still depend on payment services and the card issuer."}
        </p>
        <h3 className="font-semibold">
          {isZh ? "联系支持时应保护哪些信息？" : "What information should I protect when seeking support?"}
        </h3>
        <p>
          {isZh
            ? "请勿通过邮件或普通消息发送完整卡号、CVV、PIN、账户密码或支付密钥。我们不需要这些信息来查询订单或核对交易。"
            : "Do not send full card numbers, CVV, PIN, account passwords, or payment credentials by email or ordinary messages. We do not need them to look up orders or check transactions."}
        </p>
        <p>
          <Link className="text-slate-900 underline" href={`/${locale}/legal/terms`}>
            {isZh ? "网站与应用使用条款" : "Website & App Terms of Use"}
          </Link>
          {" · "}
          <Link className="text-slate-900 underline" href={`/${locale}/legal/privacy`}>
            {isZh ? "隐私政策" : "Privacy Policy"}
          </Link>
          {" · "}
          <Link className="text-slate-900 underline" href={`/${locale}/legal/refund`}>
            {isZh ? "退款与取消政策" : "Refund & Cancellation Policy"}
          </Link>
        </p>
      </section>

      <section className="space-y-3">
        <h2 className="text-base font-semibold">
          {isZh ? "门店位置" : "Store location"}
        </h2>
        <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
          <iframe
            title={isZh ? "门店位置" : "Store location"}
            src={mapEmbedSrc}
            width="600"
            height="450"
            className="h-80 w-full sm:h-96"
            style={{ border: 0 }}
            allowFullScreen
            loading="lazy"
            referrerPolicy="no-referrer-when-downgrade"
          />
        </div>
        <div className="flex justify-center">
          <a
            href={mapNavigateUrl}
            target="_blank"
            rel="noreferrer"
            className="inline-flex items-center justify-center rounded-xl border border-slate-900 px-4 py-2 text-sm font-semibold text-slate-900 transition hover:bg-slate-900 hover:text-white"
          >
            {isZh ? "在 Google 地图中打开" : "Open in Google Maps"}
          </a>
        </div>
      </section>
    </div>
  );
}
