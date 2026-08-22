"use client";

import { useEffect, useState } from "react";
import { apiFetch } from "@/lib/api/client";
import type { Locale } from "@/lib/i18n/locales";

type MemberTier = "BRONZE" | "SILVER" | "GOLD" | "PLATINUM";

type MembershipProgramRules = {
  earnPtPerDollar: number;
  redeemDollarPerPoint: number;
  referralPtPerDollar: number;
  referralValueRatePercent: number;
  tierRules: Array<{
    tier: MemberTier;
    thresholdPoints: number;
    earnPtPerDollar: number;
    earnValueRatePercent: number;
    multiplier: number;
  }>;
};

const TIER_LABELS: Record<Locale, Record<MemberTier, string>> = {
  zh: {
    BRONZE: "青铜会员",
    SILVER: "白银会员",
    GOLD: "黄金会员",
    PLATINUM: "铂金会员",
  },
  en: {
    BRONZE: "Bronze",
    SILVER: "Silver",
    GOLD: "Gold",
    PLATINUM: "Platinum",
  },
};

function formatNumber(
  value: number,
  locale: Locale,
  maximumFractionDigits = 6,
) {
  return new Intl.NumberFormat(locale === "zh" ? "zh-CN" : "en-CA", {
    maximumFractionDigits,
  }).format(value);
}

function formatPercent(value: number, locale: Locale) {
  return `${formatNumber(value, locale, 2)}%`;
}

function formatMoney(value: number, locale: Locale) {
  return new Intl.NumberFormat(locale === "zh" ? "zh-CN" : "en-CA", {
    style: "currency",
    currency: "CAD",
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(value);
}

export default function MembershipRulesPage({
  params,
}: {
  params: { locale: Locale };
}) {
  const locale = params.locale;
  const isZh = locale === "zh";
  const [programRules, setProgramRules] =
    useState<MembershipProgramRules | null>(null);
  const [rulesError, setRulesError] = useState(false);

  useEffect(() => {
    let cancelled = false;

    void apiFetch<MembershipProgramRules>("/public/membership/rules", {
      cache: "no-store",
    })
      .then((data) => {
        if (cancelled) return;
        setProgramRules(data);
        setRulesError(false);
      })
      .catch(() => {
        if (cancelled) return;
        setRulesError(true);
      });

    return () => {
      cancelled = true;
    };
  }, []);

  return (
    <div className="space-y-6 text-sm text-slate-800">
      <header className="space-y-2">
        <p className="text-xs uppercase tracking-wide text-slate-400">
          {isZh ? "会员中心" : "Member Center"}
        </p>
        <h1 className="text-2xl font-semibold text-slate-900">
          {isZh
            ? "会员规则与积分使用说明"
            : "Membership rules & points usage"}
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
              ? "完成符合条件的订单后，系统按优惠后的符合条件餐品金额计算消费积分；税费、配送费以及不参与积分的金额不计入。"
              : "After an eligible order is completed, purchase points are calculated from qualifying food purchases after discounts. Taxes, delivery fees, and other non-qualifying amounts do not earn points."}
          </li>
          <li>
            {isZh
              ? "使用积分抵扣的金额不会再次赚取消费积分；使用储值余额支付符合条件的餐品金额仍可按当前会员等级正常获得消费积分。"
              : "Amounts covered by point redemption do not earn purchase points again. Eligible food purchases paid with Store Balance still earn purchase points at the member’s current tier rate."}
          </li>
          <li>
            {isZh
              ? "适用的积分倍率活动会叠加在会员等级积分获取率之上；实际到账的消费积分计入历史累计消费积分，因此会影响会员等级进度。"
              : "Applicable points-multiplier promotions are applied on top of the tier earning rate. Purchase points actually credited count toward lifetime purchase points and therefore tier progress."}
          </li>
          <li>
            {isZh
              ? "推荐奖励、充值赠送及人工调整积分会改变可用积分余额，但不属于消费积分，不增加历史累计消费积分，也不会直接推动会员等级。"
              : "Referral rewards, top-up bonuses, and manual point adjustments can change the available points balance, but they are not purchase points and do not increase lifetime purchase points or directly advance membership tier."}
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
          {programRules && (
            <li>
              {isZh
                ? `当前积分抵扣价值为 1 pt = ${formatMoney(programRules.redeemDollarPerPoint, locale)}。`
                : `The current redemption value is 1 pt = ${formatMoney(programRules.redeemDollarPerPoint, locale)}.`}
            </li>
          )}
          <li>
            {isZh
              ? "储值余额（Store Balance）与积分是两个独立账户。储值余额表示顾客实际充值形成的可消费金额，不与奖励积分合并计算。"
              : "Store Balance and points are separate accounts. Store Balance represents spendable value funded by the customer and is not combined with loyalty points."}
          </li>
          <li>
            {isZh
              ? "部分特价、套餐或活动可能不支持积分抵扣；每笔订单实际可抵扣金额和适用限制以结算页显示为准。"
              : "Some specials, bundles, or promotions may not be eligible for point redemption. The amount actually redeemable and any applicable limits are shown at checkout."}
          </li>
        </ul>
      </section>

      <section className="space-y-2">
        <h2 className="text-base font-semibold text-slate-900">
          {isZh
            ? "4. 退款、取消与积分调整"
            : "4. Refunds, cancellations & point adjustments"}
        </h2>
        <ul className="list-disc space-y-1 pl-5">
          <li>
            {isZh
              ? "订单全额退款时，本单获得的消费积分会被扣回，本单实际使用的积分会相应退回；被扣回的消费积分也会从历史累计消费积分中扣除，并据此重新计算会员等级。"
              : "When an order is fully refunded, purchase points earned from that order are reversed and points redeemed on that order are restored. Reversed purchase points are also removed from lifetime purchase points, and tier is recalculated accordingly."}
          </li>
          <li>
            {isZh
              ? "部分退款或改单时，消费积分会按调整后的符合条件消费金额修正；历史累计消费积分和会员等级使用修正后的积分结果。"
              : "For a partial refund or order amendment, purchase points are adjusted to the updated eligible purchase amount. Lifetime purchase points and tier use the adjusted result."}
          </li>
          <li>
            {isZh
              ? "如有合理依据认为账户存在欺诈、利用系统漏洞、恶意刷取奖励或其他严重滥用，我们可在必要范围内暂停相关权益或账户并进行核查；如你认为处理有误，可联系我们复核。"
              : "Where we have reasonable grounds to believe an account is involved in fraud, exploitation of a system defect, abusive reward activity, or other serious misuse, we may suspend affected benefits or the account as reasonably necessary while we investigate. You may contact us if you believe the action was taken in error."}
          </li>
        </ul>
      </section>

      <section className="space-y-3">
        <h2 className="text-base font-semibold text-slate-900">
          {isZh
            ? "5. 会员等级与积分获取率"
            : "5. Membership tiers & earning rates"}
        </h2>
        <p>
          {isZh
            ? "会员等级按历史累计消费积分自动计算。历史累计消费积分是符合条件的消费实际获得、并在退款或改单后仍有效的消费积分累计值。使用积分抵扣不会因为积分被花掉而降低该累计值；退款或改单导致的消费积分冲回则会相应降低。"
            : "Membership tier is calculated automatically from lifetime purchase points. Lifetime purchase points are the cumulative purchase points actually earned from eligible purchases and still valid after refunds or amendments. Redeeming points does not reduce this lifetime total, but purchase-point reversals caused by refunds or amendments do."}
        </p>

        {programRules ? (
          <div className="overflow-x-auto rounded-xl border border-slate-200">
            <table className="min-w-full text-left text-xs">
              <thead className="bg-slate-50 text-slate-500">
                <tr>
                  <th className="px-3 py-2 font-medium">
                    {isZh ? "等级" : "Tier"}
                  </th>
                  <th className="px-3 py-2 font-medium">
                    {isZh
                      ? "晋升所需历史消费积分"
                      : "Lifetime purchase points required"}
                  </th>
                  <th className="px-3 py-2 font-medium">
                    {isZh ? "积分获取率" : "Earning rate"}
                  </th>
                  <th className="px-3 py-2 font-medium">
                    {isZh ? "每 $1 可得" : "Points per $1"}
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 bg-white">
                {programRules.tierRules.map((rule) => (
                  <tr key={rule.tier}>
                    <td className="px-3 py-2 font-medium text-slate-900">
                      {TIER_LABELS[locale][rule.tier]}
                    </td>
                    <td className="px-3 py-2">
                      {rule.tier === "BRONZE"
                        ? isZh
                          ? "注册会员即可"
                          : "Member registration"
                        : `${formatNumber(rule.thresholdPoints, locale)} pt`}
                    </td>
                    <td className="px-3 py-2">
                      {formatPercent(rule.earnValueRatePercent, locale)}
                    </td>
                    <td className="px-3 py-2">
                      {formatNumber(rule.earnPtPerDollar, locale)} pt
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <p className="rounded-lg bg-slate-50 px-3 py-2 text-xs text-slate-500">
            {rulesError
              ? isZh
                ? "当前会员等级参数暂时无法读取，请稍后刷新。"
                : "Current membership tier parameters are temporarily unavailable. Please refresh later."
              : isZh
                ? "正在读取当前会员等级参数…"
                : "Loading current membership tier parameters…"}
          </p>
        )}

        <p className="text-xs text-slate-500">
          {isZh
            ? "表中的积分获取率按当前积分抵扣价值换算，用于直观表示奖励价值；实际到账积分以“每 $1 可得”以及结算时适用的活动倍率计算。等级参数由当前会员业务配置提供，配置更新后本页会同步显示新的有效规则。"
            : "The earning-rate percentage is an equivalent reward-value rate using the current point redemption value. Actual points credited are calculated from the points-per-$1 rate plus any applicable promotion multiplier. Tier parameters come from the active membership business configuration, so this page updates when those rules change."}
        </p>
      </section>

      <section className="space-y-2">
        <h2 className="text-base font-semibold text-slate-900">
          {isZh
            ? "6. 推荐人与推荐奖励"
            : "6. Referrals & referral rewards"}
        </h2>
        <ul className="list-disc space-y-1 pl-5">
          <li>
            {isZh
              ? "推荐人只能在新会员首次注册流程中填写。被推荐人输入推荐人的会员邮箱后，系统将推荐关系绑定至对应会员账户；提交或选择跳过后，不能再新增或更改推荐关系。"
              : "A referrer may be entered only during the new member’s initial registration flow. After the new member enters the referrer’s member email, the system binds the referral to that member account. Once submitted or skipped, a referral cannot later be added or changed."}
          </li>
          <li>
            {isZh
              ? "邮箱仅用于注册时识别推荐人；推荐关系实际绑定至推荐人的会员账户，因此推荐人之后更新邮箱不会改变既有推荐关系。"
              : "The email is used only to identify the referrer during registration. The referral is bound to the referrer’s member account, so a later email change does not alter an existing referral relationship."}
          </li>
          {programRules && (
            <li>
              {isZh
                ? `当前推荐奖励率为 ${formatNumber(programRules.referralPtPerDollar, locale)} pt / $1（按当前积分抵扣价值约等于 ${formatPercent(programRules.referralValueRatePercent, locale)}）。被推荐人产生符合条件的订单消费后，推荐人按可计推荐金额获得积分。`
                : `The current referral reward rate is ${formatNumber(programRules.referralPtPerDollar, locale)} pt per $1 (equivalent to about ${formatPercent(programRules.referralValueRatePercent, locale)} at the current redemption value). When the referred member makes an eligible purchase, the referrer earns points based on the referral-eligible amount.`}
            </li>
          )}
          <li>
            {isZh
              ? "订单推荐奖励的可计金额以优惠后的符合条件餐品小计为基础，并扣除积分抵扣及储值余额支付部分，避免同一资金在充值和消费两个环节重复产生推荐奖励。符合条件的储值充值本身也会按充值金额计算推荐积分。"
              : "For an order, the referral-eligible amount starts from the qualifying food subtotal after discounts and excludes amounts paid with redeemed points or Store Balance, preventing the same funds from generating referral rewards at both top-up and purchase. A qualifying Store Balance top-up itself can also generate referral points based on the top-up amount."}
          </li>
          <li>
            {isZh
              ? "推荐奖励进入推荐人的可用积分账户，但不属于推荐人的消费积分，不计入历史累计消费积分，因此不会直接推动推荐人的会员等级。"
              : "Referral rewards are credited to the referrer’s available points balance, but they are not the referrer’s purchase points. They do not count toward lifetime purchase points or directly advance the referrer’s membership tier."}
          </li>
          <li>
            {isZh
              ? "被推荐人的订单全额退款时，对应推荐奖励会被冲回；订单发生改单或部分调整时，推荐奖励会按调整后的有效金额相应修正。"
              : "If the referred member’s order is fully refunded, the related referral reward is reversed. If an order is amended or partially adjusted, the referral reward is adjusted to the updated eligible amount."}
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
