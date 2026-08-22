import Link from 'next/link';

type PromotionsPageProps = {
  params: Promise<{ locale: string }>;
};

export default async function PromotionsPage({ params }: PromotionsPageProps) {
  const { locale } = await params;
  const safeLocale = locale === 'zh' ? 'zh' : 'en';
  const isZh = safeLocale === 'zh';
  const baseHref = `/${safeLocale}/admin/promotions`;

  const modules = [
    {
      href: `${baseHref}/specials`,
      title: isZh ? '商品特价' : 'Item specials',
      description: isZh
        ? '管理现有每日特价。第一阶段保持现有后端和定价逻辑不变。'
        : 'Manage existing daily specials while preserving the current backend and pricing behavior.',
      action: isZh ? '进入商品特价' : 'Manage item specials',
    },
    {
      href: `${baseHref}/coupons`,
      title: isZh ? '优惠券与礼包' : 'Coupons & bundles',
      description: isZh
        ? '管理优惠券模板、礼包、自动触发与后台发放规则。'
        : 'Manage coupon templates, bundles, automatic triggers, and admin-issued rewards.',
      action: isZh ? '进入优惠券与礼包' : 'Manage coupons & bundles',
    },
    {
      href: `${baseHref}/automatic`,
      title: isZh ? '自动优惠与积分活动' : 'Automatic & loyalty promotions',
      description: isZh
        ? '管理百分比优惠、固定金额优惠、买赠、赠品和积分倍数活动，并设置叠加、渠道与时段规则。'
        : 'Manage percentage, fixed-amount, buy/get, free-item, and loyalty-multiplier promotions with stacking, channel, and schedule rules.',
      action: isZh ? '进入自动优惠与积分' : 'Manage automatic promotions',
    },
  ];

  return (
    <main className="mx-auto flex max-w-6xl flex-col gap-6 p-6">
      <header className="space-y-2">
        <p className="text-xs font-semibold uppercase tracking-[0.3em] text-slate-500">
          {isZh ? '运营' : 'Admin'}
        </p>
        <h1 className="text-3xl font-bold text-slate-900">
          {isZh ? '营销活动' : 'Promotions'}
        </h1>
        <p className="max-w-3xl text-sm text-slate-600">
          {isZh
            ? '统一管理商品特价、优惠券、自动优惠和积分活动。订单定价由统一 Promotion Engine 负责 eligibility、stacking、adjustment 与快照。'
            : 'Manage item specials, coupons, automatic discounts, and loyalty promotions in one place. Order pricing is resolved by the shared Promotion Engine with unified eligibility, stacking, adjustments, and snapshots.'}
        </p>
      </header>

      <section className="grid gap-5 md:grid-cols-2">
        {modules.map((module) => (
          <article
            key={module.href}
            className="flex min-h-52 flex-col justify-between rounded-2xl border border-slate-200 bg-white p-6 shadow-sm"
          >
            <div className="space-y-3">
              <h2 className="text-xl font-semibold text-slate-900">
                {module.title}
              </h2>
              <p className="text-sm leading-6 text-slate-600">
                {module.description}
              </p>
            </div>
            <div className="pt-6">
              <Link
                href={module.href}
                className="inline-flex rounded-md bg-slate-900 px-4 py-2 text-sm font-medium text-white hover:bg-slate-700"
              >
                {module.action}
              </Link>
            </div>
          </article>
        ))}
      </section>

      <section className="rounded-2xl border border-emerald-200 bg-emerald-50 p-5">
        <h2 className="text-base font-semibold text-emerald-950">
          {isZh ? '统一规则已启用' : 'Unified rules enabled'}
        </h2>
        <p className="mt-2 text-sm text-emerald-900">
          {isZh
            ? 'Daily Special、Coupon、自动促销、POS 手工折扣和积分倍数活动现在共享同一套 eligibility / stacking / adjustment / snapshot 语义；各业务模块仍保留自己的生命周期与存储职责。'
            : 'Daily specials, coupons, automatic promotions, POS manual discounts, and loyalty multipliers now share the same eligibility / stacking / adjustment / snapshot semantics while each domain keeps its own lifecycle and storage responsibilities.'}
        </p>
      </section>
    </main>
  );
}
