// apps/web/src/app/[locale]/membership/rules/page.tsx

import type { Metadata } from "next";
import { headers } from "next/headers";
import { isLocale } from "@/lib/i18n/locales";
import type { Locale } from "@/lib/i18n/locales";
import { notFound } from "next/navigation";

type TierKey = "BRONZE" | "SILVER" | "GOLD" | "PLATINUM";

type TierRule = {
  tier: TierKey;
  thresholdCents: number;
  multiplier: number;
  earnPtPerDollar: number;
  earnValueRatePercent: number;
};

type MembershipProgramRules = {
  earnPtPerDollar: number;
  redeemDollarPerPoint: number;
  referralPtPerDollar: number;
  referralValueRatePercent: number;
  tierRules: TierRule[];
};

type ApiEnvelope<T> = {
  code: string;
  details?: T;
};

const tierLabel: Record<TierKey, { zh: string; en: string }> = {
  BRONZE: { zh: "青铜", en: "Bronze" },
  SILVER: { zh: "白银", en: "Silver" },
  GOLD: { zh: "黄金", en: "Gold" },
  PLATINUM: { zh: "铂金", en: "Platinum" },
};

async function getBaseUrl(): Promise<string | null> {
  const headerStore = await headers();
  const host =
    headerStore.get("x-forwarded-host") ?? headerStore.get("host");
  if (!host) return null;
  const proto = headerStore.get("x-forwarded-proto") ?? "http";
  return `${proto}://${host}`;
}

function unwrapEnvelope<T>(payload: unknown): T | null {
  if (!payload || typeof payload !== "object") return null;
  if ("code" in payload) {
    const envelope = payload as ApiEnvelope<T>;
    return (envelope.details ?? null) as T | null;
  }
  return payload as T;
}

async function fetchMembershipProgramRules(): Promise<MembershipProgramRules | null> {
  const baseUrl = await getBaseUrl();
  if (!baseUrl) return null;

  try {
    const response = await fetch(`${baseUrl}/api/v1/public/membership/rules`, {
      cache: "no-store",
    });
    if (!response.ok) return null;
    const payload = (await response.json().catch(() => null)) as unknown;
    return unwrapEnvelope<MembershipProgramRules>(payload);
  } catch {
    return null;
  }
}

function formatPoints(value: number, locale: Locale): string {
  return value.toLocaleString(locale === "zh" ? "zh-CN" : "en-CA", {
    maximumFractionDigits: 6,
  });
}

function formatPercent(value: number, locale: Locale): string {
  return `${value.toLocaleString(locale === "zh" ? "zh-CN" : "en-CA", {
    maximumFractionDigits: 2,
  })}%`;
}

function formatCurrencyFromCents(value: number, locale: Locale): string {
  return new Intl.NumberFormat(locale === "zh" ? "zh-CN" : "en-CA", {
    style: "currency",
    currency: "CAD",
    minimumFractionDigits: 0,
    maximumFractionDigits: 2,
  }).format(value / 100);
}

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

export default async function MembershipRulesPage({
  params,
}: {
  params: { locale: Locale };
}) {
  const { locale } = params;
  if (!isLocale(locale)) notFound();
  const isZh = locale === "zh";
  const programRules = await fetchMembershipProgramRules();

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
              ? "储值余额（Store Balance）与积分为两个独立账户。储值余额表示会员实际充值形成的预付消费金额；充值本金进入储值余额，活动赠送如以积分形式发放，则进入积分账户，不与储值本金混合。"
              : "Store Balance and points are separate accounts. Store Balance is prepaid spending value funded by the member. Top-up principal is credited to Store Balance; any promotional bonus awarded as points is credited to the points account and is not mixed with the prepaid principal."}
          </li>
          <li>
            {isZh
              ? "储值充值完成后，充值本金会计入会员累计消费金额，并可能据此推动会员等级晋升。充值本金本身不再按餐品消费的会员等级倍率重复产生普通消费积分；如当时有明确的充值赠送活动，则按该活动规则另行发放奖励。"
              : "Once a top-up is completed, the top-up principal is added to the member’s lifetime spend and may contribute to a tier upgrade. The top-up principal itself does not also earn ordinary food-purchase points at the member tier rate; any top-up bonus is awarded separately under the applicable promotion terms."}
          </li>
          <li>
            {isZh
              ? "会员之后使用储值余额支付订单时，符合条件的餐品金额仍按正常会员订单规则获得消费积分；但由于这部分储值本金在充值时已经计入累计消费，使用储值余额支付的金额不会再次计入会员等级累计消费，避免同一笔本金被重复计算。"
              : "When Store Balance is later used to pay for an order, the eligible food-purchase amount still earns ordinary purchase points under the normal membership rules. However, because that prepaid principal was already added to lifetime spend when topped up, the amount paid with Store Balance is not added to tier-qualifying lifetime spend again."}
          </li>
          <li>
            {isZh
              ? "储值充值本金原则上不可提现，也不退回现金或原支付方式；法律另有要求，或经我们核实属于重复扣款、支付错误或系统错误等情况除外。会员账户目前也不支持将储值余额转移给其他会员。"
              : "Top-up principal is generally not cash-withdrawable and is not returned to cash or the original payment method, except where required by law or where we verify a duplicate charge, payment error, system error, or similar issue. Store Balance also cannot currently be transferred to another member account."}
          </li>
          <li>
            {isZh
              ? "如果一笔使用储值余额支付的订单符合退款条件，已用于该订单的应退储值金额原则上退回原会员账户的 Store Balance，而不是改为现金退款；具体退款处理仍以退款政策和实际退款原因适用。"
              : "If an order paid with Store Balance qualifies for a refund, the refundable Store Balance amount used on that order is generally restored to the same member’s Store Balance rather than converted to a cash refund. The Refund Policy and the actual reason for the refund continue to govern the final treatment."}
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
              ? "部分退款时，积分会根据实际退款内容、符合条件的消费金额及适用活动规则进行相应调整。用于支付该订单的储值余额如应退，会退回 Store Balance；由于这部分本金在充值时已经计入累计消费，订单退款时不会再把同一笔储值支付金额从会员等级累计消费中重复扣减，等级只按该订单实际计入过的非储值消费部分调整。"
              : "For a partial refund, points are adjusted based on the refunded items or amount, the remaining eligible spend, and applicable promotion rules. Any refundable Store Balance used on the order is restored to Store Balance; because that prepaid principal was already counted at top-up, the same balance-funded amount is not deducted from tier-qualifying lifetime spend a second time. Tier spend is adjusted only for the non-balance portion that was actually added by the order."}
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
            ? "会员等级目前包括青铜、白银、黄金和铂金。等级以会员账户的累计消费金额为标准；普通订单按优惠后、税前的符合条件餐品金额计算，其中积分抵扣部分不计入等级累计，使用储值余额支付的部分也不再次计入等级累计，因为对应储值本金在充值完成时已经计入过累计消费。"
            : "Current membership tiers are Bronze, Silver, Gold, and Platinum. Tier status is based on the member account’s lifetime spend. For ordinary orders, tier-qualifying spend is generally the eligible food amount after discounts and before tax, excluding redeemed-point value and the portion paid with Store Balance because that prepaid principal was already counted when the top-up was completed."}
        </p>
        {programRules ? (
          <div className="space-y-2">
            <div className="overflow-x-auto rounded-xl ring-1 ring-slate-200">
              <table className="min-w-full divide-y divide-slate-200 text-left text-xs">
                <thead className="bg-slate-50 text-slate-600">
                  <tr>
                    <th className="px-3 py-2 font-medium">
                      {isZh ? "会员等级" : "Tier"}
                    </th>
                    <th className="px-3 py-2 font-medium">
                      {isZh ? "累计消费门槛" : "Lifetime spend threshold"}
                    </th>
                    <th className="px-3 py-2 font-medium">
                      {isZh ? "积分获取" : "Points earning"}
                    </th>
                    <th className="px-3 py-2 font-medium">
                      {isZh ? "等值奖励率" : "Equivalent reward rate"}
                    </th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 bg-white">
                  {programRules.tierRules.map((rule) => (
                    <tr key={rule.tier}>
                      <td className="px-3 py-2 font-medium text-slate-900">
                        {tierLabel[rule.tier][isZh ? "zh" : "en"]}
                      </td>
                      <td className="px-3 py-2 text-slate-700">
                        {rule.tier === "BRONZE"
                          ? isZh
                            ? "注册会员"
                            : "Upon joining"
                          : formatCurrencyFromCents(rule.thresholdCents, locale)}
                      </td>
                      <td className="px-3 py-2 text-slate-700">
                        {formatPoints(rule.earnPtPerDollar, locale)} pt / CAD $1
                        {rule.multiplier !== 1
                          ? ` (${formatPoints(rule.multiplier, locale)}×)`
                          : ""}
                      </td>
                      <td className="px-3 py-2 text-slate-700">
                        {formatPercent(rule.earnValueRatePercent, locale)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <p className="text-xs text-slate-500">
              {isZh
                ? `当前积分兑换价值：1 pt = ${formatCurrencyFromCents(programRules.redeemDollarPerPoint * 100, locale)}。表中“等值奖励率”按当前积分兑换价值折算。`
                : `Current point redemption value: 1 pt = ${formatCurrencyFromCents(programRules.redeemDollarPerPoint * 100, locale)}. The equivalent reward rate above is calculated using the current redemption value.`}
            </p>
          </div>
        ) : (
          <p className="rounded-lg bg-amber-50 px-3 py-2 text-xs text-amber-800 ring-1 ring-amber-200">
            {isZh
              ? "当前会员等级与积分信息暂时无法显示，请以结算页和会员中心显示的信息为准。"
              : "Current membership tier and points information is temporarily unavailable. Please refer to the information shown at checkout and in the Member Center."}
          </p>
        )}
        <ul className="list-disc space-y-1 pl-5">
          <li>
            {isZh
              ? "会员等级在符合条件的订单或储值充值完成结算后重新计算。因退款、改单或其他结算调整导致累计消费减少时，会员等级也会按调整后的累计消费重新计算。"
              : "Tier status is recalculated after an eligible order or Store Balance top-up is settled. If a refund, order amendment, or other settlement adjustment reduces lifetime spend, the tier is recalculated from the adjusted lifetime spend."}
          </li>
          <li>
            {isZh
              ? "不同等级除积分倍率外，还可能获得等级升级优惠券、会员专属活动或其他权益；具体权益以会员中心和相关活动当时显示的规则为准。"
              : "In addition to different point earning rates, tiers may receive tier-upgrade coupons, member-only promotions, or other benefits. The Member Center and applicable promotion terms govern the specific benefit available at the relevant time."}
          </li>
        </ul>
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
        </ul>
        {programRules ? (
          <div className="rounded-xl bg-slate-50 p-3 text-xs text-slate-700 ring-1 ring-slate-200">
            <p className="font-medium text-slate-900">
              {isZh ? "当前推荐人奖励" : "Current referral reward"}
            </p>
            <p className="mt-1">
              {isZh
                ? `推荐人按符合条件的新增消费金额，每 CAD $1 获得 ${formatPoints(programRules.referralPtPerDollar, locale)} pt；按当前积分兑换价值折算，约为 ${formatPercent(programRules.referralValueRatePercent, locale)} 的奖励价值。`
                : `The referrer earns ${formatPoints(programRules.referralPtPerDollar, locale)} pt for each CAD $1 of eligible new spend. At the current point redemption value, that is approximately ${formatPercent(programRules.referralValueRatePercent, locale)} in reward value.`}
            </p>
          </div>
        ) : (
          <p className="rounded-lg bg-amber-50 px-3 py-2 text-xs text-amber-800 ring-1 ring-amber-200">
            {isZh
              ? "当前推荐奖励信息暂时无法显示，请以会员中心和适用活动规则为准。"
              : "Current referral reward information is temporarily unavailable. Please refer to the Member Center and applicable promotion terms."}
          </p>
        )}
        <ul className="list-disc space-y-1 pl-5">
          <li>
            {isZh
              ? "被推荐会员完成符合条件的普通订单后，推荐奖励按该订单实际新增消费金额计算。优惠、积分抵扣以及本单使用的储值余额会从推荐奖励基数中扣除，避免同一笔预付资金在充值和后续消费时重复给推荐人发奖。"
              : "After the referred member completes an eligible ordinary order, the referral reward is calculated from the order’s eligible new spend. Discounts, redeemed points, and Store Balance used on that order are excluded from the referral-reward base so the same prepaid funds are not rewarded twice at top-up and again when spent."}
          </li>
          <li>
            {isZh
              ? "被推荐会员进行储值充值时，充值金额本身也属于新增消费，推荐人会按当前推荐奖励比例获得对应积分；之后使用该储值余额消费时，余额支付部分不会再次产生推荐奖励。"
              : "When the referred member tops up Store Balance, the top-up amount itself is treated as new spend and the referrer earns points at the current referral rate. When that Store Balance is later spent, the balance-funded portion does not generate another referral reward."}
          </li>
          <li>
            {isZh
              ? "普通订单发生退款或改单并减少符合条件的消费金额时，已发放的推荐奖励会按实际调整结果相应扣回或修正。推荐奖励的具体有效性还受当时适用的活动规则和反滥用规则约束。"
              : "If an ordinary order is refunded or amended and the eligible spend is reduced, referral rewards already issued are reversed or adjusted accordingly. Referral rewards also remain subject to the applicable promotion terms and anti-abuse rules in effect at the time."}
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
