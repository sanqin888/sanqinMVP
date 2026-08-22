// apps/web/src/app/[locale]/legal/terms/page.tsx

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
    title: isZh ? "三秦 · 网站使用条款" : "San Qin · Website Terms",
  };
}

export default function TermsPage({
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
          {isZh ? "网站使用条款" : "Website Terms of Use"}
        </h1>
        <p className="text-xs text-slate-500">
          {isZh
            ? "生效及最后更新日期：2026-08-22。本网站及通过本网站提供的在线点餐和会员服务由 SANQIN RESTAURANT 运营，品牌为 SanQ Roujiamo（三秦肉夹馍）。使用本网站即表示你同意本条款及适用于相关服务的其他已公布规则。"
            : "Effective and last updated: 2026-08-22. This website and the online ordering and membership services offered through it are operated by SANQIN RESTAURANT under the SanQ Roujiamo brand. By using this website, you agree to these terms and other published rules that apply to the relevant service."}
        </p>
      </header>

      <section className="space-y-2">
        <h2 className="text-base font-semibold">
          {isZh ? "1. 网站服务" : "1. Website services"}
        </h2>
        <p>
          {isZh
            ? "本网站用于展示菜单、接受线上订单，并提供会员、积分、储值余额、优惠券及其他相关功能。我们可能调整未来可提供的菜单、价格、营业时间、配送/自取范围和网站功能；但后续调整不会追溯改变已经完成支付并确认的订单价格或结算结果，法律另有要求或双方另行同意的情况除外。"
            : "This website displays our menu, accepts online orders, and provides membership, points, Store Balance, coupons, and related features. We may change menus, prices, operating hours, delivery/pickup areas, and website features for future use; however, later changes do not retroactively alter the price or settlement of an order that has already been paid for and confirmed, unless required by law or otherwise agreed with you."}
        </p>
      </section>

      <section className="space-y-2">
        <h2 className="text-base font-semibold">
          {isZh ? "2. 账户与会员" : "2. Accounts & membership"}
        </h2>
        <ul className="list-disc space-y-1 pl-5">
          <li>
            {isZh
              ? "你应提供真实、准确的账户资料并及时更新，同时妥善保管登录凭据。会员账户仅限本人使用。"
              : "You should provide accurate account information, keep it reasonably up to date, and protect your sign-in credentials. Membership accounts are for personal use."}
          </li>
          <li>
            {isZh
              ? "SanQ 会员服务不面向 13 岁以下儿童。会员资格、积分、储值余额、推荐关系和其他会员权益受另行公布的会员规则约束。"
              : "The SanQ membership service is not available to children under 13. Membership eligibility, points, Store Balance, referrals, and other member benefits are governed by the separately published Membership Rules."}
          </li>
          <li>
            {isZh
              ? "如发现账户被未经授权使用，请尽快联系我们。"
              : "If you suspect unauthorized use of your account, please contact us as soon as possible."}
          </li>
        </ul>
      </section>

      <section className="space-y-2">
        <h2 className="text-base font-semibold">
          {isZh ? "3. 订单、价格与预约" : "3. Orders, pricing & scheduling"}
        </h2>
        <ul className="list-disc space-y-1 pl-5">
          <li>
            {isZh
              ? "下单前请核对菜品、数量、选项、取餐/配送方式、时间、联系方式以及结算页显示的价格、税费、配送费、折扣和总金额。完成支付并确认后，订单按确认的订单内容和金额处理。"
              : "Before ordering, review the items, quantities, options, fulfillment method, timing, contact information, and the prices, taxes, delivery fees, discounts, and total shown at checkout. After payment and confirmation, the order is handled according to the confirmed order details and amount."}
          </li>
          <li>
            {isZh
              ? "如网站提供预约下单，可选择的预约时间不得晚于下单时间后 24 小时，且仍受门店营业时间、产能和实际可用时段限制。"
              : "Where scheduled ordering is offered, the selected fulfillment time must be no later than 24 hours after the order is placed and remains subject to store hours, capacity, and available time slots."}
          </li>
          <li>
            {isZh
              ? "如因售罄、设备故障、门店无法履约或其他合理原因无法完成订单，我们会根据情况联系你，并可安排替换、取消或退款。"
              : "If we cannot fulfill an order because of an out-of-stock item, equipment issue, store-operational issue, or another reasonable cause, we may contact you and arrange a substitution, cancellation, or refund as appropriate."}
          </li>
        </ul>
      </section>

      <section className="space-y-2">
        <h2 className="text-base font-semibold">
          {isZh ? "4. 支付与信用卡附加费" : "4. Payment & credit-card surcharge"}
        </h2>
        <ul className="list-disc space-y-1 pl-5">
          <li>
            {isZh
              ? "在线银行卡支付由 Clover 处理。我们接受支付页面实际显示为可用的支付方式；目前信用卡支持 Visa、Mastercard 和 Discover，不接受 American Express。"
              : "Online card payments are processed by Clover. We accept the payment methods shown as available on the payment page; credit-card acceptance currently includes Visa, Mastercard, and Discover, but not American Express."}
          </li>
          <li>
            {isZh
              ? "对符合附加费条件的信用卡交易，我们收取交易金额 2.40% 的信用卡附加费，该费率不高于我们的信用卡受理成本。借记卡及其他不符合附加费条件的银行卡不收取该费用。实际附加费金额会在支付流程和收据/订单记录中显示。"
              : "A 2.40% surcharge applies to eligible credit-card transactions and does not exceed our cost of acceptance. Debit cards and other cards not eligible for surcharging are not subject to this fee. The actual surcharge amount is shown in the payment flow and on the receipt/order record."}
          </li>
          <li>
            {isZh
              ? "如发生退款，信用卡附加费会按照适用的支付网络规则和实际退款金额一并处理。"
              : "Where a refund is issued, the credit-card surcharge is handled together with the refund in accordance with applicable payment-network rules and the amount actually refunded."}
          </li>
        </ul>
      </section>

      <section className="space-y-2">
        <h2 className="text-base font-semibold">
          {isZh ? "5. 配送与第三方平台" : "5. Delivery & third-party platforms"}
        </h2>
        <ul className="list-disc space-y-1 pl-5">
          <li>
            {isZh
              ? "直接在 sanq.ca 下单并向 SANQIN RESTAURANT 付款的订单属于 SanQ 网站订单。即使我们使用 Uber 或其他第三方配送服务商完成配送，该订单仍适用 SanQ 的订单和退款政策。"
              : "An order placed directly on sanq.ca and paid to SANQIN RESTAURANT is a SanQ website order. Even if we use Uber or another third-party delivery provider to complete delivery, the SanQ order and refund policies continue to apply."}
          </li>
          <li>
            {isZh
              ? "通过 Uber Eats 或其他第三方交易平台直接下单并在该平台完成交易的订单，适用该平台自身的交易、客服和退款流程；SanQ 会在合理范围内配合平台核实。"
              : "Orders placed and transacted directly through Uber Eats or another third-party marketplace are subject to that platform’s own transaction, support, and refund processes. SanQ will reasonably cooperate with the platform when verification is needed."}
          </li>
        </ul>
      </section>

      <section className="space-y-2">
        <h2 className="text-base font-semibold">
          {isZh ? "6. 退款、取消与食品问题" : "6. Refunds, cancellations & food issues"}
        </h2>
        <p>
          {isZh
            ? "订单修改、取消、食品质量、错餐、漏餐、配送问题、积分/优惠券恢复和退款方式等，按本网站公布的《退款与取消政策》处理。该政策不会限制你依据适用法律享有的强制性权利。"
            : "Order changes, cancellations, food-quality issues, wrong or missing items, delivery issues, restoration of points/coupons, and refund methods are handled under the published Refund & Cancellation Policy. That policy does not limit any mandatory rights you have under applicable law."}
        </p>
      </section>

      <section className="space-y-2">
        <h2 className="text-base font-semibold">
          {isZh ? "7. 过敏原与特殊要求" : "7. Allergens & special requests"}
        </h2>
        <p>
          {isZh
            ? "菜品可能含有过敏原或存在共用厨房、设备和工作区域造成的交叉接触风险。订单备注或特殊要求不构成无过敏原保证。请在下单前查看《过敏原与食材说明》，严重食物过敏者应在下单前直接联系我们评估是否适合订购。"
            : "Food may contain allergens or be exposed to cross-contact through shared kitchen areas, equipment, and work surfaces. Order notes or special requests do not constitute an allergen-free guarantee. Review our Allergen & Ingredient Information before ordering, and contact us before placing an order if you have a severe food allergy."}
        </p>
      </section>

      <section className="space-y-2">
        <h2 className="text-base font-semibold">
          {isZh ? "8. 禁止行为" : "8. Prohibited activities"}
        </h2>
        <p>
          {isZh
            ? "不得以违法、欺诈、恶意刷单、滥用优惠、利用系统漏洞、未经授权访问系统、干扰网站运行或大规模抓取数据等方式使用本网站。我们可在合理必要范围内限制访问、暂停相关权益或采取其他适用措施，并保留依法追究责任的权利。"
            : "You must not use this website for unlawful or fraudulent activity, abusive ordering, promotion abuse, exploitation of system defects, unauthorized system access, interference with site operation, or large-scale scraping. We may reasonably restrict access, suspend affected benefits, or take other appropriate measures and may pursue available legal remedies."}
        </p>
      </section>

      <section className="space-y-2">
        <h2 className="text-base font-semibold">
          {isZh ? "9. 网站可用性与责任限制" : "9. Site availability & limitation of liability"}
        </h2>
        <p>
          {isZh
            ? "在适用法律允许的最大范围内，本网站按现状提供。我们会合理努力维持服务并保持信息准确，但无法保证网络、第三方服务或设备始终不中断。因第三方系统、网络故障或不可抗力造成问题时，我们会合理协助处理；本条款不排除或限制法律不允许排除或限制的责任。"
            : "To the fullest extent permitted by law, this website is provided on an as-is basis. We make reasonable efforts to maintain the service and keep information accurate but cannot guarantee uninterrupted availability of networks, third-party services, or equipment. We will reasonably assist with issues caused by third-party systems, network failures, or force majeure, and nothing in these terms excludes or limits liability that cannot lawfully be excluded or limited."}
        </p>
      </section>

      <section className="space-y-2">
        <h2 className="text-base font-semibold">
          {isZh ? "10. 条款更新与适用法律" : "10. Changes & governing law"}
        </h2>
        <p>
          {isZh
            ? "我们可能不时更新本条款，并在页面注明新的生效日期。更新后的条款适用于生效日期后的后续网站使用和交易，不会仅因网站后来更新而追溯改变已完成订单的结算结果。本条款受加拿大及安大略省适用法律管辖。"
            : "We may update these terms from time to time and will state the new effective date on this page. Updated terms apply to website use and transactions after the effective date and do not retroactively change completed-order settlements merely because the website terms were later updated. These terms are governed by applicable laws of Canada and Ontario."}
        </p>
      </section>
    </div>
  );
}
