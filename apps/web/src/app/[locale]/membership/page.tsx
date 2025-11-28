'use client';

import Link from 'next/link';
import { useParams } from 'next/navigation';
import { useMemo, useState } from 'react';

import type { Locale } from '@/lib/order/shared';

type MemberTier = 'BRONZE' | 'SILVER' | 'GOLD' | 'PLATINUM';

type OrderStatus = 'pending' | 'paid' | 'delivering' | 'completed' | 'cancelled';

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

type PaymentMethod = {
  id: string;
  brand: string;
  last4: string;
  type: 'credit' | 'debit' | 'wallet';
  expires: string;
  isDefault?: boolean;
  nickname?: string;
};

type PaymentProfile = {
  id: string;
  email: string;
  preferedMethodId: string;
  lastPaymentAt: string;
  lastPaymentAmountCents: number;
  invoiceTitle: string;
  taxId?: string;
};

type MemberProfile = {
  id: string;
  name: string;
  phone: string;
  tier: MemberTier;
  points: number;
  tierProgress: number;
  nextTier: MemberTier | null;
  pointsExpireAt: string;
  addresses: Address[];
  paymentMethods: PaymentMethod[];
  paymentProfile: PaymentProfile;
  orders: OrderHistory[];
};

const tierLabels: Record<MemberTier, Record<Locale, string>> = {
  BRONZE: { zh: '青铜', en: 'Bronze' },
  SILVER: { zh: '白银', en: 'Silver' },
  GOLD: { zh: '黄金', en: 'Gold' },
  PLATINUM: { zh: '铂金', en: 'Platinum' },
};

const ORDER_STATUS_META: Record<
  OrderStatus,
  { label: Record<Locale, string>; badge: string }
> = {
  pending: {
    label: { zh: '待支付', en: 'Pending payment' },
    badge: 'bg-amber-100 text-amber-700 border-amber-200',
  },
  paid: {
    label: { zh: '已支付', en: 'Paid' },
    badge: 'bg-blue-100 text-blue-700 border-blue-200',
  },
  delivering: {
    label: { zh: '配送中', en: 'Delivering' },
    badge: 'bg-purple-100 text-purple-700 border-purple-200',
  },
  completed: {
    label: { zh: '已完成', en: 'Completed' },
    badge: 'bg-emerald-100 text-emerald-700 border-emerald-200',
  },
  cancelled: {
    label: { zh: '已取消', en: 'Cancelled' },
    badge: 'bg-gray-100 text-gray-600 border-gray-200',
  },
};

const deliveryLabels: Record<DeliveryType, Record<Locale, string>> = {
  pickup: { zh: '自取', en: 'Pickup' },
  delivery: { zh: '外送', en: 'Delivery' },
};

const paymentTypeLabels: Record<PaymentMethod['type'], Record<Locale, string>> = {
  credit: { zh: '信用卡', en: 'Credit card' },
  debit: { zh: '借记卡', en: 'Debit card' },
  wallet: { zh: '钱包', en: 'Wallet' },
};

const STRINGS: Record<Locale, {
  membershipCenter: string;
  authPageCta: string;
  accountTitleSuffix: string;
  switchMember: string;
  pointsBalance: string;
  pointsExpiring: string;
  tierProgress: string;
  currentTier: string;
  progressRemaining: (tierName: string, percent: string) => string;
  highestTier: string;
  accountInfo: string;
  memberId: string;
  phone: string;
  defaultPayment: string;
  orderHistoryTitle: string;
  orderHistorySubtitle: string;
  searchPlaceholder: string;
  statusPrefix: string;
  deliveryPrefix: string;
  orderTableHeaders: {
    id: string;
    createdAt: string;
    amount: string;
    deliveryType: string;
    status: string;
    items: string;
  };
  noOrders: string;
  addressTitle: string;
  addressCount: string;
  addressDefault: string;
  paymentMethodsTitle: string;
  paymentMethodsCount: string;
  paymentMethodDefault: string;
  paymentInfoTitle: string;
  paymentInfoSubtitle: string;
  notificationEmail: string;
  lastPayment: string;
  defaultPaymentMethod: string;
  invoiceTitle: string;
  taxId: string;
  itemUnit: string;
}> = {
  zh: {
    membershipCenter: '会员中心',
    authPageCta: '会员登录 / 注册',
    accountTitleSuffix: '的账户',
    switchMember: '切换会员',
    pointsBalance: '积分余额',
    pointsExpiring: '积分将于 {date} 到期',
    tierProgress: '等级进度',
    currentTier: '当前 {tier}',
    progressRemaining: (tierName, percent) => `距 ${tierName} 还差 ${percent}%`,
    highestTier: '已是最高等级',
    accountInfo: '账户信息',
    memberId: '会员号',
    phone: '手机号',
    defaultPayment: '默认支付',
    orderHistoryTitle: '历史订单查询',
    orderHistorySubtitle: '按状态、配送方式或关键词筛选订单',
    searchPlaceholder: '搜索订单号 / 状态',
    statusPrefix: '状态：',
    deliveryPrefix: '配送：',
    orderTableHeaders: {
      id: '订单号',
      createdAt: '创建时间',
      amount: '金额',
      deliveryType: '配送方式',
      status: '状态',
      items: '商品数',
    },
    noOrders: '暂无符合条件的订单',
    addressTitle: '配送地址',
    addressCount: '共 {count} 个',
    addressDefault: '默认',
    paymentMethodsTitle: '支付方式',
    paymentMethodsCount: '{count} 个绑定',
    paymentMethodDefault: '默认',
    paymentInfoTitle: '支付信息',
    paymentInfoSubtitle: '账单与开票偏好',
    notificationEmail: '通知邮箱',
    lastPayment: '上次支付',
    defaultPaymentMethod: '默认支付方式',
    invoiceTitle: '抬头',
    taxId: '税号',
    itemUnit: '件',
  },
  en: {
    membershipCenter: 'Membership center',
    authPageCta: 'Member sign in / join',
    accountTitleSuffix: ' account',
    switchMember: 'Switch member',
    pointsBalance: 'Points balance',
    pointsExpiring: 'Points expire on {date}',
    tierProgress: 'Tier progress',
    currentTier: 'Current {tier}',
    progressRemaining: (tierName, percent) => `${percent}% to ${tierName}`,
    highestTier: 'Top tier achieved',
    accountInfo: 'Account info',
    memberId: 'Member ID',
    phone: 'Phone',
    defaultPayment: 'Default payment',
    orderHistoryTitle: 'Order history',
    orderHistorySubtitle: 'Filter by status, delivery type, or keyword',
    searchPlaceholder: 'Search order # / status',
    statusPrefix: 'Status: ',
    deliveryPrefix: 'Delivery: ',
    orderTableHeaders: {
      id: 'Order #',
      createdAt: 'Created at',
      amount: 'Amount',
      deliveryType: 'Fulfillment',
      status: 'Status',
      items: 'Items',
    },
    noOrders: 'No orders match the filters',
    addressTitle: 'Addresses',
    addressCount: '{count} saved',
    addressDefault: 'Default',
    paymentMethodsTitle: 'Payment methods',
    paymentMethodsCount: '{count} on file',
    paymentMethodDefault: 'Default',
    paymentInfoTitle: 'Payment info',
    paymentInfoSubtitle: 'Billing & invoicing preferences',
    notificationEmail: 'Notification email',
    lastPayment: 'Last payment',
    defaultPaymentMethod: 'Default method',
    invoiceTitle: 'Invoice title',
    taxId: 'Tax ID',
    itemUnit: 'items',
  },
};

const MEMBERS: MemberProfile[] = [
  {
    id: 'u-001',
    name: '张三',
    phone: '188 **** 0001',
    tier: 'GOLD',
    points: 18560,
    tierProgress: 72,
    nextTier: 'PLATINUM',
    pointsExpireAt: '2025-03-31',
    addresses: [
      {
        id: 'addr-1',
        label: '家',
        receiver: '张三',
        phone: '18800000001',
        detail: '西安市雁塔区锦业路 9 号 XXX 小区 1 号楼 1201',
        isDefault: true,
      },
      {
        id: 'addr-2',
        label: '公司',
        receiver: '张三',
        phone: '18800000001',
        detail: '高新区 XXX 科技园 B 座 8 层 前台代收',
      },
    ],
    paymentMethods: [
      {
        id: 'pm-visa',
        brand: 'Visa',
        last4: '4242',
        type: 'credit',
        expires: '12/26',
        isDefault: true,
        nickname: '常用支付',
      },
      {
        id: 'pm-apple',
        brand: 'Apple Pay',
        last4: '0000',
        type: 'wallet',
        expires: '—',
        nickname: '手机快捷',
      },
    ],
    paymentProfile: {
      id: 'pp-1',
      email: 'zhangsan@example.com',
      preferedMethodId: 'pm-visa',
      lastPaymentAt: '2024-06-06T10:30:00Z',
      lastPaymentAmountCents: 2680,
      invoiceTitle: '陕西三秦餐饮有限公司',
      taxId: '91610000MA1234567A',
    },
    orders: [
      {
        id: 'ord-20240608-001',
        createdAt: '2024-06-08T12:30:00Z',
        totalCents: 4280,
        status: 'completed',
        items: 3,
        deliveryType: 'delivery',
      },
      {
        id: 'ord-20240605-003',
        createdAt: '2024-06-05T18:22:00Z',
        totalCents: 2680,
        status: 'completed',
        items: 2,
        deliveryType: 'delivery',
      },
      {
        id: 'ord-20240530-011',
        createdAt: '2024-05-30T09:10:00Z',
        totalCents: 1880,
        status: 'paid',
        items: 1,
        deliveryType: 'pickup',
      },
      {
        id: 'ord-20240520-007',
        createdAt: '2024-05-20T16:05:00Z',
        totalCents: 3380,
        status: 'delivering',
        items: 2,
        deliveryType: 'delivery',
      },
      {
        id: 'ord-20240510-004',
        createdAt: '2024-05-10T11:45:00Z',
        totalCents: 5200,
        status: 'cancelled',
        items: 4,
        deliveryType: 'delivery',
      },
    ],
  },
  {
    id: 'u-002',
    name: '李四',
    phone: '139 **** 0002',
    tier: 'SILVER',
    points: 8200,
    tierProgress: 35,
    nextTier: 'GOLD',
    pointsExpireAt: '2024-12-31',
    addresses: [
      {
        id: 'addr-3',
        label: '家',
        receiver: '李四',
        phone: '13900000002',
        detail: '曲江新区 XX 路 188 号 和风府 3 号楼 801',
        isDefault: true,
      },
    ],
    paymentMethods: [
      {
        id: 'pm-master',
        brand: 'Mastercard',
        last4: '8888',
        type: 'credit',
        expires: '08/25',
        isDefault: true,
      },
    ],
    paymentProfile: {
      id: 'pp-2',
      email: 'lisi@example.com',
      preferedMethodId: 'pm-master',
      lastPaymentAt: '2024-05-28T09:15:00Z',
      lastPaymentAmountCents: 1980,
      invoiceTitle: '个人消费',
    },
    orders: [
      {
        id: 'ord-20240601-002',
        createdAt: '2024-06-01T14:15:00Z',
        totalCents: 1980,
        status: 'completed',
        items: 1,
        deliveryType: 'delivery',
      },
      {
        id: 'ord-20240515-010',
        createdAt: '2024-05-15T12:00:00Z',
        totalCents: 2880,
        status: 'paid',
        items: 2,
        deliveryType: 'pickup',
      },
    ],
  },
];

const statusColors: Record<OrderStatus, string> = {
  pending: ORDER_STATUS_META.pending.badge,
  paid: ORDER_STATUS_META.paid.badge,
  delivering: ORDER_STATUS_META.delivering.badge,
  completed: ORDER_STATUS_META.completed.badge,
  cancelled: ORDER_STATUS_META.cancelled.badge,
};

export default function MembershipPage() {
  const params = useParams<{ locale?: string }>();
  const locale: Locale = params?.locale === 'en' ? 'en' : 'zh';

  const strings = STRINGS[locale];
  const notSetLabel = locale === 'zh' ? '未设置' : 'Not set';
  const statusAllLabel = locale === 'zh' ? '全部' : 'All';
  const deliveryAllLabel = locale === 'zh' ? '全部' : 'All';
  const [selectedMemberId, setSelectedMemberId] = useState(MEMBERS[0]?.id ?? '');
  const [orderKeyword, setOrderKeyword] = useState('');
  const [statusFilter, setStatusFilter] = useState<OrderStatus | 'all'>('all');
  const [deliveryFilter, setDeliveryFilter] = useState<DeliveryType | 'all'>('all');

  const member = useMemo(
    () => MEMBERS.find((m) => m.id === selectedMemberId) ?? MEMBERS[0],
    [selectedMemberId],
  );

  const filteredOrders = useMemo(() => {
    if (!member) return [];
    return member.orders
      .filter((order) => {
        if (statusFilter !== 'all' && order.status !== statusFilter) return false;
        if (deliveryFilter !== 'all' && order.deliveryType !== deliveryFilter) return false;
        if (!orderKeyword.trim()) return true;
        const keyword = orderKeyword.trim().toLowerCase();
        return (
          order.id.toLowerCase().includes(keyword) ||
          ORDER_STATUS_META[order.status].label.zh.toLowerCase().includes(keyword) ||
          ORDER_STATUS_META[order.status].label.en.toLowerCase().includes(keyword) ||
          deliveryLabels[order.deliveryType].zh.toLowerCase().includes(keyword) ||
          deliveryLabels[order.deliveryType].en.toLowerCase().includes(keyword)
        );
      })
      .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
  }, [member, orderKeyword, statusFilter, deliveryFilter]);

  const currencyFormatter = useMemo(
    () =>
      new Intl.NumberFormat(locale === 'zh' ? 'zh-Hans-CN' : 'en-CA', {
        style: 'currency',
        currency: 'CNY',
        minimumFractionDigits: 2,
        maximumFractionDigits: 2,
      }),
    [locale],
  );

  if (!member) return null;

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <p className="text-sm text-gray-500">{strings.membershipCenter}</p>
          <h1 className="text-2xl font-semibold">
            {member.name}
            {locale === 'zh' ? ` ${strings.accountTitleSuffix}` : strings.accountTitleSuffix}
          </h1>
        </div>
        <div className="flex items-center gap-3">
          <Link
            href={`/${locale}/membership/auth`}
            className="inline-flex items-center gap-2 rounded-lg border border-blue-100 bg-blue-50 px-3 py-2 text-sm font-semibold text-blue-700 transition hover:-translate-y-0.5 hover:border-blue-200 hover:bg-white hover:shadow-sm"
          >
            <span aria-hidden>🔐</span>
            {strings.authPageCta}
          </Link>
          <div className="flex items-center gap-2">
            <label className="text-sm text-gray-600" htmlFor="memberSelect">
              {strings.switchMember}
            </label>
            <select
              id="memberSelect"
              value={selectedMemberId}
              onChange={(e) => setSelectedMemberId(e.target.value)}
              className="rounded-lg border px-3 py-2 text-sm"
            >
              {MEMBERS.map((m) => (
                <option key={m.id} value={m.id}>
                  {locale === 'zh' ? `${m.name}（${m.id}）` : `${m.name} (${m.id})`}
                </option>
              ))}
            </select>
          </div>
        </div>
      </div>

      <section className="grid gap-4 lg:grid-cols-3">
        <div className="rounded-xl border bg-white p-4 shadow-sm">
          <div className="flex items-center justify-between">
            <h2 className="text-sm font-semibold text-gray-700">{strings.pointsBalance}</h2>
            <span className="rounded-full bg-emerald-50 px-2 py-1 text-xs font-semibold text-emerald-700">{tierLabels[member.tier][locale]}</span>
          </div>
          <p className="mt-4 text-3xl font-semibold text-gray-900">
            {member.points.toLocaleString(locale === 'zh' ? 'zh-Hans-CN' : 'en-CA')} {locale === 'zh' ? '分' : 'pts'}
          </p>
          <p className="mt-2 text-sm text-gray-500">{strings.pointsExpiring.replace('{date}', member.pointsExpireAt)}</p>
        </div>

        <div className="rounded-xl border bg-white p-4 shadow-sm">
          <h2 className="text-sm font-semibold text-gray-700">{strings.tierProgress}</h2>
          <div className="mt-3 flex items-center justify-between text-sm text-gray-600">
            <span>{strings.currentTier.replace('{tier}', tierLabels[member.tier][locale])}</span>
            <span>{member.tierProgress}%</span>
          </div>
          <div className="mt-2 h-2 rounded-full bg-gray-100">
            <div
              className="h-2 rounded-full bg-gradient-to-r from-amber-400 to-emerald-500"
              style={{ width: `${member.tierProgress}%` }}
            />
          </div>
          <p className="mt-3 text-sm text-gray-500">
            {member.nextTier
              ? strings.progressRemaining(
                  tierLabels[member.nextTier][locale],
                  (100 - member.tierProgress).toFixed(0),
                )
              : strings.highestTier}
          </p>
        </div>

        <div className="rounded-xl border bg-white p-4 shadow-sm">
          <h2 className="text-sm font-semibold text-gray-700">{strings.accountInfo}</h2>
          <dl className="mt-3 space-y-2 text-sm text-gray-600">
            <div className="flex items-center justify-between">
              <dt className="text-gray-500">{strings.memberId}</dt>
              <dd className="font-medium">{member.id}</dd>
            </div>
            <div className="flex items-center justify-between">
              <dt className="text-gray-500">{strings.phone}</dt>
              <dd className="font-medium">{member.phone}</dd>
            </div>
            <div className="flex items-center justify-between">
              <dt className="text-gray-500">{strings.defaultPayment}</dt>
              <dd className="font-medium">
                {member.paymentMethods.find((m) => m.id === member.paymentProfile.preferedMethodId)?.brand ?? notSetLabel}
              </dd>
            </div>
          </dl>
        </div>
      </section>

      <section className="rounded-xl border bg-white p-4 shadow-sm space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h2 className="text-lg font-semibold text-gray-800">{strings.orderHistoryTitle}</h2>
            <p className="text-sm text-gray-500">{strings.orderHistorySubtitle}</p>
          </div>
          <div className="flex flex-wrap gap-2">
            <input
              type="search"
              placeholder={strings.searchPlaceholder}
              value={orderKeyword}
              onChange={(e) => setOrderKeyword(e.target.value)}
              className="w-48 rounded-lg border px-3 py-2 text-sm"
            />
            <select
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value as OrderStatus | 'all')}
              className="rounded-lg border px-3 py-2 text-sm"
            >
              {(['all', 'pending', 'paid', 'delivering', 'completed', 'cancelled'] as const).map((status) => (
                <option key={status} value={status}>
                  {strings.statusPrefix}
                  {status === 'all' ? statusAllLabel : ORDER_STATUS_META[status].label[locale]}
                </option>
              ))}
            </select>
            <select
              value={deliveryFilter}
              onChange={(e) => setDeliveryFilter(e.target.value as DeliveryType | 'all')}
              className="rounded-lg border px-3 py-2 text-sm"
            >
              {(['all', 'pickup', 'delivery'] as const).map((type) => (
                <option key={type} value={type}>
                  {strings.deliveryPrefix}
                  {type === 'all' ? deliveryAllLabel : deliveryLabels[type][locale]}
                </option>
              ))}
            </select>
          </div>
        </div>

        <div className="overflow-hidden rounded-xl border">
          <table className="min-w-full divide-y divide-gray-200 text-sm">
            <thead className="bg-gray-50 text-gray-600">
              <tr>
                <th className="px-4 py-3 text-left font-semibold">{strings.orderTableHeaders.id}</th>
                <th className="px-4 py-3 text-left font-semibold">{strings.orderTableHeaders.createdAt}</th>
                <th className="px-4 py-3 text-left font-semibold">{strings.orderTableHeaders.amount}</th>
                <th className="px-4 py-3 text-left font-semibold">{strings.orderTableHeaders.deliveryType}</th>
                <th className="px-4 py-3 text-left font-semibold">{strings.orderTableHeaders.status}</th>
                <th className="px-4 py-3 text-left font-semibold">{strings.orderTableHeaders.items}</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {filteredOrders.length === 0 ? (
                <tr>
                  <td colSpan={6} className="px-4 py-6 text-center text-gray-500">
                    {strings.noOrders}
                  </td>
                </tr>
              ) : (
                filteredOrders.map((order) => (
                  <tr key={order.id} className="hover:bg-gray-50">
                    <td className="px-4 py-3 font-medium text-gray-900">{order.id}</td>
                    <td className="px-4 py-3 text-gray-600">
                      {new Date(order.createdAt).toLocaleString(locale === 'zh' ? 'zh-CN' : 'en-CA', {
                        hour12: locale !== 'zh',
                      })}
                    </td>
                    <td className="px-4 py-3 font-semibold text-gray-900">
                      {currencyFormatter.format(order.totalCents / 100)}
                    </td>
                    <td className="px-4 py-3 text-gray-600">{deliveryLabels[order.deliveryType][locale]}</td>
                    <td className="px-4 py-3">
                      <span className={`inline-flex items-center rounded-full border px-2.5 py-1 text-xs font-semibold ${statusColors[order.status]}`}>
                        {ORDER_STATUS_META[order.status].label[locale]}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-gray-600">{order.items} {strings.itemUnit}</td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </section>

      <section className="grid gap-4 lg:grid-cols-2">
        <div className="rounded-xl border bg-white p-4 shadow-sm space-y-4">
          <div className="flex items-center justify-between">
            <h2 className="text-lg font-semibold text-gray-800">{strings.addressTitle}</h2>
            <span className="text-sm text-gray-500">
              {strings.addressCount.replace('{count}', member.addresses.length.toString())}
            </span>
          </div>
          <div className="space-y-3">
            {member.addresses.map((addr) => (
              <div key={addr.id} className="rounded-lg border p-3 hover:border-gray-300">
                <div className="flex flex-wrap items-center gap-2 text-sm text-gray-700">
                  <span className="font-semibold">{addr.label}</span>
                  {addr.isDefault ? (
                    <span className="rounded-full bg-emerald-50 px-2 py-0.5 text-xs font-semibold text-emerald-700">
                      {strings.addressDefault}
                    </span>
                  ) : null}
                  <span className="text-gray-500">{addr.receiver}</span>
                  <span className="text-gray-500">{addr.phone}</span>
                </div>
                <p className="mt-1 text-sm text-gray-600">{addr.detail}</p>
              </div>
            ))}
          </div>
        </div>

        <div className="space-y-4">
          <div className="rounded-xl border bg-white p-4 shadow-sm space-y-3">
            <div className="flex items-center justify-between">
              <h2 className="text-lg font-semibold text-gray-800">{strings.paymentMethodsTitle}</h2>
              <span className="text-sm text-gray-500">
                {strings.paymentMethodsCount.replace('{count}', member.paymentMethods.length.toString())}
              </span>
            </div>
            <div className="space-y-3">
              {member.paymentMethods.map((pm) => (
                <div key={pm.id} className="rounded-lg border p-3 text-sm text-gray-700">
                  <div className="flex items-center justify-between">
                    <div className="space-y-1">
                      <div className="flex items-center gap-2 font-semibold text-gray-900">
                        <span>{pm.brand}</span>
                        {pm.nickname ? <span className="text-xs text-gray-500">{pm.nickname}</span> : null}
                      </div>
                      <div className="text-gray-600">
                        {locale === 'zh'
                          ? `${paymentTypeLabels[pm.type][locale]} · 尾号 ${pm.last4} · 有效期 ${pm.expires}`
                          : `${paymentTypeLabels[pm.type][locale]} • ending ${pm.last4} • exp ${pm.expires}`}
                      </div>
                    </div>
                    {pm.isDefault ? (
                      <span className="rounded-full bg-blue-50 px-2 py-0.5 text-xs font-semibold text-blue-700">{strings.paymentMethodDefault}</span>
                    ) : null}
                  </div>
                </div>
              ))}
            </div>
          </div>

          <div className="rounded-xl border bg-white p-4 shadow-sm space-y-3">
            <div className="flex items-center justify-between">
              <h2 className="text-lg font-semibold text-gray-800">{strings.paymentInfoTitle}</h2>
              <span className="text-sm text-gray-500">{strings.paymentInfoSubtitle}</span>
            </div>
            <dl className="space-y-2 text-sm text-gray-700">
              <div className="flex items-center justify-between">
                <dt className="text-gray-500">{strings.notificationEmail}</dt>
                <dd className="font-medium">{member.paymentProfile.email}</dd>
              </div>
              <div className="flex items-center justify-between">
                <dt className="text-gray-500">{strings.lastPayment}</dt>
                <dd className="font-medium">
                  {currencyFormatter.format(member.paymentProfile.lastPaymentAmountCents / 100)} ·{' '}
                  {new Date(member.paymentProfile.lastPaymentAt).toLocaleString(locale === 'zh' ? 'zh-CN' : 'en-CA', {
                    hour12: locale !== 'zh',
                  })}
                </dd>
              </div>
              <div className="flex items-center justify-between">
                <dt className="text-gray-500">{strings.defaultPaymentMethod}</dt>
                <dd className="font-medium">
                  {member.paymentMethods.find((pm) => pm.id === member.paymentProfile.preferedMethodId)?.brand ?? notSetLabel}
                </dd>
              </div>
              <div className="flex items-center justify-between">
                <dt className="text-gray-500">{strings.invoiceTitle}</dt>
                <dd className="font-medium text-right">
                  <div>{member.paymentProfile.invoiceTitle}</div>
                  {member.paymentProfile.taxId ? (
                    <div className="text-xs text-gray-500">
                      {strings.taxId}：{member.paymentProfile.taxId}
                    </div>
                  ) : null}
                </dd>
              </div>
            </dl>
          </div>
        </div>
      </section>
    </div>
  );
}
