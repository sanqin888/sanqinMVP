// apps/web/src/app/[locale]/legal/terms/page.tsx

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
            ? "使用本网站下单或注册会员，即表示你同意以下条款。如不同意任何条款，请不要继续使用本网站。"
            : "By using this website to place orders or register as a member, you agree to these terms. If you do not agree, please do not use this website."}
        </p>
      </header>

      <section className="space-y-2">
        <h2 className="text-base font-semibold">
          {isZh ? "1. 网站服务" : "1. Website services"}
        </h2>
        <p>
          {isZh
            ? "本网站用于展示菜单、接受线上订单及提供会员积分等相关服务。我们保留随时更改菜单、价格、营业时间、配送/自取范围及其他服务内容的权利。"
            : "This website is provided to display our menu, accept online orders, and offer membership and points services. We reserve the right to change the menu, prices, operating hours, delivery/pickup options, and other services at any time."}
        </p>
      </section>

      <section className="space-y-2">
        <h2 className="text-base font-semibold">
          {isZh ? "2. 账户与安全" : "2. Accounts & security"}
        </h2>
        <ul className="list-disc space-y-1 pl-5">
          <li>
            {isZh
              ? "你需确保注册信息真实、准确，并及时更新。"
              : "You must ensure that the information you provide when registering is accurate and kept up to date."}
          </li>
          <li>
            {isZh
              ? "你有责任保管好登录凭据，不得将账户转让或与他人共享。"
              : "You are responsible for keeping your login credentials secure and must not transfer or share your account."}
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
          {isZh ? "3. 订单与价格" : "3. Orders & pricing"}
        </h2>
        <ul className="list-disc space-y-1 pl-5">
          <li>
            {isZh
              ? "所有价格以结算页显示为准，可能因促销、税费或配送费而发生变化。"
              : "All prices are as shown on the checkout page and may change due to promotions, taxes, or delivery fees."}
          </li>
          <li>
            {isZh
              ? "下单成功并完成支付后，视为你已确认订单内容及金额。"
              : "Once you place an order and complete payment, you are deemed to have confirmed the order details and amount."}
          </li>
          <li>
            {isZh
              ? "如因库存不足或其他原因无法完成订单，我们会尽量联系你协商替换或退款。"
              : "If we are unable to fulfill an order due to stock or other issues, we will make reasonable efforts to contact you to arrange an alternative or a refund."}
          </li>
        </ul>
      </section>

      <section className="space-y-2">
        <h2 className="text-base font-semibold">
          {isZh ? "4. 免责声明" : "4. Disclaimers"}
        </h2>
        <p>
          {isZh
            ? "在适用法律允许的最大范围内，本网站按“现状”提供。尽管我们会尽力保持网站运行稳定并确保信息准确，但无法保证网站不存在中断、延迟或错误。因网络故障、第三方系统或不可抗力导致的订单异常、延误或取消，我们将尽量协助处理，但不对由此产生的间接损失承担责任。"
            : "To the fullest extent permitted by law, this website is provided on an “as is” basis. While we strive to keep the website available and information accurate, we cannot guarantee that it will be free from interruptions, delays, or errors. We will assist with issues arising from network failures, third-party systems, or force majeure events, but are not liable for indirect losses caused by such events."}
        </p>
      </section>

      <section className="space-y-2">
        <h2 className="text-base font-semibold">
          {isZh ? "5. 禁止行为" : "5. Prohibited activities"}
        </h2>
        <p>
          {isZh
            ? "你同意不会以任何非法方式或可能影响网站正常运行的方式使用本网站，包括但不限于：恶意下单、刷单、尝试入侵系统、批量抓取数据等。一经发现，我们有权限制或终止你的访问及会员资格，并视情况依法追究责任。"
            : "You agree not to use this website for any unlawful purpose or in any way that could disrupt its normal operation, including but not limited to fraudulent orders, bulk abuse, attempts to hack or scrape data at scale. We may restrict or terminate access and membership in such cases and may take further action as permitted by law."}
        </p>
      </section>

      <section className="space-y-2">
        <h2 className="text-base font-semibold">
          {isZh ? "6. 条款更新与适用法律" : "6. Changes & governing law"}
        </h2>
        <p>
          {isZh
            ? "我们可能会不时更新本网站条款。更新后的条款一经在网站发布，立即生效。你继续使用本网站即视为接受更新后的条款。本条款的解释及适用，以门店所在司法辖区的相关法律为准。"
            : "We may update these terms from time to time. Updated terms take effect once posted on this website. Your continued use of the website means you accept the updated terms. These terms are governed by the laws of the jurisdiction where our restaurant is located."}
        </p>
      </section>
    </div>
  );
}
