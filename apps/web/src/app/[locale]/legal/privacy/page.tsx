// apps/web/src/app/[locale]/legal/privacy/page.tsx

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
            ? "最后更新日期：2025-12-09。本隐私政策说明我们在您使用本网站点餐和注册会员时如何收集、使用和保护您的个人信息。"
            : "Last updated: 2025-12-09. This Privacy Policy explains how we collect, use, and protect your personal information when you use this website to order food and register as a member."}
        </p>
      </header>

      <section className="space-y-2">
        <h2 className="text-base font-semibold">
          {isZh ? "1. 我们收集的信息" : "1. Information we collect"}
        </h2>
        <ul className="list-disc space-y-1 pl-5">
          <li>
            {isZh
              ? "联系信息：如姓名、手机号、电子邮箱。"
              : "Contact details such as your name, phone number, and email address."}
          </li>
          <li>
            {isZh
              ? "订单信息：包括点餐内容、金额、取餐/配送方式与时间等。"
              : "Order information, including items ordered, amounts, fulfillment method, and schedule."}
          </li>
          <li>
            {isZh
              ? "配送信息（如适用）：收货地址、联系人及备注等。"
              : "Delivery details (where applicable), such as delivery address, contact name, and notes."}
          </li>
          <li>
            {isZh
              ? "技术信息：例如浏览器类型、设备信息、访问时间等，用于改善网站体验。"
              : "Technical information such as browser type, device details, and access times to help improve the website."}
          </li>
          <li>
            {isZh
              ? "第三方登录信息：当您使用 Google 登录时，我们会从 Google 获取您选择授权的基本信息（例如姓名和邮箱）。"
              : "Third-party sign-in data: when you sign in with Google, we receive the basic information you authorize, such as your name and email address."}
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
              ? "处理和完成您的在线订单，包括与您沟通订单状态。"
              : "To process and complete your online orders, including communicating about order status."}
          </li>
          <li>
            {isZh
              ? "创建并维护您的会员账户、积分与优惠券记录。"
              : "To create and maintain your member account, points balance, and coupon records."}
          </li>
          <li>
            {isZh
              ? "在您同意的情况下，向您发送新品、活动或优惠信息。"
              : "With your consent, to send you information about new items, promotions, or special offers."}
          </li>
          <li>
            {isZh
              ? "改进网站性能与服务质量，包括统计分析与错误排查。"
              : "To improve website performance and service quality, including analytics and troubleshooting."}
          </li>
          <li>
            {isZh
              ? "遵守适用法律法规，以及配合监管或执法机构的合理要求。"
              : "To comply with applicable laws and respond to lawful requests by public authorities."}
          </li>
        </ul>
      </section>

      <section className="space-y-2">
        <h2 className="text-base font-semibold">
          {isZh ? "3. 信息分享" : "3. Sharing your information"}
        </h2>
        <p>
          {isZh
            ? "我们不会将您的个人信息出售给第三方。仅在以下情形中，我们可能会与第三方共享必要的信息："
            : "We do not sell your personal information. We may share it only in the following situations:"}
        </p>
        <ul className="list-disc space-y-1 pl-5">
          <li>
            {isZh
              ? "配送和支付服务提供商：为完成配送或处理支付所必需的有限信息。"
              : "With delivery and payment service providers, to the extent necessary to complete delivery or process your payment."}
          </li>
          <li>
            {isZh
              ? "技术服务供应商：例如网站托管、数据存储和分析服务。"
              : "With technical providers such as hosting, data storage, or analytics services."}
          </li>
          <li>
            {isZh
              ? "法律要求：在法律、法规或法院/政府机关要求的情况下。"
              : "Where required by law, regulation, or valid legal process."}
          </li>
        </ul>
      </section>

      <section className="space-y-2">
        <h2 className="text-base font-semibold">
          {isZh ? "4. 数据安全与保存期限" : "4. Data security & retention"}
        </h2>
        <p>
          {isZh
            ? "我们会采取合理的技术和管理措施，保护您的个人信息不被未经授权的访问、使用或泄露。我们只在实现本政策所述目的所需的期间内保存您的信息，除非法律要求或允许更长的保存期限。"
            : "We take reasonable technical and organizational measures to protect your information against unauthorized access, use, or disclosure. We retain your data only for as long as necessary to fulfill the purposes described here, unless a longer retention period is required or permitted by law."}
        </p>
      </section>

      <section className="space-y-2">
        <h2 className="text-base font-semibold">
          {isZh ? "5. 您的选择与权利" : "5. Your choices & rights"}
        </h2>
        <ul className="list-disc space-y-1 pl-5">
          <li>
            {isZh
              ? "您可以在会员中心查看积分和基本账户信息。如需更新或更正某些信息，可通过联系我们提出请求。"
              : "You can view your points and basic account details in the Member Center. To update or correct certain information, you may contact us."}
          </li>
          <li>
            {isZh
              ? "您可以在会员中心设置中随时取消订阅营销邮件。"
              : "You may unsubscribe from marketing emails at any time through your account settings."}
          </li>
          <li>
            {isZh
              ? "根据适用的隐私法律，您可能享有访问、更正、删除或限制处理您的个人信息等权利，具体以您所在地区的法律为准。"
              : "Depending on local laws, you may have rights to access, correct, delete, or restrict the processing of your personal information."}
          </li>
        </ul>
      </section>

      <section className="space-y-2">
        <h2 className="text-base font-semibold">
          {isZh ? "6. 政策更新" : "6. Changes to this policy"}
        </h2>
        <p>
          {isZh
            ? "我们可能会不时更新本隐私政策。重要变更将通过本网站或其他合理方式通知您。更新后继续使用本网站或会员服务，即视为您接受更新后的政策。"
            : "We may update this Privacy Policy from time to time. For significant changes, we will notify you through this website or other reasonable means. By continuing to use this website or the membership services, you agree to the updated policy."}
        </p>
      </section>
    </div>
  );
}
