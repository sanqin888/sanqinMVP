// apps/web/src/app/[locale]/legal/refund/page.tsx

import type { Metadata } from "next";
import { isLocale } from "@/lib/i18n/locales";
import type { Locale } from "@/lib/order/shared";
import { notFound } from "next/navigation";

export async function generateMetadata({
  params,
}: {
  params: { locale: string };
}): Promise<Metadata> {
  const { locale } = params;
  if (!isLocale(locale)) return {};
  const isZh = locale === "zh";

  return {
    title: isZh ? "三秦 · 退款与取消政策" : "San Qin · Refund Policy",
  };
}

export default function RefundPage({
  params,
}: {
  params: { locale: Locale };
}) {
  const { locale } = params;
  if (!isLocale(locale)) notFound();
  const isZh = locale === "zh";

  return (
    <div className="space-y-6 text-sm text-slate-800">
      <header className="space-y-2">
        <h1 className="text-2xl font-semibold text-slate-900">
          {isZh ? "退款与取消政策" : "Refund & Cancellation Policy"}
        </h1>
        <p className="text-xs text-slate-500">
          {isZh
            ? "本政策适用于通过本网站提交并完成支付的订单。店内点餐或第三方平台（如 Uber Eats、DoorDash 等）下单，可能适用其各自的退款规则。"
            : "This policy applies to orders placed and paid for through this website. In-store orders or those placed through third-party platforms (such as Uber Eats or DoorDash) may be subject to their own refund rules."}
        </p>
      </header>

      <section className="space-y-2">
        <h2 className="text-base font-semibold">
          {isZh ? "1. 订单确认与修改" : "1. Order confirmation & changes"}
        </h2>
        <ul className="list-disc space-y-1 pl-5">
          <li>
            {isZh
              ? "提交并支付成功后，订单会自动进入制作流程。"
              : "Once your order is submitted and payment is successful, it is sent to our kitchen for preparation."}
          </li>
          <li>
            {isZh
              ? "如需修改订单（例如更改辣度、去某种配料等），请尽快直接联系门店，我们会在未开始制作或在合理范围内尽量协助调整。"
              : "If you need to make changes (such as spice level or removing an ingredient), please contact the store as soon as possible. We will try to accommodate changes that are requested before preparation or within a reasonable time."}
          </li>
        </ul>
      </section>

      <section className="space-y-2">
        <h2 className="text-base font-semibold">
          {isZh ? "2. 主动取消订单" : "2. Cancelling your order"}
        </h2>
        <ul className="list-disc space-y-1 pl-5">
          <li>
            {isZh
              ? "如订单尚未开始制作，你可以联系门店申请取消。经确认后，我们会按原支付方式办理退款。"
              : "If preparation has not yet started, you may contact the store to request a cancellation. Once confirmed, we will issue a refund to your original method of payment."}
          </li>
          <li>
            {isZh
              ? "如订单已在制作或接近完成阶段，通常无法全额退款。具体处理方式会根据实际情况（例如仅部分菜品未制作）酌情协商。"
              : "If preparation is already underway or nearly complete, a full refund may not be possible. We will work with you to determine a reasonable solution based on how much of the order has been prepared."}
          </li>
        </ul>
      </section>

      <section className="space-y-2">
        <h2 className="text-base font-semibold">
          {isZh ? "3. 菜品质量或配送问题" : "3. Quality or delivery issues"}
        </h2>
        <ul className="list-disc space-y-1 pl-5">
          <li>
            {isZh
              ? "如你收到的菜品存在明显问题（例如严重漏单、与订单完全不符等），请在合理时间内与我们联系，并尽可能提供订单号和照片。"
              : "If there is a significant issue with your order (such as missing items or items that do not match the order), please contact us within a reasonable time and provide the order number and, if possible, photos."}
          </li>
          <li>
            {isZh
              ? "经核实后，我们可能提供重做、部分退款或其他合理补偿方式，具体以当时沟通结果为准。"
              : "After verification, we may offer a remake, partial refund, or other reasonable remedy, depending on the circumstances."}
          </li>
          <li>
            {isZh
              ? "如通过第三方平台下单（如 Uber Eats、DoorDash 等），请首先通过对应平台发起问题反馈或退款申请，我们会配合平台核实。"
              : "For orders placed via third-party platforms, please initiate your complaint or refund request directly through that platform. We will cooperate with the platform’s process."}
          </li>
        </ul>
      </section>

      <section className="space-y-2">
        <h2 className="text-base font-semibold">
          {isZh ? "4. 积分与优惠券的处理" : "4. Points & coupon handling"}
        </h2>
        <ul className="list-disc space-y-1 pl-5">
          <li>
            {isZh
              ? "如订单全额退款，我们通常会扣回本单获得的积分，并退回本单使用的积分（如技术条件允许）。"
              : "If an order is fully refunded, we will usually reverse points earned from that order and, where possible, restore points you redeemed on that order."}
          </li>
          <li>
            {isZh
              ? "如为部分退款，积分与优惠券的调整会根据实际退款金额和活动规则进行处理。"
              : "For partial refunds, adjustments to points and coupons will be made based on the refunded amount and the applicable promotion rules."}
          </li>
        </ul>
      </section>

      <section className="space-y-2">
        <h2 className="text-base font-semibold">
          {isZh ? "5. 政策调整" : "5. Changes to this policy"}
        </h2>
        <p>
          {isZh
            ? "我们可能会根据运营情况和相关法律法规，不时调整退款与取消政策。更新后的条款一经在本页面发布，立即生效。下单前请留意本页面信息。"
            : "We may adjust this refund and cancellation policy from time to time in light of operations and applicable laws. Changes take effect once posted on this page. Please review this policy before placing an order."}
        </p>
      </section>
    </div>
  );
}
