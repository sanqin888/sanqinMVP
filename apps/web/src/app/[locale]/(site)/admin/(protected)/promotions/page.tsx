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
            ? '统一管理商品特价与优惠券活动。当前阶段只整合后台入口，现有后端模块和订单计算逻辑保持不变。'
            : 'A unified admin entry for item specials and coupon campaigns. This phase only consolidates the admin experience; existing backend modules and order calculations remain unchanged.'}
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

      <section className="rounded-2xl border border-dashed border-slate-300 bg-slate-50 p-5">
        <h2 className="text-base font-semibold text-slate-900">
          {isZh ? '后续阶段' : 'Next phases'}
        </h2>
        <p className="mt-2 text-sm text-slate-600">
          {isZh
            ? '自动优惠、积分活动，以及统一 eligibility / stacking / adjustment 规则将在后续阶段接入这里。'
            : 'Automatic discounts, points promotions, and unified eligibility / stacking / adjustment rules will be added here in later phases.'}
        </p>
      </section>
    </main>
  );
}
