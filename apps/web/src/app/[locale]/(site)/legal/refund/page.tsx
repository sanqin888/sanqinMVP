// apps/web/src/app/[locale]/legal/refund/page.tsx

import type { Metadata } from "next";
import { isLocale } from "@/lib/i18n/locales";
import type { Locale } from "@/lib/i18n/locales";
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
            ? "生效及最后更新日期：2026-08-22。本政策适用于直接通过 sanq.ca 下单并向 SANQIN RESTAURANT 付款的订单。通过 Uber Eats 或其他第三方交易平台直接下单并在该平台完成交易的订单，应通过对应平台的客服和退款流程处理。"
            : "Effective and last updated: 2026-08-22. This policy applies to orders placed directly on sanq.ca and paid to SANQIN RESTAURANT. Orders placed and transacted directly through Uber Eats or another third-party marketplace should be handled through that platform’s support and refund process."}
        </p>
      </header>

      <section className="space-y-2">
        <h2 className="text-base font-semibold">
          {isZh ? "1. SanQ 网站订单与配送" : "1. SanQ website orders & delivery"}
        </h2>
        <ul className="list-disc space-y-1 pl-5">
          <li>
            {isZh
              ? "只要订单是在 sanq.ca 下单并向 SANQIN RESTAURANT 付款，就属于 SanQ 网站订单。即使我们使用 Uber 或其他第三方配送服务商履约，本政策仍适用。"
              : "An order remains a SanQ website order when it is placed on sanq.ca and paid to SANQIN RESTAURANT, even if Uber or another third-party delivery provider is used to fulfill delivery. This policy still applies."}
          </li>
          <li>
            {isZh
              ? "通过 Uber Eats 或其他第三方交易平台直接下单并完成交易的订单，适用对应平台自身的客服、取消和退款规则。"
              : "Orders placed and transacted directly through Uber Eats or another third-party marketplace are subject to that platform’s own support, cancellation, and refund rules."}
          </li>
        </ul>
      </section>

      <section className="space-y-2">
        <h2 className="text-base font-semibold">
          {isZh ? "2. 即时订单、预约订单与修改" : "2. ASAP orders, scheduled orders & changes"}
        </h2>
        <ul className="list-disc space-y-1 pl-5">
          <li>
            {isZh
              ? "即时订单在支付并确认后可能很快进入制作流程，因此可取消或修改的时间通常很短。"
              : "ASAP orders may enter preparation shortly after payment and confirmation, so the window for cancellation or changes is usually short."}
          </li>
          <li>
            {isZh
              ? "如网站提供预约下单，预约时间不得晚于下单后 24 小时。预约订单在实际进入准备/制作流程前，可联系我们申请取消或合理修改；进入制作后按已开始制作的订单处理。"
              : "Where scheduled ordering is offered, the scheduled time must be no later than 24 hours after ordering. Before a scheduled order actually enters preparation, you may contact us to request cancellation or a reasonable change. Once preparation starts, it is handled as an order already in preparation."}
          </li>
          <li>
            {isZh
              ? "如需修改辣度、配料、数量、取餐或配送信息等，请尽快联系门店。我们只能在尚未制作或实际操作允许的范围内协助，不能保证所有修改均可完成。"
              : "If you need to change spice level, ingredients, quantity, pickup or delivery information, contact the store as soon as possible. We can assist only before preparation or where operations reasonably allow, and not every change can be guaranteed."}
          </li>
        </ul>
      </section>

      <section className="space-y-2">
        <h2 className="text-base font-semibold">
          {isZh ? "3. 顾客主动取消" : "3. Customer-requested cancellation"}
        </h2>
        <ul className="list-disc space-y-1 pl-5">
          <li>
            {isZh
              ? "如订单尚未开始制作，你可以联系门店申请取消。经核实符合取消条件后，我们会按原支付方式办理相应退款。"
              : "If preparation has not started, you may contact the store to request cancellation. If the order is eligible after verification, we will issue the applicable refund to the original payment method."}
          </li>
          <li>
            {isZh
              ? "如订单已经开始制作、菜品已经完成或为订单专门投入的食品已无法合理重新使用，通常不能因顾客改变主意而要求全额退款。若仅有部分内容尚未制作，我们会根据实际未履行部分评估可提供的退款或其他解决方案。"
              : "If preparation has started, food has been completed, or food prepared specifically for the order can no longer reasonably be reused, a full refund is generally not available simply because the customer changed their mind. If part of the order has not yet been prepared, we will assess the unfulfilled portion for an appropriate refund or other solution."}
          </li>
        </ul>
      </section>

      <section className="space-y-2">
        <h2 className="text-base font-semibold">
          {isZh ? "4. 商家无法履约、缺货或支付问题" : "4. Store cancellation, stock & payment issues"}
        </h2>
        <ul className="list-disc space-y-1 pl-5">
          <li>
            {isZh
              ? "如因售罄、设备故障、门店无法履约或其他由我们一方造成的原因必须取消整单，我们会退还该订单应退的全部已付款金额。使用信用卡支付并实际收取了信用卡附加费的，全额退款会连同相应附加费一并处理。"
              : "If we must cancel the entire order because of an out-of-stock item, equipment failure, inability to fulfill, or another issue on our side, we will refund the full amount due for that order. For a credit-card transaction where a surcharge was actually charged, a full refund will include the applicable surcharge."}
          </li>
          <li>
            {isZh
              ? "如出现重复扣款、金额明显错误或已失败订单仍被实际扣款，请提供订单信息和相关支付记录与我们联系，我们会核查 SanQ 和支付处理方记录并处理应退金额。"
              : "If you see a duplicate charge, an obvious amount error, or an actual charge for a failed order, contact us with the order information and relevant payment record. We will review the SanQ and payment-processor records and handle any amount due for refund."}
          </li>
        </ul>
      </section>

      <section className="space-y-2">
        <h2 className="text-base font-semibold">
          {isZh ? "5. 漏餐、错餐、质量或配送问题" : "5. Missing, wrong, quality or delivery issues"}
        </h2>
        <ul className="list-disc space-y-1 pl-5">
          <li>
            {isZh
              ? "如存在漏餐、错餐、明显制作/包装问题或其他食品质量问题，请在收到订单当天尽快联系我们，并提供订单号和问题说明。"
              : "For missing items, wrong items, visible preparation/packaging problems, or other food-quality issues, contact us as soon as reasonably possible on the day you receive the order and provide the order number and a description of the issue."}
          </li>
          <li>
            {isZh
              ? "对于性质上可以通过照片合理记录的问题（例如错餐、异物、明显泼洒、包装破损或可见质量问题），我们可以要求你在丢弃或食用相关餐品前提供清晰照片或其他合理证明，以便核实。对于无法合理通过照片证明的问题，例如整单未送达、明显漏餐或支付错误，可使用订单记录、配送记录、收据或其他合理信息核实。"
              : "For issues that can reasonably be documented by photo—such as a wrong item, foreign object, visible spill, damaged packaging, or visible quality problem—we may require clear photos or other reasonable evidence before the affected food is discarded or consumed. For issues that cannot reasonably be proven by photo, such as non-delivery, a clearly missing item, or a payment error, we may verify using order records, delivery records, receipts, or other reasonable information."}
          </li>
          <li>
            {isZh
              ? "核实后，我们会根据问题性质和受影响范围提供适当处理，例如重做、补发、部分退款、全额退款或其他合理解决方案。"
              : "After verification, we will provide an appropriate remedy based on the nature and extent of the issue, which may include remake, replacement, partial refund, full refund, or another reasonable solution."}
          </li>
        </ul>
      </section>

      <section className="space-y-2">
        <h2 className="text-base font-semibold">
          {isZh ? "6. 积分、储值余额、优惠券与附加费" : "6. Points, Store Balance, coupons & surcharge"}
        </h2>
        <ul className="list-disc space-y-1 pl-5">
          <li>
            {isZh
              ? "订单全额退款时，本单获得的积分会被扣回，本单实际使用的积分会相应退回。部分退款时，积分按实际退款内容和剩余符合条件的消费金额调整。"
              : "For a full refund, points earned on the order are reversed and points actually redeemed are restored accordingly. For a partial refund, points are adjusted based on the refunded portion and the remaining eligible spend."}
          </li>
          <li>
            {isZh
              ? "使用储值余额支付的应退金额原则上退回相应储值余额。优惠券是否恢复、是否仍可使用以及有效期等，按该优惠券或促销活动的明确规则和实际退款原因处理。"
              : "An amount paid with Store Balance is generally returned to the corresponding Store Balance. Whether a coupon is restored, remains usable, or retains its expiry depends on the clearly stated coupon or promotion terms and the reason for the refund."}
          </li>
          <li>
            {isZh
              ? "信用卡部分退款时，相应信用卡附加费按适用支付网络规则及实际退款比例/金额处理。"
              : "For a partial credit-card refund, the corresponding surcharge is handled according to applicable payment-network rules and the amount or proportion actually refunded."}
          </li>
        </ul>
      </section>

      <section className="space-y-2">
        <h2 className="text-base font-semibold">
          {isZh ? "7. 退款到账" : "7. Refund posting"}
        </h2>
        <p>
          {isZh
            ? "我们确认应退款后会通过原支付方式或适用的原账户发起退款。退款发起后，银行卡或其他支付方式的实际入账时间由支付处理方、卡组织或发卡机构的处理进度决定。"
            : "After we confirm that a refund is due, we initiate it to the original payment method or applicable original account. Once initiated, the time for a card or other payment refund to appear depends on the processing timelines of the payment processor, payment network, or issuing institution."}
        </p>
      </section>

      <section className="space-y-2">
        <h2 className="text-base font-semibold">
          {isZh ? "8. 政策更新与法定权利" : "8. Policy changes & statutory rights"}
        </h2>
        <p>
          {isZh
            ? "我们可能不时更新本政策，并在本页面注明新的生效日期。更新后的政策适用于生效后的后续订单，不会仅因页面后来更新而追溯改变已经确认的订单条件。本政策不限制消费者依据适用法律享有的任何强制性权利。"
            : "We may update this policy from time to time and will state the new effective date on this page. Updated terms apply to later orders after the effective date and do not retroactively change confirmed order terms merely because this page was later updated. This policy does not limit any mandatory consumer rights under applicable law."}
        </p>
      </section>
    </div>
  );
}
