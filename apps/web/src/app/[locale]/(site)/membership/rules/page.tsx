// apps/web/src/app/[locale]/membership/rules/page.tsx

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
    title: isZh
      ? "三秦会员规则与积分说明"
      : "San Qin Membership Rules & Points",
  };
}

export default function MembershipRulesPage({
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
        <p className="text-xs uppercase tracking-wide text-slate-400">
          {isZh ? "会员中心" : "Member Center"}
        </p>
        <h1 className="text-2xl font-semibold text-slate-900">
          {isZh ? "会员规则与积分使用说明" : "Membership rules & points usage"}
        </h1>
        <p className="text-xs text-slate-500">
          {isZh
            ? "本页面为三秦线上会员制度的简要说明，仅适用于通过本网站注册/登录的会员账户。具体执行以网站显示和店内告示为准。"
            : "This page summarizes how the San Qin online membership system works for accounts created through this website. In case of discrepancy, the information shown on this site and in-store notices will prevail."}
        </p>
      </header>

      {/* 如何成为会员 */}
      <section className="space-y-2">
        <h2 className="text-base font-semibold text-slate-900">
          {isZh ? "1. 如何成为会员" : "1. How to become a member"}
        </h2>
        <ul className="list-disc space-y-1 pl-5">
          <li>
            {isZh
              ? "使用手机号验证，通过 Google 登录本网站，即可自动创建三秦会员账户。"
              : "Verify your phone number and sign in with Google on this website to create a San Qin member account automatically."}
          </li>
          <li>
            {isZh
              ? "每个会员账户对应一个唯一的手机号和 Google 账号，请妥善保管登录信息。"
              : "Each member account is associated with one phone number and one Google account. Please keep your login details secure."}
          </li>
          <li>
            {isZh
              ? "会员账户仅限本人使用，暂不支持合并、转让或多人共享。"
              : "Membership accounts are for personal use only and cannot currently be merged, transferred, or shared between multiple people."}
          </li>
        </ul>
      </section>

      {/* 积分获取 */}
      <section className="space-y-2">
        <h2 className="text-base font-semibold text-slate-900">
          {isZh ? "2. 积分如何获取" : "2. How points are earned"}
        </h2>
        <ul className="list-disc space-y-1 pl-5">
          <li>
            {isZh
              ? "在本网站下单并完成支付后，系统会根据“可计积分金额”（一般为餐品小计，不含税费、配送费及部分活动优惠）自动累计积分。"
              : "When you place and pay for an order on this website, points are earned automatically based on the eligible amount (typically the food subtotal, excluding tax, delivery fees, and certain promotions)."}
          </li>
          <li>
            {isZh
              ? "实际积分计算规则（如每消费多少金额可获得多少积分），以结算页和会员中心中展示的信息为准，可能会不定期优化调整。"
              : "The exact earning rate (e.g., how many points per dollar) is shown at checkout and in your Member Center and may be updated from time to time."}
          </li>
          <li>
            {isZh
              ? "使用优惠券、积分抵扣后的订单，仅剩余的“实际支付金额”参与积分计算。"
              : "If you use coupons or redeem points on an order, only the remaining amount you pay is typically eligible for earning points."}
          </li>
          <li>
            {isZh
              ? "如遇系统故障等特殊情况导致积分未发放，我们会在核实后进行补记。"
              : "If points are not granted due to system issues, we will add them after verification."}
          </li>
        </ul>
      </section>

      {/* 积分使用与限制 */}
      <section className="space-y-2">
        <h2 className="text-base font-semibold text-slate-900">
          {isZh ? "3. 积分使用与限制" : "3. Using your points"}
        </h2>
        <ul className="list-disc space-y-1 pl-5">
          <li>
            {isZh
              ? "在结算页可选择使用积分抵扣部分餐品金额，系统会显示本单最多可抵扣的金额。"
              : "At checkout, you may choose to apply points to reduce the food subtotal. The system will show the maximum discount available for that order."}
          </li>
          <li>
            {isZh
              ? "积分抵扣不找零，不可兑换为现金，仅可用于下单时抵扣餐费。"
              : "Points are non-cash and non-refundable and can only be used to discount eligible food items at checkout."}
          </li>
          <li>
            {isZh
              ? "部分活动、特价产品或套餐可能不支持积分抵扣，以页面提示为准。"
              : "Some promotions, discounted items, or bundles may not be eligible for point redemption, as indicated on the order page."}
          </li>
          <li>
            {isZh
              ? "每笔订单的使用上限、每日/每月使用频率等限制，以结算页实际展示为准。"
              : "Per-order limits and any daily or monthly caps on point usage will be shown at checkout and may change from time to time."}
          </li>
        </ul>
      </section>

      {/* 退单与积分调整 */}
      <section className="space-y-2">
        <h2 className="text-base font-semibold text-slate-900">
          {isZh ? "4. 退款、取消订单与积分调整" : "4. Refunds, cancellations & point adjustments"}
        </h2>
        <ul className="list-disc space-y-1 pl-5">
          <li>
            {isZh
              ? "如订单发生全额退款，我们会扣回本单获得的积分，并退回本单使用的积分（如有）。"
              : "If an order is fully refunded, points earned from that order may be reversed and any points redeemed on that order may be returned."}
          </li>
          <li>
            {isZh
              ? "如为部分退款，积分处理将根据实际退款金额按比例调整。"
              : "For partial refunds, point adjustments will generally be made in proportion to the refunded amount."}
          </li>
          <li>
            {isZh
              ? "如发现异常使用（例如恶意频繁下单后取消、利用漏洞刷积分等），我们有权冻结或清零相关积分，并视情况冻结账号。"
              : "If we detect abuse (such as repeated orders and cancellations, or exploiting system loopholes for points), we may freeze or remove points and, in serious cases, suspend the account."}
          </li>
        </ul>
      </section>

      {/* 会员等级（如果你后面想细化，可以把阈值填进去） */}
      <section className="space-y-2">
        <h2 className="text-base font-semibold text-slate-900">
          {isZh ? "5. 会员等级与权益" : "5. Membership tiers & benefits"}
        </h2>
        <p>
          {isZh
            ? "目前会员等级包括青铜、白银、黄金和铂金等等级，系统会根据一定周期内的消费累计自动评估等级。不同等级可能享受不同的积分倍率、专属优惠券或活动优先权等，以会员中心页面展示及实际活动说明为准。"
            : "We currently use several tiers (such as Bronze, Silver, Gold, and Platinum). Your tier is determined by your spending over a recent period. Higher tiers may offer enhanced benefits such as different earning rates, exclusive coupons, or priority access to certain promotions, as shown in the Member Center and individual campaign descriptions."}
        </p>
      </section>

      {/* 推荐人奖励 */}
      <section className="space-y-2">
        <h2 className="text-base font-semibold text-slate-900">
          {isZh ? "6. 推荐人与奖励" : "6. Referrals & rewards"}
        </h2>
        <ul className="list-disc space-y-1 pl-5">
          <li>
            {isZh
              ? "在首次注册时填写的推荐人邮箱，将作为推荐关系的唯一凭据，提交后不可新增或更改。"
              : "The referrer email you provide at first registration is used as the only proof of the referral relationship and cannot be added or changed later."}
          </li>
          <li>
            {isZh
              ? "如有推荐奖励，将发放至该推荐人的会员账户或邮箱，具体规则以活动说明为准。"
              : "If referral rewards are offered, they will be sent to the referrer’s member account or email according to the promotion details."}
          </li>
        </ul>
      </section>

      {/* 规则调整与解释权 */}
      <section className="space-y-2">
        <h2 className="text-base font-semibold text-slate-900">
          {isZh ? "7. 规则变更与解释" : "7. Changes to these rules"}
        </h2>
        <p>
          {isZh
            ? "我们可能会根据运营情况和相关法律法规，不定期更新会员规则与积分政策。重要变更会尽量通过网站公告、店内告示或邮件通知。更新后，您继续使用会员账户即视为同意新的规则。"
            : "We may update these membership rules and point policies from time to time in light of business needs and applicable laws. For significant changes, we will make reasonable efforts to notify you via this website, in-store notices, or email. By continuing to use your member account after changes take effect, you agree to the updated rules."}
        </p>
        <p className="text-xs text-slate-500">
          {isZh
            ? "本页面内容仅为一般性说明，不构成法律或财务建议。如有疑问，欢迎随时联系我们。"
            : "This page is for general information only and does not constitute legal or financial advice. If you have questions, please contact us."}
        </p>
      </section>
    </div>
  );
}
