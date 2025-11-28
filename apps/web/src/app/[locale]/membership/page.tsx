'use client';

import { useMemo, useState } from 'react';

type MemberTier = 'BRONZE' | 'SILVER' | 'GOLD' | 'PLATINUM';

type OrderStatus = '待支付' | '已支付' | '配送中' | '已完成' | '已取消';

type OrderHistory = {
  id: string;
  createdAt: string;
  totalCents: number;
  status: OrderStatus;
  items: number;
  deliveryType: '自取' | '外送';
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
  type: '信用卡' | '借记卡' | '钱包';
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

const tierLabels: Record<MemberTier, string> = {
  BRONZE: '青铜',
  SILVER: '白银',
  GOLD: '黄金',
  PLATINUM: '铂金',
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
        type: '信用卡',
        expires: '12/26',
        isDefault: true,
        nickname: '常用支付',
      },
      {
        id: 'pm-apple',
        brand: 'Apple Pay',
        last4: '0000',
        type: '钱包',
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
        status: '已完成',
        items: 3,
        deliveryType: '外送',
      },
      {
        id: 'ord-20240605-003',
        createdAt: '2024-06-05T18:22:00Z',
        totalCents: 2680,
        status: '已完成',
        items: 2,
        deliveryType: '外送',
      },
      {
        id: 'ord-20240530-011',
        createdAt: '2024-05-30T09:10:00Z',
        totalCents: 1880,
        status: '已支付',
        items: 1,
        deliveryType: '自取',
      },
      {
        id: 'ord-20240520-007',
        createdAt: '2024-05-20T16:05:00Z',
        totalCents: 3380,
        status: '配送中',
        items: 2,
        deliveryType: '外送',
      },
      {
        id: 'ord-20240510-004',
        createdAt: '2024-05-10T11:45:00Z',
        totalCents: 5200,
        status: '已取消',
        items: 4,
        deliveryType: '外送',
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
        type: '信用卡',
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
        status: '已完成',
        items: 1,
        deliveryType: '外送',
      },
      {
        id: 'ord-20240515-010',
        createdAt: '2024-05-15T12:00:00Z',
        totalCents: 2880,
        status: '已支付',
        items: 2,
        deliveryType: '自取',
      },
    ],
  },
];

const statusColors: Record<OrderStatus, string> = {
  待支付: 'bg-amber-100 text-amber-700 border-amber-200',
  已支付: 'bg-blue-100 text-blue-700 border-blue-200',
  配送中: 'bg-purple-100 text-purple-700 border-purple-200',
  已完成: 'bg-emerald-100 text-emerald-700 border-emerald-200',
  已取消: 'bg-gray-100 text-gray-600 border-gray-200',
};

export default function MembershipPage() {
  const [selectedMemberId, setSelectedMemberId] = useState(MEMBERS[0]?.id ?? '');
  const [orderKeyword, setOrderKeyword] = useState('');
  const [statusFilter, setStatusFilter] = useState<OrderStatus | '全部'>('全部');
  const [deliveryFilter, setDeliveryFilter] = useState<'全部' | '自取' | '外送'>('全部');

  const member = useMemo(
    () => MEMBERS.find((m) => m.id === selectedMemberId) ?? MEMBERS[0],
    [selectedMemberId],
  );

  const filteredOrders = useMemo(() => {
    if (!member) return [];
    return member.orders
      .filter((order) => {
        if (statusFilter !== '全部' && order.status !== statusFilter) return false;
        if (deliveryFilter !== '全部' && order.deliveryType !== deliveryFilter) return false;
        if (!orderKeyword.trim()) return true;
        const keyword = orderKeyword.trim().toLowerCase();
        return (
          order.id.toLowerCase().includes(keyword) ||
          order.status.toLowerCase().includes(keyword) ||
          order.deliveryType.toLowerCase().includes(keyword)
        );
      })
      .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
  }, [member, orderKeyword, statusFilter, deliveryFilter]);

  const currencyFormatter = useMemo(
    () =>
      new Intl.NumberFormat('zh-Hans-CN', {
        style: 'currency',
        currency: 'CNY',
        minimumFractionDigits: 2,
        maximumFractionDigits: 2,
      }),
    [],
  );

  if (!member) return null;

  return (
    <div className="space-y-6">
      <section className="rounded-2xl border bg-gradient-to-r from-amber-50 via-white to-blue-50 p-4 shadow-sm">
        <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
          <div className="space-y-2">
            <p className="text-sm font-semibold text-amber-700">快速注册 / 登录</p>
            <h2 className="text-xl font-bold text-gray-900">一键用 Google 账号成为会员</h2>
            <p className="text-sm text-gray-600">
              支持使用 Google 账号直接登录或注册，无需重复填写姓名、邮箱等信息，授权后自动同步基本资料，立刻享受积分与等级权益。
            </p>
            <ul className="flex flex-wrap gap-3 text-xs text-gray-600">
              <li className="flex items-center gap-2 rounded-full bg-white px-3 py-1 shadow-sm">
                <span className="h-2 w-2 rounded-full bg-emerald-500" aria-hidden />
                免表单填写
              </li>
              <li className="flex items-center gap-2 rounded-full bg-white px-3 py-1 shadow-sm">
                <span className="h-2 w-2 rounded-full bg-emerald-500" aria-hidden />
                同步头像和邮箱
              </li>
              <li className="flex items-center gap-2 rounded-full bg-white px-3 py-1 shadow-sm">
                <span className="h-2 w-2 rounded-full bg-emerald-500" aria-hidden />
                登录即享会员权益
              </li>
            </ul>
          </div>
          <div className="flex flex-col items-start gap-2 rounded-xl bg-white p-4 shadow-sm"> 
            <button
              type="button"
              className="flex items-center gap-3 rounded-lg border border-gray-200 px-4 py-2 text-sm font-semibold text-gray-800 shadow-sm transition hover:-translate-y-0.5 hover:shadow"
            >
              <span className="flex h-9 w-9 items-center justify-center rounded-full bg-white shadow-inner">
                <svg className="h-5 w-5" viewBox="0 0 24 24" fill="none" aria-hidden>
                  <path
                    d="M21.6 12.23c0-.64-.06-1.26-.17-1.86H12v3.52h5.4c-.23 1.25-.93 2.32-1.99 3.04v2.52h3.22c1.89-1.74 2.97-4.3 2.97-7.22Z"
                    fill="#4285F4"
                  />
                  <path
                    d="M12 22c2.7 0 4.97-.9 6.63-2.43l-3.22-2.52c-.9.6-2.05.95-3.4.95-2.62 0-4.85-1.77-5.64-4.15H3.06v2.6A9.99 9.99 0 0 0 12 22Z"
                    fill="#34A853"
                  />
                  <path
                    d="M6.36 13.85A5.99 5.99 0 0 1 5.97 12c0-.64.11-1.26.32-1.85V7.55H3.06A10 10 0 0 0 2 12c0 1.6.39 3.11 1.06 4.45l3.3-2.6Z"
                    fill="#FBBC05"
                  />
                  <path
                    d="M12 6.02c1.47 0 2.8.5 3.84 1.48l2.88-2.88A9.95 9.95 0 0 0 12 2a9.99 9.99 0 0 0-8.94 5.55l3.3 2.6C6.76 7.79 8.99 6.02 12 6.02Z"
                    fill="#EA4335"
                  />
                </svg>
              </span>
              使用 Google 登录/注册
            </button>
            <p className="text-xs text-gray-500">
              默认关联当前设备，后续可在账户信息中更换手机号或补充配送地址。
            </p>
          </div>
        </div>
      </section>

      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <p className="text-sm text-gray-500">会员中心</p>
          <h1 className="text-2xl font-semibold">{member.name} 的账户</h1>
        </div>
        <div className="flex items-center gap-2">
          <label className="text-sm text-gray-600" htmlFor="memberSelect">
            切换会员
          </label>
          <select
            id="memberSelect"
            value={selectedMemberId}
            onChange={(e) => setSelectedMemberId(e.target.value)}
            className="rounded-lg border px-3 py-2 text-sm"
          >
            {MEMBERS.map((m) => (
              <option key={m.id} value={m.id}>
                {m.name}（{m.id}）
              </option>
            ))}
          </select>
        </div>
      </div>

      <section className="grid gap-4 lg:grid-cols-3">
        <div className="rounded-xl border bg-white p-4 shadow-sm">
          <div className="flex items-center justify-between">
            <h2 className="text-sm font-semibold text-gray-700">积分余额</h2>
            <span className="rounded-full bg-emerald-50 px-2 py-1 text-xs font-semibold text-emerald-700">{tierLabels[member.tier]}</span>
          </div>
          <p className="mt-4 text-3xl font-semibold text-gray-900">{member.points.toLocaleString()} 分</p>
          <p className="mt-2 text-sm text-gray-500">积分将于 {member.pointsExpireAt} 到期</p>
        </div>

        <div className="rounded-xl border bg-white p-4 shadow-sm">
          <h2 className="text-sm font-semibold text-gray-700">等级进度</h2>
          <div className="mt-3 flex items-center justify-between text-sm text-gray-600">
            <span>当前 {tierLabels[member.tier]}</span>
            <span>{member.tierProgress}%</span>
          </div>
          <div className="mt-2 h-2 rounded-full bg-gray-100">
            <div
              className="h-2 rounded-full bg-gradient-to-r from-amber-400 to-emerald-500"
              style={{ width: `${member.tierProgress}%` }}
            />
          </div>
          <p className="mt-3 text-sm text-gray-500">
            {member.nextTier ? `距 ${tierLabels[member.nextTier]} 还差 ${(100 - member.tierProgress).toFixed(0)}%` : '已是最高等级'}
          </p>
        </div>

        <div className="rounded-xl border bg-white p-4 shadow-sm">
          <h2 className="text-sm font-semibold text-gray-700">账户信息</h2>
          <dl className="mt-3 space-y-2 text-sm text-gray-600">
            <div className="flex items-center justify-between">
              <dt className="text-gray-500">会员号</dt>
              <dd className="font-medium">{member.id}</dd>
            </div>
            <div className="flex items-center justify-between">
              <dt className="text-gray-500">手机号</dt>
              <dd className="font-medium">{member.phone}</dd>
            </div>
            <div className="flex items-center justify-between">
              <dt className="text-gray-500">默认支付</dt>
              <dd className="font-medium">
                {member.paymentMethods.find((m) => m.id === member.paymentProfile.preferedMethodId)?.brand ?? '未设置'}
              </dd>
            </div>
          </dl>
        </div>
      </section>

      <section className="rounded-xl border bg-white p-4 shadow-sm space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h2 className="text-lg font-semibold text-gray-800">历史订单查询</h2>
            <p className="text-sm text-gray-500">按状态、配送方式或关键词筛选订单</p>
          </div>
          <div className="flex flex-wrap gap-2">
            <input
              type="search"
              placeholder="搜索订单号 / 状态"
              value={orderKeyword}
              onChange={(e) => setOrderKeyword(e.target.value)}
              className="w-48 rounded-lg border px-3 py-2 text-sm"
            />
            <select
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value as OrderStatus | '全部')}
              className="rounded-lg border px-3 py-2 text-sm"
            >
              {(['全部', '待支付', '已支付', '配送中', '已完成', '已取消'] as const).map((status) => (
                <option key={status} value={status}>
                  状态：{status}
                </option>
              ))}
            </select>
            <select
              value={deliveryFilter}
              onChange={(e) => setDeliveryFilter(e.target.value as '全部' | '自取' | '外送')}
              className="rounded-lg border px-3 py-2 text-sm"
            >
              {(['全部', '自取', '外送'] as const).map((type) => (
                <option key={type} value={type}>
                  配送：{type}
                </option>
              ))}
            </select>
          </div>
        </div>

        <div className="overflow-hidden rounded-xl border">
          <table className="min-w-full divide-y divide-gray-200 text-sm">
            <thead className="bg-gray-50 text-gray-600">
              <tr>
                <th className="px-4 py-3 text-left font-semibold">订单号</th>
                <th className="px-4 py-3 text-left font-semibold">创建时间</th>
                <th className="px-4 py-3 text-left font-semibold">金额</th>
                <th className="px-4 py-3 text-left font-semibold">配送方式</th>
                <th className="px-4 py-3 text-left font-semibold">状态</th>
                <th className="px-4 py-3 text-left font-semibold">商品数</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {filteredOrders.length === 0 ? (
                <tr>
                  <td colSpan={6} className="px-4 py-6 text-center text-gray-500">
                    暂无符合条件的订单
                  </td>
                </tr>
              ) : (
                filteredOrders.map((order) => (
                  <tr key={order.id} className="hover:bg-gray-50">
                    <td className="px-4 py-3 font-medium text-gray-900">{order.id}</td>
                    <td className="px-4 py-3 text-gray-600">
                      {new Date(order.createdAt).toLocaleString('zh-CN', { hour12: false })}
                    </td>
                    <td className="px-4 py-3 font-semibold text-gray-900">
                      {currencyFormatter.format(order.totalCents / 100)}
                    </td>
                    <td className="px-4 py-3 text-gray-600">{order.deliveryType}</td>
                    <td className="px-4 py-3">
                      <span className={`inline-flex items-center rounded-full border px-2.5 py-1 text-xs font-semibold ${statusColors[order.status]}`}>
                        {order.status}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-gray-600">{order.items} 件</td>
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
            <h2 className="text-lg font-semibold text-gray-800">配送地址</h2>
            <span className="text-sm text-gray-500">共 {member.addresses.length} 个</span>
          </div>
          <div className="space-y-3">
            {member.addresses.map((addr) => (
              <div key={addr.id} className="rounded-lg border p-3 hover:border-gray-300">
                <div className="flex flex-wrap items-center gap-2 text-sm text-gray-700">
                  <span className="font-semibold">{addr.label}</span>
                  {addr.isDefault ? (
                    <span className="rounded-full bg-emerald-50 px-2 py-0.5 text-xs font-semibold text-emerald-700">默认</span>
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
              <h2 className="text-lg font-semibold text-gray-800">支付方式</h2>
              <span className="text-sm text-gray-500">{member.paymentMethods.length} 个绑定</span>
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
                        {pm.type} · 尾号 {pm.last4} · 有效期 {pm.expires}
                      </div>
                    </div>
                    {pm.isDefault ? (
                      <span className="rounded-full bg-blue-50 px-2 py-0.5 text-xs font-semibold text-blue-700">默认</span>
                    ) : null}
                  </div>
                </div>
              ))}
            </div>
          </div>

          <div className="rounded-xl border bg-white p-4 shadow-sm space-y-3">
            <div className="flex items-center justify-between">
              <h2 className="text-lg font-semibold text-gray-800">支付信息</h2>
              <span className="text-sm text-gray-500">账单与开票偏好</span>
            </div>
            <dl className="space-y-2 text-sm text-gray-700">
              <div className="flex items-center justify-between">
                <dt className="text-gray-500">通知邮箱</dt>
                <dd className="font-medium">{member.paymentProfile.email}</dd>
              </div>
              <div className="flex items-center justify-between">
                <dt className="text-gray-500">上次支付</dt>
                <dd className="font-medium">
                  {currencyFormatter.format(member.paymentProfile.lastPaymentAmountCents / 100)} ·{' '}
                  {new Date(member.paymentProfile.lastPaymentAt).toLocaleString('zh-CN', { hour12: false })}
                </dd>
              </div>
              <div className="flex items-center justify-between">
                <dt className="text-gray-500">默认支付方式</dt>
                <dd className="font-medium">
                  {member.paymentMethods.find((pm) => pm.id === member.paymentProfile.preferedMethodId)?.brand ?? '未设置'}
                </dd>
              </div>
              <div className="flex items-center justify-between">
                <dt className="text-gray-500">抬头</dt>
                <dd className="font-medium text-right">
                  <div>{member.paymentProfile.invoiceTitle}</div>
                  {member.paymentProfile.taxId ? (
                    <div className="text-xs text-gray-500">税号：{member.paymentProfile.taxId}</div>
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
