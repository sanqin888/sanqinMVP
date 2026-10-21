// apps/web/src/app/[locale]/legal/terms/page.tsx

import type { Metadata } from "next";
import Link from "next/link";
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
    title: isZh ? "三秦 · 网站与应用使用条款" : "San Qin · Website & App Terms",
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
          {isZh ? "网站与应用使用条款" : "Website & App Terms of Use"}
        </h1>
        <p className="text-xs text-slate-500">
          {isZh
            ? "生效及最后更新日期：2026-10-21。SANQIN RESTAURANT 是 SanQ Roujiamo（三秦肉夹馍）网站、在线点餐与会员服务，以及 sanq.ca 门店管理和 Clover 支付集成应用的运营者、开发者与应用提供方。本条款适用于你使用相关网站、应用及服务，并作为该应用的使用许可条款；若不同意，请勿使用。"
            : "Effective and last updated: 2026-10-21. SANQIN RESTAURANT operates and develops the SanQ Roujiamo website, online ordering and membership services, and the sanq.ca store-management and Clover payment integration app. It is the provider of the app. These terms govern your use of those websites, apps, and services and include the app's terms of permitted use. Do not use them if you do not agree."}
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
              ? "本店符合条件的信用卡交易适用 2.40% 附加费，不高于本店信用卡受理成本。附加费由 Clover 支付系统按商户配置处理，SanQ 应用不另行设置或叠加信用卡附加费。借记卡及其他不符合条件的银行卡不收取该信用卡附加费。实际金额以支付流程及交易收据为准。"
              : "Eligible credit-card transactions at our store carry a 2.40% surcharge, no higher than our card acceptance cost. Clover's payment system handles the surcharge under the merchant configuration; the SanQ app does not set or add an extra credit-card surcharge. Debit and other ineligible cards do not carry this credit-card fee. Refer to the payment flow and transaction receipt for the actual amount."}
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
            ? "不得以违法、欺诈、恶意刷单、滥用优惠、利用系统漏洞、未经授权访问系统、干扰运行或大规模抓取数据等方式使用本网站或应用。我们可在合理必要范围内限制访问、暂停相关权益或采取其他适用措施，并保留依法追究责任的权利。"
            : "You must not use this website or app for unlawful or fraudulent activity, abusive ordering, promotion abuse, exploitation of system defects, unauthorized system access, interference with operations, or large-scale scraping. We may reasonably restrict access, suspend affected benefits, or take other appropriate measures and may pursue available legal remedies."}
        </p>
      </section>

      <section className="space-y-2">
        <h2 className="text-base font-semibold">
          {isZh ? "9. 网站与应用可用性及责任限制" : "9. Website and app availability & liability"}
        </h2>
        <p>
          {isZh
            ? "在适用法律允许的最大范围内，本网站、应用及相关服务按现状及实际可用情况提供。我们会合理努力维持服务并保持信息准确，但无法保证网络、第三方服务或设备始终不中断。因第三方系统、网络故障或不可抗力造成问题时，我们会合理协助处理；本条款不排除或限制法律不允许排除或限制的责任。"
            : "To the fullest extent permitted by law, this website, app, and related services are provided as available and in their existing condition. We make reasonable efforts to maintain the service and keep information accurate but cannot guarantee uninterrupted availability of networks, third-party services, or equipment. We will reasonably assist with issues caused by third-party systems, network failures, or force majeure, and nothing in these terms excludes or limits liability that cannot lawfully be excluded or limited."}
        </p>
      </section>

      <section className="space-y-2">
        <h2 className="text-base font-semibold">
          {isZh ? "10. 条款更新与适用法律" : "10. Changes & governing law"}
        </h2>
        <p>
          {isZh
            ? "我们可能不时更新本条款，并在页面注明新的生效日期。更新后的条款适用于生效日期后的后续网站、应用使用和交易，不会仅因网站后来更新而追溯改变已完成订单的结算结果。本条款受加拿大及安大略省适用法律管辖。"
            : "We may update these terms from time to time and will state the new effective date on this page. Updated terms apply to subsequent website and app use and transactions after the effective date and do not retroactively change completed-order settlements merely because the website terms were later updated. These terms are governed by applicable laws of Canada and Ontario."}
        </p>
      </section>

      <section className="space-y-2">
        <h2 className="text-base font-semibold">
          {isZh
            ? "11. 门店应用与授权使用"
            : "11. Store app & permitted use"}
        </h2>
        <p>
          {isZh
            ? "sanq.ca 门店应用用于 SanQ 在加拿大安大略省自营门店的点餐、门店管理及支付核对。按门店实际启用的功能，应用可连接 Clover 终端发起付款、退款或撤销请求，查询商户和交易状态，并将相关结果关联到 SanQ 订单。此说明不代表所有功能已经在所有门店或设备上开放。"
            : "The sanq.ca store app supports ordering, store management, and payment reconciliation for SanQ-operated stores in Ontario, Canada. Depending on the features enabled at the store, it can request payments, refunds, or voids through Clover terminals, read merchant and transaction status, and relate those results to SanQ orders. This description does not mean every feature is available at every store or on every device."}
        </p>
        <p>
          {isZh
            ? "经我们授权的商户代表及员工可在其工作职责和账户权限范围内使用门店应用。此使用许可仅限获授权的门店业务，不可转授、转售或用于访问无权访问的商户资料；本应用目前不向无关的第三方商户提供通用软件服务。顾客无需安装或授权门店应用即可使用适用的线上点餐服务。"
            : "Approved merchant representatives and staff may use the store app for their assigned store duties and within their account permissions. Permission to use it cannot be passed on, resold, or used to access unauthorized merchant records. The app is not currently offered as a general software service to unrelated third-party merchants. Customers do not need to install or authorize the store app to use the applicable online ordering service."}
        </p>
        <p>
          {isZh
            ? "门店集成需适用的 Clover 商户账户、支持的支付设备、有效商户授权及网络连接，由我们安排接入。你须有权代表该商户授予访问，并妥善保护账户和设备；不得分享支付密钥或借用他人权限操作。发现未经授权的操作或安全问题时，请尽快联系应用支持。"
            : "Store integration requires an applicable Clover merchant account, supported payment hardware, valid merchant authorization, and connectivity. We arrange setup. Anyone granting access must be entitled to act for that merchant and must protect accounts and devices. Do not share payment credentials or use someone else's permissions. Report unauthorized activity or security concerns to app support promptly."}
        </p>
        <p>
          {isZh
            ? "当前门店集成应用不另收软件订阅费。餐饮订单金额、Clover 设备及支付服务费用和网络费用分别按相关订单或服务协议处理，不因应用免费而免除。"
            : "There is currently no separate software subscription charge for the store integration app. Food orders, Clover hardware and payment services, and connectivity remain subject to their respective prices or agreements; the app being free does not waive those charges."}
        </p>
      </section>

      <section className="space-y-2">
        <h2 className="text-base font-semibold">
          {isZh
            ? "12. Clover 服务、交易结果与隐私"
            : "12. Clover services, transaction results & privacy"}
        </h2>
        <p>
          {isZh
            ? "本条款约定的是你与 SANQIN RESTAURANT 之间的网站和 SanQ 应用使用关系。Clover 及其关联方不是本条款的当事方，也不是 SanQ 应用的许可方或提供方，不对你使用 SanQ 应用承担责任。Clover 自行提供的设备、支付处理及相关服务受其与商户之间的独立协议约束；本条款不变更这些协议或适用法律规定的权利义务。"
            : "Your use of the website and SanQ app is governed by these terms with SANQIN RESTAURANT. Clover and its affiliates do not enter into these terms with you, do not supply or license the SanQ app, and bear no responsibility for your use of that app. Hardware, payment processing, and related services supplied by Clover remain governed by its separate merchant agreements. These terms do not amend those agreements or rights and duties under applicable law."}
        </p>
        <p>
          {isZh
            ? "通过本集成发起的银行卡交易由 Clover 及相关支付系统处理。应用查询交易资料是为了核对实际收款、退款、撤销及适用费用，不保证请求被批准或在特定时间完成结算、退款到账。页面超时、设备提示或未收到确认不一定表示未扣款；如有疑问，请先联系我们核查交易，避免重复付款。"
            : "Card transactions requested through this integration are handled by Clover and its payment systems. The app reads transaction records to verify payments, refunds, voids, and applicable charges. It does not guarantee approval or a particular settlement or refund-credit time. A timeout, device message, or missing confirmation does not necessarily mean no charge occurred. Contact us to check uncertain transactions before paying again."}
        </p>
        <p>
          {isZh
            ? "仅有权人员可在权限范围内处理门店退款或撤销。退款与取消政策继续适用；停止使用应用、撤销授权或卸载 Clover 集成不会自动退款，也不会抹除已经发生的交易或依法需要保存的记录。"
            : "Only authorized personnel may process store refunds or voids within their permissions. The Refund & Cancellation Policy still applies. Ending app use, revoking authorization, or uninstalling the Clover integration does not automatically refund a payment or erase completed transactions or records that must be retained."}
        </p>
        <p>
          {isZh
            ? "商户授权仅允许应用在获准范围内处理门店资料，不代替顾客的营销同意。有关信息来源、用途、共享、保存及请求方式，见"
            : "Merchant authorization permits the app to handle store records within the approved scope and does not replace customer marketing consent. For data sources, purposes, sharing, retention, and requests, see our"}{" "}
          <Link className="text-slate-900 underline" href={`/${locale}/legal/privacy`}>
            {isZh ? "隐私政策" : "Privacy Policy"}
          </Link>
          {isZh ? "。" : "."}
        </p>
      </section>

      <section className="space-y-2">
        <h2 className="text-base font-semibold">
          {isZh
            ? "13. 停止使用、维护与支持"
            : "13. Ending use, maintenance & support"}
        </h2>
        <p>
          {isZh
            ? "有权代表商户的人员可通过 Clover 提供的授权或应用管理方式撤销访问，或联系应用支持安排停止连接。我们也可因安全事件、未经授权使用、违反本条款或必要维护，合理限制、暂停或停止应用访问。任何此类措施不改变已完成订单的结算事实，也不取消顾客依法享有的退款或其他权利。"
            : "Authorized merchant representatives can revoke access through Clover's authorization or app-management facilities, or contact app support to arrange disconnection. We may reasonably restrict, suspend, or end app access for security incidents, unauthorized use, breaches of these terms, or necessary maintenance. Such measures do not change completed-order payment facts or remove customers' refund or other rights under applicable law."}
        </p>
        <p>
          {isZh
            ? "为保持安全和兼容性，应用可能需要更新或维护，期间可能出现服务中断。我们会合理提供接入、故障及交易查询支持；具体可用功能和处理结果仍取决于商户授权、设备、网络和支付服务状态。使用许可随相应授权终止，必须继续履行的隐私保护、记录保存和交易争议处理义务不因此终止。"
            : "Updates and maintenance may be needed for security and compatibility and may interrupt service. We provide reasonable assistance with setup, faults, and transaction inquiries. Availability and outcomes still depend on merchant authorization, devices, connectivity, and payment service status. Permission to use the app ends when the relevant authorization ends; continuing privacy, record-retention, and transaction-dispute obligations remain."}
        </p>
      </section>

      <section className="space-y-2">
        <h2 className="text-base font-semibold">
          {isZh
            ? "14. 联系应用提供方"
            : "14. Contact the app provider"}
        </h2>
        <p>
          {isZh
            ? "应用提供方：SANQIN RESTAURANT。邮箱：support@sanq.ca。电话：+1 (437) 808-6888。支持时段：08:00–22:30（多伦多当地时间）。地址：Unit 138, 4750 Yonge St, North York, ON M2N 5M6, Canada。"
            : "App provider: SANQIN RESTAURANT. Email: support@sanq.ca. Phone: +1 (437) 808-6888. Support hours: 08:00–22:30, Toronto local time. Address: Unit 138, 4750 Yonge St, North York, ON M2N 5M6, Canada."}
        </p>
        <p>
          <Link className="text-slate-900 underline" href={`/${locale}/legal/contact`}>
            {isZh ? "接入及交易问题支持" : "Setup and transaction support"}
          </Link>
          {" · "}
          <Link className="text-slate-900 underline" href={`/${locale}/legal/refund`}>
            {isZh ? "退款与取消政策" : "Refund & Cancellation Policy"}
          </Link>
        </p>
      </section>
    </div>
  );
}
