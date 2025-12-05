//Users/apple/sanqinMVP/apps/web/src/app/[locale]/membership/page.tsx

'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import type { Locale } from '@/lib/order/shared';
import { useSession, signOut } from 'next-auth/react';
import type { Session } from 'next-auth';

type MemberTier = 'BRONZE' | 'SILVER' | 'GOLD' | 'PLATINUM';

type OrderStatus =
  | 'pending'
  | 'paid'
  | 'making'
  | 'ready'
  | 'completed'
  | 'refunded';

type DeliveryType = 'pickup' | 'delivery';

type OrderHistory = {
  id: string;
  createdAt: string;
  totalCents: number;
  status: OrderStatus;
  items: number;
  deliveryType: DeliveryType;
};

type Address = {
  id: string;
  label: string;
  receiver: string;
  phone: string;
  detail: string;
  isDefault?: boolean;
};

type CouponStatus = 'active' | 'used' | 'expired';

type Coupon = {
  id: string;
  title: string;
  code: string;
  discountCents: number;
  minSpendCents?: number;
  expiresAt: string;
  status: CouponStatus;
  source?: string;
};

type MemberProfile = {
  id: string;
  name?: string;
  email?: string;
  tier: MemberTier;
  points: number;
  availableDiscountCents: number;
  lifetimeSpendCents?: number;
};

type ApiFulfillmentType = 'pickup' | 'dine_in' | 'delivery';
type ApiDeliveryType = 'STANDARD' | 'PRIORITY' | null;

type MembershipSummaryOrderDto = {
  id: string;
  createdAt: string;
  totalCents: number;
  status: OrderStatus;
  fulfillmentType: ApiFulfillmentType;
  deliveryType: ApiDeliveryType;
};

type MembershipSummaryResponse = {
  userId: string;
  displayName: string | null;
  email: string | null;
  tier: MemberTier;
  points: number;
  lifetimeSpendCents: number;
  availableDiscountCents: number;
  marketingEmailOptIn?: boolean;
  recentOrders: MembershipSummaryOrderDto[];
};

type MembershipSummaryApiEnvelope =
  | MembershipSummaryResponse
  | {
      code?: string;
      message?: string;
      details: MembershipSummaryResponse;
    };

type SessionWithUserId = Session & { userId?: string };

// ====== 积分流水类型 ======

type LoyaltyEntryType =
  | 'EARN_ON_PURCHASE'
  | 'REDEEM_ON_ORDER'
  | 'REFUND_REVERSE_EARN'
  | 'REFUND_RETURN_REDEEM'
  | 'TOPUP_PURCHASED'
  | 'ADJUSTMENT_MANUAL';

type LoyaltyEntry = {
  id: string;
  createdAt: string;
  type: LoyaltyEntryType;
  deltaPoints: number;
  balanceAfterPoints: number;
  note?: string;
  orderId?: string | null;
};

function formatCurrency(cents: number): string {
  return `$${(cents / 100).toFixed(2)}`;
}

export default function MembershipHomePage() {
  const router = useRouter();
  const { locale } = useParams<{ locale: Locale }>();
  const { data: session, status } = useSession();

  const [activeTab, setActiveTab] = useState<
    'overview' | 'orders' | 'points' | 'addresses' | 'coupons' | 'profile'
  >('overview');

  const [member, setMember] = useState<MemberProfile | null>(null);
  const [orders, setOrders] = useState<OrderHistory[]>([]);
  const [summaryLoading, setSummaryLoading] = useState(true);
  const [summaryError, setSummaryError] = useState<string | null>(null);

  // 营销邮件订阅状态
  const [marketingOptIn, setMarketingOptIn] = useState<boolean | null>(null);
  const [marketingSaving, setMarketingSaving] = useState(false);
  const [marketingError, setMarketingError] = useState<string | null>(null);

  // 积分流水
  const [loyaltyEntries, setLoyaltyEntries] = useState<LoyaltyEntry[]>([]);
  const [loyaltyLoading, setLoyaltyLoading] = useState(false);
  const [loyaltyError, setLoyaltyError] = useState<string | null>(null);
  const [loyaltyLoadedOnce, setLoyaltyLoadedOnce] = useState(false);

  const isZh = locale === 'zh';

  // 未登录时跳回登录页
  useEffect(() => {
    if (status === 'unauthenticated') {
      router.replace(`/${locale}/membership/login`);
    }
  }, [status, router, locale]);

  // 拉取会员概要信息（积分 + 最近订单 + 营销订阅）
  useEffect(() => {
    if (status !== 'authenticated' || !session?.user) return;

    const sessionWithUserId = session as SessionWithUserId | null;
    const userId = sessionWithUserId?.userId;
    if (!userId) return;

    const controller = new AbortController();

    const loadSummary = async () => {
      try {
        setSummaryLoading(true);
        setSummaryError(null);

        const user = session?.user;
        const params = new URLSearchParams({
          userId,
          name: user?.name ?? '',
          email: user?.email ?? '',
        });

        // ⭐ 从 localStorage 读取“首次注册填写的推荐人 & 生日”，只用一次
        if (typeof window !== 'undefined') {
          try {
            const rawExtra = window.localStorage.getItem(
              'sanqin_membership_prefill',
            );
            if (rawExtra) {
              const extra = JSON.parse(rawExtra) as {
                referrerEmail?: string | null;
                birthdayMonth?: string | null | number;
                birthdayDay?: string | null | number;
              };

              if (extra.referrerEmail) {
                params.set('referrerEmail', String(extra.referrerEmail));
              }
              if (extra.birthdayMonth && extra.birthdayDay) {
                params.set('birthdayMonth', String(extra.birthdayMonth));
                params.set('birthdayDay', String(extra.birthdayDay));
              }

              // 用过一次就清掉，避免以后每次刷新都当作“首次注册”
              window.localStorage.removeItem('sanqin_membership_prefill');
            }
          } catch (e) {
            console.error(
              'Failed to read membership prefill from localStorage',
              e,
            );
          }
        }

        const res = await fetch(
          `/api/v1/membership/summary?${params.toString()}`,
          { signal: controller.signal },
        );

        if (!res.ok) {
          throw new Error(`Failed with status ${res.status}`);
        }

        const raw = (await res.json()) as MembershipSummaryApiEnvelope;
        const data =
          'details' in raw && raw.details
            ? raw.details
            : (raw as MembershipSummaryResponse);

        setMember({
          id: data.userId,
          name: data.displayName ?? user?.name ?? undefined,
          email: data.email ?? user?.email ?? undefined,
          tier: data.tier,
          points: data.points,
          availableDiscountCents: data.availableDiscountCents,
          lifetimeSpendCents: data.lifetimeSpendCents ?? 0,
        });

        setMarketingOptIn(
          typeof data.marketingEmailOptIn === 'boolean'
            ? data.marketingEmailOptIn
            : false,
        );

        const recentOrders = data.recentOrders ?? [];
        setOrders(
          recentOrders.map((o) => ({
            id: o.id,
            createdAt: new Date(o.createdAt).toLocaleString(),
            totalCents: o.totalCents,
            status: o.status,
            items: 0,
            deliveryType:
              o.fulfillmentType === 'delivery' ? 'delivery' : 'pickup',
          })),
        );
      } catch (err: unknown) {
        if (err instanceof DOMException && err.name === 'AbortError') {
          return;
        }
        console.error(err);
        setSummaryError(
          isZh
            ? '加载会员信息失败，请稍后再试'
            : 'Failed to load membership info. Please try again later.',
        );
      } finally {
        setSummaryLoading(false);
      }
    };

    void loadSummary();

    return () => controller.abort();
  }, [status, session, isZh]);

  // 拉取积分流水：首次切到“积分”tab 且已登录时加载一次
  useEffect(() => {
    if (
      activeTab !== 'points' ||
      status !== 'authenticated' ||
      !session?.user ||
      loyaltyLoadedOnce ||
      loyaltyLoading
    ) {
      return;
    }

    const sessionWithUserId = session as SessionWithUserId | null;
    const userId = sessionWithUserId?.userId;
    if (!userId) return;

    const loadLedger = async () => {
      try {
        setLoyaltyLoading(true);
        setLoyaltyError(null);

        const params = new URLSearchParams({
          userId,
          limit: '100',
        });

        const res = await fetch(
          `/api/v1/membership/loyalty-ledger?${params.toString()}`,
        );

        if (!res.ok) {
          throw new Error(`Failed with status ${res.status}`);
        }

        const raw = (await res.json()) as unknown;

        let entries: LoyaltyEntry[] = [];

        if (raw && typeof raw === 'object') {
          const maybe = raw as {
            entries?: LoyaltyEntry[];
            details?: { entries?: LoyaltyEntry[] };
          };

          if (maybe.details && Array.isArray(maybe.details.entries)) {
            entries = maybe.details.entries;
          } else if (Array.isArray(maybe.entries)) {
            entries = maybe.entries;
          }
        }

        setLoyaltyEntries(entries);
        setLoyaltyLoadedOnce(true);
      } catch (err: unknown) {
        console.error(err);
        setLoyaltyError(
          isZh
            ? '加载积分流水失败，请稍后再试'
            : 'Failed to load points history. Please try again later.',
        );
      } finally {
        setLoyaltyLoading(false);
        setLoyaltyLoadedOnce(true);
      }
    };

    void loadLedger();
  }, [
    activeTab,
    status,
    session,
    loyaltyLoadedOnce,
    loyaltyLoading,
    isZh,
  ]);

  const isLoading = status === 'loading' || summaryLoading;

  const addresses: Address[] = member
    ? [
        {
          id: 'addr1',
          label: isZh ? '家' : 'Home',
          receiver: member.name || (isZh ? '默认收件人' : 'Default receiver'),
          phone: '',
          detail: isZh
            ? 'North York, Toronto, ON'
            : 'North York, Toronto, ON',
          isDefault: true,
        },
      ]
    : [];

  const coupons: Coupon[] = [
    {
      id: 'c1',
      title: isZh ? '新客立减' : 'Welcome bonus',
      code: 'WELCOME10',
      discountCents: 1000,
      minSpendCents: 3000,
      expiresAt: isZh ? '2024/12/31 到期' : 'Expires 2024-12-31',
      status: 'active',
      source: isZh ? '注册奖励' : 'Signup bonus',
    },
    {
      id: 'c2',
      title: isZh ? '生日礼券' : 'Birthday treat',
      code: 'BDAY15',
      discountCents: 1500,
      minSpendCents: 4500,
      expiresAt: isZh ? '2024/08/31 到期' : 'Expires 2024-08-31',
      status: 'used',
      source: isZh ? '生日月自动发放' : 'Issued in birthday month',
    },
    {
      id: 'c3',
      title: isZh ? '外卖专享券' : 'Delivery special',
      code: 'DELIVERY5',
      discountCents: 500,
      expiresAt: isZh ? '已过期' : 'Expired',
      status: 'expired',
      source: isZh ? '外送推广活动' : 'Delivery promo',
    },
  ];

  const tierDisplay =
    member &&
    {
      BRONZE: isZh ? '青铜会员' : 'Bronze',
      SILVER: isZh ? '白银会员' : 'Silver',
      GOLD: isZh ? '黄金会员' : 'Gold',
      PLATINUM: isZh ? '铂金会员' : 'Platinum',
    }[member.tier];

  const tierProgress = member
    ? Math.min(
        (Number.isFinite(member.points) ? member.points : 0) / 1000,
        1,
      ) * 100
    : 0;

  const tabs: { key: typeof activeTab; label: string }[] = [
    { key: 'overview', label: isZh ? '总览' : 'Overview' },
    { key: 'orders', label: isZh ? '订单' : 'Orders' },
    { key: 'points', label: isZh ? '积分' : 'Points' },
    { key: 'addresses', label: isZh ? '地址' : 'Addresses' },
    { key: 'coupons', label: isZh ? '优惠卷' : 'Coupons' },
    { key: 'profile', label: isZh ? '账户' : 'Account' },
  ];

  function handleLogout() {
    void signOut({
      callbackUrl: `/${locale}`,
    });
  }

  async function handleMarketingToggle(next: boolean) {
    if (!member) return;

    setMarketingSaving(true);
    setMarketingError(null);

    try {
      const res = await fetch('/api/v1/membership/marketing-consent', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          userId: member.id,
          marketingEmailOptIn: next,
        }),
      });

      if (!res.ok) {
        throw new Error(`Failed with status ${res.status}`);
      }

      setMarketingOptIn(next);
    } catch (err) {
      console.error(err);
      setMarketingError(
        isZh
          ? '更新订阅偏好失败，请稍后再试。'
          : 'Failed to update email preference. Please try again later.',
      );
    } finally {
      setMarketingSaving(false);
    }
  }

  // 状态控制渲染
  if (isLoading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-slate-50">
        <p className="text-sm text-slate-500">
          {summaryError ??
            (isZh ? '加载会员信息中…' : 'Loading membership info…')}
        </p>
      </div>
    );
  }

  if (status === 'unauthenticated') {
    // useEffect 会把人重定向到登录页，这里先不渲染内容
    return null;
  }

  if (!member) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-slate-50">
        <p className="text-sm text-slate-500">
          {summaryError ??
            (isZh ? '未能获取会员信息' : 'Unable to load membership info')}
        </p>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-slate-50">
      <header className="border-b border-slate-200 bg-white">
        <div className="mx-auto flex max-w-4xl items-center justify-between px-4 py-3">
          <Link
            href={`/${locale}`}
            className="text-sm text-slate-600 hover:text-slate-900"
          >
            ← {isZh ? '返回首页' : 'Back to home'}
          </Link>
          <div className="text-sm font-medium text-slate-900">
            {isZh ? '会员中心' : 'Member Center'}
          </div>
          <button
            onClick={handleLogout}
            className="text-xs text-slate-500 hover:text-slate-900"
          >
            {isZh ? '退出登录' : 'Log out'}
          </button>
        </div>
      </header>

      <main className="mx-auto max-w-4xl px-4 py-6">
        {/* 顶部会员信息卡片 */}
        <section className="mb-6 rounded-2xl bg-slate-900 px-5 py-4 text-white">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-xs uppercase tracking-wide text-slate-300">
                {isZh ? '当前会员等级' : 'Current tier'}
              </p>
              <p className="mt-1 text-xl font-semibold">{tierDisplay}</p>
              <p className="mt-2 text-xs text-slate-300">
                {member.email
                  ? `${isZh ? '登录邮箱：' : 'Email: '}${member.email}`
                  : isZh
                    ? '登录邮箱未识别'
                    : 'Email not available'}
              </p>
            </div>
            <div className="text-right">
              <p className="text-xs uppercase tracking-wide text-slate-300">
                {isZh ? '积分' : 'Points'}
              </p>
              <p className="mt-1 text-2xl font-semibold">{member.points}</p>
              <p className="mt-1 text-xs text-amber-300">
                {isZh
                  ? `当前积分最多可抵扣 ${formatCurrency(
                      member.availableDiscountCents,
                    )}`
                  : `Points can redeem up to ${formatCurrency(
                      member.availableDiscountCents,
                    )}.`}
              </p>
            </div>
          </div>

          <div className="mt-4">
            <div className="flex items-center justify-between text-[11px] text-slate-300">
              <span>{isZh ? '升级进度' : 'Progress to next tier'}</span>
              <span>{tierProgress.toFixed(0)}%</span>
            </div>
            <div className="mt-1 h-1.5 w-full rounded-full bg-slate-700">
              <div
                className="h-1.5 rounded-full bg-amber-400"
                style={{ width: `${tierProgress}%` }}
              />
            </div>
          </div>
        </section>

        {/* Tab 导航 */}
        <nav className="mb-4 flex gap-2 overflow-x-auto text-sm">
          {tabs.map((tab) => (
            <button
              key={tab.key}
              type="button"
              onClick={() => setActiveTab(tab.key)}
              className={`whitespace-nowrap rounded-full px-3 py-1 ${
                activeTab === tab.key
                  ? 'bg-slate-900 text-white'
                  : 'bg-white text-slate-700 ring-1 ring-slate-200 hover:bg-slate-100'
              }`}
            >
              {tab.label}
            </button>
          ))}
        </nav>

        {/* 对应内容区域 */}
        <div className="space-y-4">
          {activeTab === 'overview' && (
            <OverviewSection
              isZh={isZh}
              user={member}
              latestOrder={orders[0]}
              locale={locale}
            />
          )}

          {activeTab === 'orders' && (
            <OrdersSection isZh={isZh} orders={orders} locale={locale} />
          )}

{activeTab === 'points' && (
  <PointsSection
    isZh={isZh}
    entries={loyaltyEntries}
    loading={loyaltyLoading}
    error={loyaltyError}
    locale={locale}
    loadedOnce={loyaltyLoadedOnce}
  />
)}

          {activeTab === 'addresses' && (
            <AddressesSection isZh={isZh} addresses={addresses} />
          )}

          {activeTab === 'coupons' && (
            <CouponsSection
              isZh={isZh}
              coupons={coupons}
            />
          )}

          {activeTab === 'profile' && (
            <ProfileSection
              isZh={isZh}
              user={member}
              marketingOptIn={marketingOptIn}
              marketingSaving={marketingSaving}
              marketingError={marketingError}
              onToggleMarketing={handleMarketingToggle}
            />
          )}
        </div>
      </main>
    </div>
  );
}

/* ===== 子组件 ===== */

function OverviewSection({
  isZh,
  user,
  latestOrder,
  locale,
}: {
  isZh: boolean;
  user: MemberProfile;
  latestOrder?: OrderHistory;
  locale: Locale;
}) {
  return (
    <section className="grid gap-4 md:grid-cols-2">
      <div className="rounded-2xl bg-white p-4 shadow-sm ring-1 ring-slate-200">
        <h2 className="text-sm font-medium text-slate-900">
          {isZh ? '最近订单' : 'Latest order'}
        </h2>
        {latestOrder ? (
          <div className="mt-3 space-y-1 text-xs text-slate-600">
            <p>
              {isZh ? '订单号：' : 'Order ID: '}
              <span className="font-mono text-slate-900">
                {latestOrder.id}
              </span>
            </p>
            <p>
              {isZh ? '下单时间：' : 'Created at: '}
              {latestOrder.createdAt}
            </p>
            <p>
              {isZh ? '金额：' : 'Total: '}
              <span className="font-medium text-slate-900">
                {formatCurrency(latestOrder.totalCents)}
              </span>
            </p>
            <p>
              {isZh ? '状态：' : 'Status: '}{' '}
              {isZh ? '已完成' : 'Completed'}
            </p>
            <p className="mt-2">
              <Link
                href={`/${locale}/order/${latestOrder.id}`}
                className="text-[11px] font-medium text-amber-600 hover:underline"
              >
                {isZh ? '查看订单详情' : 'View order details'}
              </Link>
            </p>
          </div>
        ) : (
          <p className="mt-3 text-xs text-slate-500">
            {isZh
              ? '还没有订单，快去下单吧。'
              : 'No orders yet. Place your first order!'}
          </p>
        )}
      </div>

      <div className="rounded-2xl bg-white p-4 shadow-sm ring-1 ring-slate-200">
        <h2 className="text-sm font-medium text-slate-900">
          {isZh ? '账户小结' : 'Account summary'}
        </h2>
        <div className="mt-3 space-y-1 text-xs text-slate-600">
          <p>
            {isZh ? '昵称：' : 'Name: '}
            {user.name || (isZh ? '未设置' : 'Not set')}
          </p>
          <p>
            {isZh ? '邮箱：' : 'Email: '}
            {user.email || (isZh ? '未绑定' : 'Not linked')}
          </p>
          <p>
            {isZh ? '当前积分：' : 'Current points: '}
            <span className="font-medium text-slate-900">
              {user.points}
            </span>
          </p>
          <p>
            {isZh ? '可抵扣金额：' : 'Available discount: '}
            <span className="font-medium text-slate-900">
              {formatCurrency(user.availableDiscountCents)}
            </span>
          </p>
        </div>
      </div>
    </section>
  );
}

function OrdersSection({
  isZh,
  orders,
  locale,
}: {
  isZh: boolean;
  orders: OrderHistory[];
  locale: Locale;
}) {
  return (
    <section className="rounded-2xl bg-white p-4 shadow-sm ring-1 ring-slate-200">
      <div className="flex items-center justify-between">
        <h2 className="text-sm font-medium text-slate-900">
          {isZh ? '订单记录' : 'Order history'}
        </h2>
      </div>

      <div className="mt-3 divide-y divide-slate-100 text-xs text-slate-700">
        {orders.map((order) => (
          <Link
            key={order.id}
            href={`/${locale}/order/${order.id}`}
            className="flex items-center justify-between py-3 hover:bg-slate-50 rounded-lg px-2 -mx-2"
          >
            <div>
              <p className="font-mono text-slate-900">{order.id}</p>
              <p className="mt-1 text-[11px] text-slate-500">
                {order.createdAt}
              </p>
            </div>
            <div className="text-right">
              <p className="font-medium text-slate-900">
                {formatCurrency(order.totalCents)}
              </p>
              <p className="mt-1 text-[11px] text-slate-500">
                {isZh
                  ? order.deliveryType === 'delivery'
                    ? '外送'
                    : '自取'
                  : order.deliveryType === 'delivery'
                    ? 'Delivery'
                    : 'Pickup'}
              </p>
            </div>
          </Link>
        ))}

        {orders.length === 0 && (
          <p className="py-4 text-xs text-slate-500">
            {isZh ? '暂无订单记录。' : 'No orders yet.'}
          </p>
        )}
      </div>
    </section>
  );
}

function PointsSection({
  isZh,
  entries,
  loading,
  error,
  locale,
  loadedOnce,
}: {
  isZh: boolean;
  entries: LoyaltyEntry[];
  loading: boolean;
  error: string | null;
  locale: Locale;
  loadedOnce: boolean;
}) {
  const typeLabel: Record<LoyaltyEntryType, string> = {
    EARN_ON_PURCHASE: isZh ? '消费赚取' : 'Earn on purchase',
    REDEEM_ON_ORDER: isZh ? '下单抵扣' : 'Redeem on order',
    REFUND_REVERSE_EARN: isZh ? '退款扣回' : 'Reverse earn on refund',
    REFUND_RETURN_REDEEM: isZh ? '退款退回抵扣' : 'Return redeemed on refund',
    TOPUP_PURCHASED: isZh ? '储值充值' : 'Top-up purchased',
    ADJUSTMENT_MANUAL: isZh ? '人工调整' : 'Manual adjustment',
  };

  return (
    <section className="rounded-2xl bg-white p-4 shadow-sm ring-1 ring-slate-200">
      <h2 className="text-sm font-medium text-slate-900">
        {isZh ? '积分流水' : 'Points history'}
      </h2>

      {loading && !loadedOnce && (
        <p className="mt-3 text-xs text-slate-500">
          {isZh ? '加载中…' : 'Loading…'}
        </p>
      )}

      {loadedOnce && error && (
        <p className="mt-3 text-xs text-red-500">{error}</p>
      )}

      {loadedOnce && !error && entries.length === 0 && (
        <p className="mt-3 text-xs text-slate-500">
          {isZh ? '暂无积分记录。' : 'No points records yet.'}
        </p>
      )}

      {loadedOnce && !error && entries.length > 0 && (
        <div className="mt-3 divide-y divide-slate-100 text-xs text-slate-700">
          {entries.map((entry) => (
            <div key={entry.id} className="py-2">
              <div className="flex items-center justify-between">
                <div>
                  <p className="font-medium text-slate-900">
                    {typeLabel[entry.type]}
                  </p>
                  <p className="mt-1 text-[11px] text-slate-500">
                    {new Date(entry.createdAt).toLocaleString()}
                  </p>
                  {entry.note && (
                    <p className="mt-1 text-[11px] text-slate-500">
                      {entry.note}
                    </p>
                  )}
                  {entry.orderId && (
                    <p className="mt-1 text-[11px]">
                      <Link
                        href={`/${locale}/order/${entry.orderId}`}
                        className="text-amber-600 hover:underline"
                      >
                        {isZh ? '关联订单' : 'Related order'}: {entry.orderId}
                      </Link>
                    </p>
                  )}
                </div>
                <div className="text-right">
                  <p
                    className={`font-semibold ${
                      entry.deltaPoints >= 0
                        ? 'text-emerald-600'
                        : 'text-rose-600'
                    }`}
                  >
                    {entry.deltaPoints >= 0 ? '+' : ''}
                    {entry.deltaPoints.toFixed(2)} pt
                  </p>
                  <p className="mt-1 text-[11px] text-slate-500">
                    {isZh ? '余额：' : 'Balance: '}
                    {entry.balanceAfterPoints.toFixed(2)} pt
                  </p>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </section>
  );
}

function AddressesSection({
  isZh,
  addresses,
}: {
  isZh: boolean;
  addresses: Address[];
}) {
  return (
    <section className="rounded-2xl bg-white p-4 shadow-sm ring-1 ring-slate-200">
      <div className="mb-3 flex items-center justify-between">
        <h2 className="text-sm font-medium text-slate-900">
          {isZh ? '收货地址' : 'Delivery addresses'}
        </h2>
        <button
          type="button"
          className="text-xs text-slate-500 hover:text-slate-900"
        >
          {isZh ? '新增地址（待开发）' : 'Add address (todo)'}
        </button>
      </div>

      <div className="space-y-3 text-xs text-slate-700">
        {addresses.map((addr) => (
          <div
            key={addr.id}
            className="rounded-xl border border-slate-200 bg-slate-50 px-3 py-2"
          >
            <div className="flex items-center justify-between">
              <div className="font-medium text-slate-900">
                {addr.label}
              </div>
              {addr.isDefault && (
                <span className="rounded-full bg-slate-900 px-2 py-0.5 text-[10px] text-white">
                  {isZh ? '默认' : 'Default'}
                </span>
              )}
            </div>
            <p className="mt-1">
              {addr.receiver} · {addr.phone}
            </p>
            <p className="mt-1 text-slate-600">{addr.detail}</p>
          </div>
        ))}

        {addresses.length === 0 && (
          <p className="text-xs text-slate-500">
            {isZh ? '暂无保存地址。' : 'No saved addresses.'}
          </p>
        )}
      </div>
    </section>
  );
}

function CouponsSection({
  isZh,
  coupons,
}: {
  isZh: boolean;
  coupons: Coupon[];
}) {
  const statusLabel: Record<CouponStatus, string> = {
    active: isZh ? '可使用' : 'Available',
    used: isZh ? '已使用' : 'Used',
    expired: isZh ? '已过期' : 'Expired',
  };

  const statusColor: Record<CouponStatus, string> = {
    active: 'bg-emerald-100 text-emerald-800',
    used: 'bg-slate-100 text-slate-600',
    expired: 'bg-rose-100 text-rose-700',
  };

  return (
    <section className="rounded-2xl bg-white p-4 shadow-sm ring-1 ring-slate-200">
      <h2 className="mb-3 text-sm font-medium text-slate-900">
        {isZh ? '优惠卷' : 'Coupons'}
      </h2>

      <div className="space-y-3 text-xs text-slate-700">
        {coupons.map((coupon) => (
          <div
            key={coupon.id}
            className="rounded-xl border border-dashed border-amber-200 bg-amber-50 px-3 py-2"
          >
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-semibold text-slate-900">
                  {coupon.title}
                </p>
                <p className="text-[11px] text-slate-500">{coupon.source}</p>
              </div>
              <span
                className={`rounded-full px-2 py-0.5 text-[10px] font-medium ${
                  statusColor[coupon.status]
                }`}
              >
                {statusLabel[coupon.status]}
              </span>
            </div>

            <div className="mt-2 flex items-end justify-between">
              <div>
                <p className="text-lg font-bold text-amber-700">
                  {isZh ? '立减 ' : 'Save '}
                  {formatCurrency(coupon.discountCents)}
                </p>
                {coupon.minSpendCents && (
                  <p className="text-[11px] text-slate-500">
                    {isZh ? '满 ' : 'Min spend '}
                    {formatCurrency(coupon.minSpendCents)}
                    {isZh ? ' 可用' : ' to use'}
                  </p>
                )}
              </div>
              <div className="text-right text-[11px] font-mono text-slate-500">
                <p>{coupon.code}</p>
                <p className="mt-0.5">{coupon.expiresAt}</p>
              </div>
            </div>
          </div>
        ))}

        {coupons.length === 0 && (
          <p className="text-xs text-slate-500">
            {isZh ? '暂无可用优惠券。' : 'No coupons available right now.'}
          </p>
        )}
      </div>
    </section>
  );
}

function ProfileSection({
  isZh,
  user,
  marketingOptIn,
  marketingSaving,
  marketingError,
  onToggleMarketing,
}: {
  isZh: boolean;
  user: MemberProfile;
  marketingOptIn: boolean | null;
  marketingSaving: boolean;
  marketingError: string | null;
  onToggleMarketing: (next: boolean) => void;
}) {
  const effectiveOptIn = !!marketingOptIn;

  return (
    <section className="rounded-2xl bg-white p-4 shadow-sm ring-1 ring-slate-200">
      <h2 className="text-sm font-medium text-slate-900">
        {isZh ? '账户信息' : 'Account info'}
      </h2>

      <div className="mt-3 space-y-3 text-xs text-slate-700">
        <div>
          <p className="text-slate-500">{isZh ? '昵称' : 'Name'}</p>
          <p className="mt-0.5 text-slate-900">
            {user.name || (isZh ? '未设置' : 'Not set')}
          </p>
        </div>
        <div>
          <p className="text-slate-500">{isZh ? '邮箱' : 'Email'}</p>
          <p className="mt-0.5 text-slate-900">
            {user.email || (isZh ? '未绑定' : 'Not linked')}
          </p>
        </div>
        <div>
          <p className="text-slate-500">
            {isZh ? '会员编号（User ID）' : 'Member ID (User ID)'}
          </p>
          <p className="mt-0.5 break-all font-mono text-[11px] text-slate-900">
            {user.id || (isZh ? '未识别' : 'Not available')}
          </p>
        </div>

        <div className="mt-4 border-t border-slate-100 pt-3">
          <p className="text-slate-500">
            {isZh ? '营销邮件订阅' : 'Marketing emails'}
          </p>
          <div className="mt-2 flex items-center justify-between">
            <p className="text-[11px] text-slate-500">
              {isZh
                ? '勾选后，我们会不定期发送新品、优惠活动等邮件给你。'
                : 'If enabled, we may send you occasional updates about new items and promotions.'}
            </p>
            <button
              type="button"
              disabled={marketingSaving}
              onClick={() => onToggleMarketing(!effectiveOptIn)}
              className={`relative inline-flex h-5 w-9 items-center rounded-full transition ${
                effectiveOptIn ? 'bg-emerald-500' : 'bg-slate-300'
              } ${marketingSaving ? 'opacity-60' : ''}`}
            >
              <span
                className={`inline-block h-4 w-4 transform rounded-full bg-white transition ${
                  effectiveOptIn ? 'translate-x-4' : 'translate-x-1'
                }`}
              />
            </button>
          </div>
          {marketingError && (
            <p className="mt-1 text-[11px] text-rose-500">
              {marketingError}
            </p>
          )}
        </div>

        <p className="mt-3 text-[11px] text-slate-500">
          {isZh
            ? '积分可在结算页直接抵扣餐品小计；不定期发送的优惠券会通过邮件发给你，请注意查收。'
            : 'Points can be applied at checkout to reduce the food subtotal. Additional promo coupons will occasionally be sent via email.'}
        </p>
      </div>
    </section>
  );
}
