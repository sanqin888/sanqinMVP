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
            ? "生效及最后更新日期：2026-08-22。本规则适用于由 SANQIN RESTAURANT 运营的 SanQ Roujiamo（三秦肉夹馍）网站会员服务。具体活动如另有明确规则，以该活动规则为准；适用法律另有规定的，从其规定。"
            : "Effective and last updated: 2026-08-22. These rules apply to the SanQ Roujiamo membership service operated by SANQIN RESTAURANT. If a specific promotion has clearly stated terms, those terms apply to that promotion; applicable law prevails where required."}
        </p>
      </header>

      <section className="space-y-2">
        <h2 className="text-base font-semibold text-slate-900">
          {isZh ? "1. 会员资格与账户" : "1. Eligibility & accounts"}
        </h2>
        <ul className="list-disc space-y-1 pl-5">
          <li>
            {isZh
              ? "会员服务不面向 13 岁以下儿童。新会员注册时，我们会收集出生年份和月份，用于确认最低年龄资格及提供生日月份相关会员权益。"
              : "The membership service is not available to children under 13. During new-member registration, we collect birth year and month to confirm minimum-age eligibility and provide birthday-month membership benefits."}
          </li>
          <li>
            {isZh
              ? "完成本网站要求的登录及联系方式验证后，可创建会员账户。每个会员账户应由本人使用，并应保持账户信息真实、准确。"
              : "A member account may be created after completing the sign-in and contact-verification steps required by this website. Each account is for the member’s own use, and account information should be kept accurate."}
          </li>
          <li>
            {isZh
              ? "会员账户暂不支持合并、转让或多人共享。请妥善保管登录信息；如发现未经授权使用，请尽快联系我们。"
              : "Membership accounts cannot currently be merged, transferred, or shared. Keep your sign-in details secure and contact us promptly if you suspect unauthorized use."}
          </li>
        </ul>
      </section>

      <section className="space-y-2">
        <h2 className="text-base font-semibold text-slate-900">
          {isZh ? "2. 积分如何获取" : "2. How points are earned"}
        </h2>
        <ul className="list-disc space-y-1 pl-5">
          <li>
            {isZh
              ? "在本网站完成符合条件的订单后，系统会根据可计积分金额自动累计积分。可计积分金额通常以符合条件的餐品金额为基础，不包含税费、配送费，并可能排除部分优惠、活动或其他不参与积分的金额。"
              : "After an eligible order is completed on this website, points are earned automatically based on the eligible amount. The eligible amount is generally based on qualifying food purchases, excluding taxes and delivery fees, and may exclude certain promotions or other non-qualifying amounts."}
          </li>
          <li>
            {isZh
              ? "实际积分倍率、等级加成和当单可获得积分，以结算页、会员中心及适用活动规则中当时明确展示的信息为准。"
              : "The earning rate, tier multiplier, and points available for a particular order are determined by the information clearly shown at checkout, in the Member Center, and in any applicable promotion terms at that time."}
          </li>
          <li>
            {isZh
              ? "使用优惠券、积分或其他折扣后，积分通常按符合条件的剩余实际消费金额计算。"
              : "After coupons, points, or other discounts are applied, points are generally calculated on the remaining eligible purchase amount."}
          </li>
          <li>
            {isZh
              ? "如因系统故障等原因造成应得积分未正确记录，我们会在核实订单后进行更正。"
              : "If eligible points are recorded incorrectly because of a system issue, we will correct the record after verifying the order."}
          </li>
        </ul>
      </section>

      <section className="space-y-2">
        <h2 className="text-base font-semibold text-slate-900">
          {isZh ? "3. 积分与储值余额" : "3. Points & store balance"}
        </h2>
        <ul className="list-disc space-y-1 pl-5">
          <li>
            {isZh
              ? "积分属于会员奖励，不是现金。积分仅可按结算页显示的方式用于符合条件的消费，不可提现或兑换现金。"
              : "Points are loyalty rewards, not cash. They may be used only for eligible purchases as shown at checkout and cannot be withdrawn or exchanged for cash."}
          </li>
          <li>
            {isZh
              ? "储值余额（Store Balance）与积分为两个独立账户。储值余额表示顾客实际充值形成的可消费金额，不会与奖励积分合并计算。"
              : "Store Balance and points are separate accounts. Store Balance represents spendable value funded by the customer and is not combined with loyalty points."}
          </li>
          <li>
            {isZh
              ? "部分特价、套餐或活动可能不支持积分抵扣；每笔订单实际可抵扣金额和适用限制会在结算时显示。"
              : "Some specials, bundles, or promotions may not be eligible for point redemption. The amount actually redeemable and any applicable limits will be shown at checkout."}
          </li>
        </ul>
      </section>

      <section className="space-y-2">
        <h2 className="text-base font-semibold text-slate-900">
          {isZh ? "4. 退款、取消与积分调整" : "4. Refunds, cancellations & point adjustments"}
        </h2>
        <ul className="list-disc space-y-1 pl-5">
          <li>
            {isZh
              ? "订单全额退款时，本单获得的积分会被扣回，本单实际使用的积分会相应退回。"
              : "When an order is fully refunded, points earned from that order will be reversed and points actually redeemed on that order will be restored accordingly."}
          </li>
          <li>
            {isZh
              ? "部分退款时，积分会根据实际退款内容、符合条件的消费金额及适用活动规则进行相应调整。"
              : "For a partial refund, points will be adjusted based on the refunded items or amount, the remaining eligible spend, and any applicable promotion rules."}
          </li>
          <li>
            {isZh
              ? "如有合理依据认为账户存在欺诈、利用系统漏洞、恶意刷取奖励或其他严重滥用，我们可在必要范围内暂停相关权益或账户并进行核查；如你认为处理有误，可联系我们复核。"
              : "Where we have reasonable grounds to believe an account is involved in fraud, exploitation of a system defect, abusive reward activity, or other serious misuse, we may suspend affected benefits or the account as reasonably necessary while we investigate. You may contact us if you believe the action was taken in error."}
          </li>
        </ul>
      </section>

      <section className="space-y-2">
        <h2 className="text-base font-semibold text-slate-900">
          {isZh ? "5. 会员等级与权益" : "5. Membership tiers & benefits"}
        </h2>
        <p>
          {isZh
            ? "会员等级目前包括青铜、白银、黄金和铂金等等级。等级根据系统当时公布的评估周期、符合条件的消费及相关规则计算。不同等级可享有不同积分倍率、专属优惠券或其他权益，具体以会员中心和相关活动说明为准。"
            : "Current membership tiers include Bronze, Silver, Gold, and Platinum. Tiers are calculated using the evaluation period, eligible spending, and rules published by the system at the relevant time. Benefits may include different point multipliers, exclusive coupons, or other member benefits as shown in the Member Center and applicable promotion terms."}
        </p>
      </section>

      <section className="space-y-2">
        <h2 className="text-base font-semibold text-slate-900">
          {isZh ? "6. 推荐人与奖励" : "6. Referrals & rewards"}
        </h2>
        <ul className="list-disc space-y-1 pl-5">
          <li>
            {isZh
              ? "推荐人只能在新会员首次注册流程中填写。被推荐人输入推荐人的会员邮箱后，系统会将推荐关系绑定至对应会员账户；提交或选择跳过后，不能再新增或更改推荐关系。"
              : "A referrer may be entered only during the new member’s initial registration flow. After the new member enters the referrer’s member email, the system binds the referral to that member account. Once submitted or skipped, a referral cannot later be added or changed."}
          </li>
          <li>
            {isZh
              ? "邮箱仅用于注册时识别推荐人；推荐关系实际绑定至推荐人的会员账户，因此推荐人之后更新邮箱不会改变既有推荐关系。"
              : "The email is used only to identify the referrer during registration. The referral is actually bound to the referrer’s member account, so a later email change does not alter an existing referral relationship."}
          </li>
          <li>
            {isZh
              ? "如有推荐奖励，其发放条件、奖励内容、有效期及其他限制以当时的推荐活动规则为准。"
              : "Where referral rewards are offered, qualification, reward value, validity, and other restrictions are governed by the referral promotion terms in effect at that time."}
          </li>
        </ul>
      </section>

      <section className="space-y-2">
        <h2 className="text-base font-semibold text-slate-900">
          {isZh ? "7. 规则变更" : "7. Changes to these rules"}
        </h2>
        <p>
          {isZh
            ? "我们可能因运营、产品或法律要求更新会员规则。更新后的规则自注明的生效日期起适用于后续使用和交易，原则上不会追溯改变已完成订单的结算结果。涉及既有积分、优惠券或其他重要会员权益的重大调整，我们会通过网站、会员中心、电子邮件或其他合理方式说明生效时间和处理方式。"
            : "We may update these membership rules for operational, product, or legal reasons. Updated rules apply to future use and transactions from the stated effective date and generally do not retroactively change completed-order settlements. For material changes affecting existing points, coupons, or other significant member benefits, we will explain the effective date and treatment through the website, Member Center, email, or another reasonable method."}
        </p>
      </section>

      <section className="space-y-2">
        <h2 className="text-base font-semibold text-slate-900">
          {isZh ? "8. 联系我们" : "8. Contact us"}
        </h2>
        <p>
          {isZh
            ? "如对会员账户、积分、推荐关系或会员权益有疑问，请通过网站“联系我们”页面与 SANQIN RESTAURANT 联系。"
            : "For questions about your member account, points, referrals, or membership benefits, please contact SANQIN RESTAURANT through the website’s Contact page."}
        </p>
      </section>
    </div>
  );
}
