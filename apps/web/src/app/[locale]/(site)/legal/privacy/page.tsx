// apps/web/src/app/[locale]/legal/privacy/page.tsx

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
    title: isZh ? "三秦 · 隐私政策" : "San Qin · Privacy Policy",
  };
}

export default function PrivacyPage({
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
          {isZh ? "隐私政策" : "Privacy Policy"}
        </h1>
        <p className="text-xs text-slate-500">
          {isZh
            ? "生效及最后更新日期：2026-08-22。本隐私政策说明 SANQIN RESTAURANT 在运营 SanQ Roujiamo（三秦肉夹馍）网站、会员与在线点餐服务时如何收集、使用、披露和保护个人信息。"
            : "Effective and last updated: 2026-08-22. This Privacy Policy explains how SANQIN RESTAURANT collects, uses, discloses, and protects personal information when operating the SanQ Roujiamo website, membership program, and online ordering services."}
        </p>
      </header>

      <section className="space-y-2">
        <h2 className="text-base font-semibold">
          {isZh ? "1. 我们收集的信息" : "1. Information we collect"}
        </h2>
        <ul className="list-disc space-y-1 pl-5">
          <li>
            {isZh
              ? "账户与联系信息：姓名、电子邮箱、手机号、语言偏好，以及会员账户和验证状态等。"
              : "Account and contact information, such as name, email address, phone number, language preference, and member-account and verification status."}
          </li>
          <li>
            {isZh
              ? "年龄与会员福利信息：新会员注册时收集出生年份和月份，用于确认最低年龄资格及提供生日月份相关会员权益；我们不要求新会员提供完整出生日期。"
              : "Age and membership-benefit information: for new members, we collect birth year and month to confirm minimum-age eligibility and provide birthday-month benefits; we do not require a full date of birth for new registrations."}
          </li>
          <li>
            {isZh
              ? "订单与交易信息：菜品、选项、订单备注、金额、优惠、积分或储值余额使用情况、支付状态、取餐/配送方式与时间等。"
              : "Order and transaction information, including items, options, order notes, amounts, discounts, points or Store Balance usage, payment status, fulfillment method, and timing."}
          </li>
          <li>
            {isZh
              ? "配送信息（如适用）：收货地址、联系人、电话号码、位置/地址匹配信息以及配送备注。"
              : "Delivery information where applicable, such as delivery address, contact name, phone number, location/address-matching information, and delivery notes."}
          </li>
          <li>
            {isZh
              ? "技术、安全与分析信息：IP 地址、User-Agent、浏览器或设备信息、访问路径、语言、访问时间，以及在你同意分析后产生的页面访问、加购、结账点击等事件及相关事件参数。"
              : "Technical, security, and analytics information, including IP address, User-Agent, browser or device information, page path, language, access time, and—after you consent to analytics—events such as page views, add-to-cart actions, checkout clicks, and related event parameters."}
          </li>
          <li>
            {isZh
              ? "第三方登录信息：当你使用 Google 登录时，我们接收你授权 Google 提供的基本账户信息，例如姓名、邮箱和用于识别登录账户的信息。"
              : "Third-party sign-in data: when you sign in with Google, we receive basic account information that you authorize Google to provide, such as name, email, and information used to identify the signed-in account."}
          </li>
        </ul>
      </section>

      <section className="space-y-2">
        <h2 className="text-base font-semibold">
          {isZh ? "2. 我们如何使用信息" : "2. How we use your information"}
        </h2>
        <ul className="list-disc space-y-1 pl-5">
          <li>
            {isZh
              ? "创建和维护会员账户，完成身份或联系方式验证，并管理积分、储值余额、优惠券、等级和推荐关系。"
              : "To create and maintain member accounts, complete identity or contact verification, and administer points, Store Balance, coupons, tiers, and referrals."}
          </li>
          <li>
            {isZh
              ? "处理、支付、制作、取餐或配送订单，并发送与订单、安全验证和服务履行直接相关的通知。"
              : "To process, pay for, prepare, pick up, or deliver orders and send notifications directly related to orders, security verification, and service fulfillment."}
          </li>
          <li>
            {isZh
              ? "在你明确同意营销邮件的情况下，向你发送新品、活动或优惠信息；营销订阅与订单通知、验证码等服务消息分开管理。"
              : "With your express marketing-email consent, to send information about new items, promotions, or special offers. Marketing subscriptions are managed separately from service messages such as order notifications and verification codes."}
          </li>
          <li>
            {isZh
              ? "在你同意分析追踪后，用于统计分析、改善点餐体验、排查错误和评估网站功能。"
              : "After you consent to analytics tracking, to perform analytics, improve the ordering experience, troubleshoot errors, and evaluate website features."}
          </li>
          <li>
            {isZh
              ? "预防欺诈、保护账户和系统安全、处理争议，以及遵守适用法律或有效的监管、法院及执法要求。"
              : "To prevent fraud, protect account and system security, handle disputes, and comply with applicable law or valid regulatory, court, and law-enforcement requests."}
          </li>
        </ul>
      </section>

      <section className="space-y-2">
        <h2 className="text-base font-semibold">
          {isZh ? "3. 服务供应商与信息披露" : "3. Service providers & disclosures"}
        </h2>
        <p>
          {isZh
            ? "我们不会出售你的个人信息。为提供服务，我们会仅在必要范围内向以下类别的服务供应商提供相关信息："
            : "We do not sell your personal information. To provide our services, we disclose relevant information to the following categories of providers only as reasonably necessary:"}
        </p>
        <ul className="list-disc space-y-1 pl-5">
          <li>
            {isZh
              ? "Clover：在线支付处理及支付状态相关服务。我们不在 SanQ 系统中保存完整银行卡号。"
              : "Clover, for online payment processing and payment-status services. SanQ does not store full card numbers in its own systems."}
          </li>
          <li>
            {isZh
              ? "Google：Google 登录，以及在适用情况下用于地址或地图相关功能。"
              : "Google, for Google sign-in and, where applicable, address or mapping functionality."}
          </li>
          <li>
            {isZh
              ? "SendGrid：电子邮件发送与相关送达状态处理。"
              : "SendGrid, for email delivery and related delivery-status processing."}
          </li>
          <li>
            {isZh
              ? "Twilio：短信验证码、订单或服务通知等短信功能。"
              : "Twilio, for SMS verification codes and order or service notifications."}
          </li>
          <li>
            {isZh
              ? "Uber：当订单由 Uber 提供配送或相关平台服务时，为履行相应服务提供必要信息。"
              : "Uber, when an order uses Uber for delivery or related platform services, to provide information necessary to fulfill the applicable service."}
          </li>
          <li>
            {isZh
              ? "AWS 与 Cloudflare：用于网站托管、基础设施、网络传输、安全和内容分发等技术服务。"
              : "AWS and Cloudflare, for hosting, infrastructure, network delivery, security, and content-delivery services."}
          </li>
          <li>
            {isZh
              ? "法律要求或企业运营所必要的披露：例如依法响应有效法律程序，或在发生企业重组、资产转让等事项时，在适用法律允许的范围内处理相关信息。"
              : "Disclosures required by law or reasonably necessary for business operations, such as responding to valid legal process or handling information in connection with a permitted business reorganization or asset transfer."}
          </li>
        </ul>
      </section>

      <section className="space-y-2">
        <h2 className="text-base font-semibold">
          {isZh ? "4. 数据安全与保存" : "4. Data security & retention"}
        </h2>
        <p>
          {isZh
            ? "我们采取合理的技术、组织和访问控制措施来保护个人信息。不同类别的信息会根据其用途、账户或订单存续需要、争议处理、安全需要以及适用的税务、会计或法律要求保存不同期限；当信息不再具有合理业务或法律用途时，我们会按适当方式删除、匿名化或限制继续使用。"
            : "We use reasonable technical, organizational, and access-control measures to protect personal information. Retention periods vary by data type based on the purpose for which the information is used, account or order requirements, dispute and security needs, and applicable tax, accounting, or legal obligations. When information is no longer reasonably required, we delete, anonymize, or otherwise restrict further use as appropriate."}
        </p>
      </section>

      <section className="space-y-2">
        <h2 className="text-base font-semibold">
          {isZh ? "5. 你的选择与权利" : "5. Your choices & rights"}
        </h2>
        <ul className="list-disc space-y-1 pl-5">
          <li>
            {isZh
              ? "你可以在会员中心查看和更新部分账户资料，并可联系我们申请访问或更正我们持有的个人信息；法律允许或要求的例外情况除外。"
              : "You can view and update certain account information in the Member Center and may contact us to request access to or correction of personal information we hold, subject to exceptions permitted or required by law."}
          </li>
          <li>
            {isZh
              ? "你可以在会员中心随时取消营销邮件订阅。取消营销邮件不会影响订单通知、验证码或其他必要的服务消息。"
              : "You may unsubscribe from marketing emails at any time through the Member Center. Unsubscribing from marketing email does not stop order notifications, verification codes, or other necessary service messages."}
          </li>
          <li>
            {isZh
              ? "你可以通过页脚“隐私偏好”选择、修改或撤回分析追踪同意。撤回后，新的可选分析事件将停止发送。"
              : "You may choose, change, or withdraw analytics consent through “Privacy preferences” in the footer. After withdrawal, new optional analytics events will stop being sent."}
          </li>
          <li>
            {isZh
              ? "如你希望提出隐私问题、访问/更正请求或投诉，可发送邮件至 support@sanq.ca，并注明“Privacy / 隐私”。"
              : "For privacy questions, access/correction requests, or complaints, email support@sanq.ca and include “Privacy” in the subject or message."}
          </li>
        </ul>
      </section>

      <section className="space-y-2">
        <h2 className="text-base font-semibold">
          {isZh ? "6. Cookie、本地存储与分析" : "6. Cookies, local storage & analytics"}
        </h2>
        <ul className="list-disc space-y-1 pl-5">
          <li>
            {isZh
              ? "网站会使用 Cookie、本地存储或类似技术维持登录、安全、购物车、偏好和其他必要功能。"
              : "The website uses cookies, local storage, or similar technologies for sign-in, security, cart, preference, and other necessary functionality."}
          </li>
          <li>
            {isZh
              ? "用于改进服务体验的可选分析事件只有在你同意后才会启用；分析事件可能包含页面路径、语言、事件参数，以及服务器处理请求时产生的 IP 地址和 User-Agent。"
              : "Optional analytics events used to improve the service are enabled only after you consent. Analytics records may include page path, language, event parameters, and the IP address and User-Agent associated with the server request."}
          </li>
        </ul>
      </section>

      <section className="space-y-2">
        <h2 className="text-base font-semibold">
          {isZh ? "7. 儿童隐私" : "7. Children’s privacy"}
        </h2>
        <p>
          {isZh
            ? "SanQ 会员服务不面向 13 岁以下儿童。我们会要求新会员提供出生年份和月份以进行最低年龄资格检查。如果我们发现不符合最低年龄要求的账户信息，我们可能限制该会员服务并按适用法律处理相关个人信息。"
            : "The SanQ membership service is not directed to children under 13. We require new members to provide birth year and month for minimum-age eligibility checks. If we learn that an account does not meet the minimum-age requirement, we may restrict membership services and handle the related personal information as required by applicable law."}
        </p>
      </section>

      <section className="space-y-2">
        <h2 className="text-base font-semibold">
          {isZh ? "8. 政策更新" : "8. Changes to this policy"}
        </h2>
        <p>
          {isZh
            ? "我们可能会不时更新本隐私政策，并在本页面注明新的生效日期。对于重大变化，我们会通过网站或其他合理方式通知；如新的用途或处理方式依法需要新的同意，我们会在实施前另行取得相应同意。"
            : "We may update this Privacy Policy from time to time and will state the new effective date on this page. For material changes, we will provide notice through the website or another reasonable method. Where a new purpose or processing activity requires fresh consent by law, we will obtain that consent before implementing it."}
        </p>
      </section>

      <section className="space-y-2">
        <h2 className="text-base font-semibold">
          {isZh ? "9. 隐私负责人" : "9. Privacy Officer"}
        </h2>
        <p>
          {isZh
            ? "隐私负责人：SANQIN RESTAURANT Privacy Officer。邮箱：support@sanq.ca。地址：Unit 138, 4750 Yonge St, North York, ON M2N 5M6, Canada。"
            : "Privacy Officer: SANQIN RESTAURANT Privacy Officer. Email: support@sanq.ca. Address: Unit 138, 4750 Yonge St, North York, ON M2N 5M6, Canada."}
        </p>
      </section>
    </div>
  );
}
