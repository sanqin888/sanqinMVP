//Users/apple/sanqinMVP/apps/web/src/app/[locale]/membership/page.tsx
'use client';

import Link from 'next/link';
import { useEffect, useState, useCallback } from 'react';
import { useParams, useRouter, useSearchParams } from 'next/navigation';
import type { Locale } from '@/lib/order/shared';
import { useSession, signOut } from 'next-auth/react';
import type { Session } from 'next-auth';
import { apiFetch } from '@/lib/api-client';

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
  orderNumber: string;
  clientRequestId: string | null;
  createdAt: string;
  totalCents: number;
  status: OrderStatus;
  items: number;
  deliveryType: DeliveryType;
};

type CouponStatus = 'active' | 'used' | 'expired';

type Coupon = {
  couponId: string;
  title: string;
  code: string;
  discountCents: number;
  minSpendCents?: number;
  expiresAt?: string;
  status: CouponStatus;
  source?: string;
  issuedAt?: string;
};

type MemberProfile = {
  userStableId: string;
  name?: string;
  email?: string;
  phone?: string | null;
  birthdayMonth?: number | null;
  birthdayDay?: number | null;
  referrerEmail?: string | null;
  tier: MemberTier;
  points: number;
  availableDiscountCents: number;
  lifetimeSpendCents?: number;
};

type ApiFulfillmentType = 'pickup' | 'dine_in' | 'delivery';
type ApiDeliveryType = 'STANDARD' | 'PRIORITY' | null;

type MembershipSummaryOrderDto = {
  orderStableId: string;
  clientRequestId: string | null;
  pickupCode: string | null;
  createdAt: string;
  totalCents: number;
  status: OrderStatus;
  fulfillmentType: ApiFulfillmentType;
  deliveryType: ApiDeliveryType;
};

type MembershipSummaryResponse = {
  userStableId: string;
  displayName: string | null;
  email: string | null;
  phone?: string | null;
  tier: MemberTier;
  points: number;
  lifetimeSpendCents: number;
  availableDiscountCents: number;
  marketingEmailOptIn?: boolean;
  birthdayMonth?: number | null;
  birthdayDay?: number | null;
  referrerEmail?: string | null;
  recentOrders: MembershipSummaryOrderDto[];
};

type MembershipSummaryApiEnvelope =
  | MembershipSummaryResponse
  | {
      code?: string;
      message?: string;
      details: MembershipSummaryResponse;
    };

type SessionWithUserId = Session & {
  userId?: string | null;
  user?: { id?: string | null } | null;
};

// ====== 积分流水类型 ======

type LoyaltyEntryType =
  | 'EARN_ON_PURCHASE'
  | 'REDEEM_ON_ORDER'
  | 'REFUND_REVERSE_EARN'
  | 'REFUND_RETURN_REDEEM'
  | 'TOPUP_PURCHASED'
  | 'ADJUSTMENT_MANUAL';

type LoyaltyEntry = {
  ledgerId: string;
  createdAt: string;
  type: LoyaltyEntryType;
  deltaPoints: number;
  balanceAfterPoints: number;
  note?: string;
  orderStableId?: string | null;
};

type MemberAddress = {
  addressStableId: string;
  label: string;
  receiver: string;
  phone?: string;
  addressLine1: string;
  addressLine2?: string;
  city: string;
  province: string;
  postalCode: string;
  isDefault?: boolean;
};

const formatMemberAddress = (address: MemberAddress): string => {
  const cityProvince = [address.city, address.province].filter(Boolean).join(', ');
  const segments = [
    address.addressLine1,
    address.addressLine2,
    cityProvince,
    address.postalCode,
  ].filter(Boolean);
  return segments.join(', ');
};

function formatOrderStatus(status: OrderStatus, isZh: boolean): string {
  const zh: Record<OrderStatus, string> = {
    pending: '待支付',
    paid: '已支付',
    making: '制作中',
    ready: '待取餐',
    completed: '已完成',
    refunded: '已退款',
  };
  const en: Record<OrderStatus, string> = {
    pending: 'Pending',
    paid: 'Paid',
    making: 'In progress',
    ready: 'Ready',
    completed: 'Completed',
    refunded: 'Refunded',
  };
  return isZh ? zh[status] : en[status];
}

function formatCurrency(cents: number): string {
  return `$${(cents / 100).toFixed(2)}`;
}

export default function MembershipHomePage() {
  const router = useRouter();
  const { locale } = useParams<{ locale: Locale }>();
  const { data: session, status } = useSession();
  const searchParams = useSearchParams();

  const [activeTab, setActiveTab] = useState<
    'overview' | 'orders' | 'points' | 'addresses' | 'coupons' | 'profile'
  >('overview');

  const [member, setMember] = useState<MemberProfile | null>(null);
  const [orders, setOrders] = useState<OrderHistory[]>([]);
  const [summaryLoading, setSummaryLoading] = useState(true);
  const [summaryError, setSummaryError] = useState<string | null>(null);

  const [coupons, setCoupons] = useState<Coupon[]>([]);
  const [couponLoading, setCouponLoading] = useState(false);
  const [couponError, setCouponError] = useState<string | null>(null);

  // 营销邮件订阅状态
  const [marketingOptIn, setMarketingOptIn] = useState<boolean | null>(null);
  const [marketingSaving, setMarketingSaving] = useState(false);
  const [marketingError, setMarketingError] = useState<string | null>(null);

  // 账户信息编辑
  const [profileName, setProfileName] = useState('');
  const [birthdayMonthInput, setBirthdayMonthInput] = useState('');
  const [birthdayDayInput, setBirthdayDayInput] = useState('');
  const [profileSaving, setProfileSaving] = useState(false);
  const [profileError, setProfileError] = useState<string | null>(null);
  const [profileSaved, setProfileSaved] = useState(false);

  // 积分流水
  const [loyaltyEntries, setLoyaltyEntries] = useState<LoyaltyEntry[]>([]);
  const [loyaltyLoading, setLoyaltyLoading] = useState(false);
  const [loyaltyError, setLoyaltyError] = useState<string | null>(null);
  const [loyaltyLoadedOnce, setLoyaltyLoadedOnce] = useState(false);

  const [addresses, setAddresses] = useState<MemberAddress[]>([]);
  const [addressesLoading, setAddressesLoading] = useState(false);
  const [addressesError, setAddressesError] = useState<string | null>(null);

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

    const s = session as SessionWithUserId | null;
    const userStableId = s?.userId ?? s?.user?.id ?? undefined;
    if (!userStableId) return;

    const controller = new AbortController();

    const loadSummary = async () => {
      try {
        setSummaryLoading(true);
        setSummaryError(null);

        const user = s?.user ?? session.user;
        const params = new URLSearchParams({ userStableId });
        if (user?.email) {
          params.set('email', user.email);
        }

        // 👇 如果 Google 登录回调 URL 上带了已验证手机号，则一并传给 membership 做绑定
        const phoneFromQuery = searchParams?.get('phone') ?? undefined;
        const phoneVerificationToken = searchParams?.get('pv') ?? undefined;
        if (phoneFromQuery && phoneVerificationToken) {
          params.set('phone', phoneFromQuery);
          params.set('pv', phoneVerificationToken);
        }

        // 首次注册时 localStorage 里存的推荐人/生日，只用一次
        if (typeof window !== 'undefined') {
          try {
            const rawExtra = window.localStorage.getItem(
              'sanqin_membership_prefill',
            );
            if (rawExtra) {
              const extra = JSON.parse(rawExtra) as {
                phone?: string | null;
                phoneVerificationToken?: string | null;
                referrerEmail?: string | null;
                birthdayMonth?: string | null | number;
                birthdayDay?: string | null | number;
                marketingEmailOptIn?: boolean;
              };

              if (!phoneFromQuery && extra.phone && extra.phoneVerificationToken) {
                params.set('phone', String(extra.phone));
                params.set('pv', String(extra.phoneVerificationToken));
              }

              if (extra.referrerEmail) {
                params.set('referrerEmail', String(extra.referrerEmail));
              }
              if (extra.birthdayMonth && extra.birthdayDay) {
                params.set('birthdayMonth', String(extra.birthdayMonth));
                params.set('birthdayDay', String(extra.birthdayDay));
              }

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
          let errorMessage = '';
          try {
            const errorBody = (await res.json()) as { message?: string };
            if (errorBody?.message) {
              errorMessage = errorBody.message;
            }
          } catch {
            try {
              const text = await res.text();
              if (text) {
                errorMessage = text;
              }
            } catch (readError) {
              console.warn(
                'Failed to read membership summary error response',
                readError,
              );
            }
          }

          console.warn('Membership summary request failed', {
            status: res.status,
            message: errorMessage,
          });
          setSummaryError(
            isZh
              ? '加载会员信息失败，请稍后再试'
              : 'Failed to load membership info. Please try again later.',
          );
          return;
        }

        let raw: MembershipSummaryApiEnvelope;
        try {
          raw = (await res.json()) as MembershipSummaryApiEnvelope;
        } catch (error) {
          console.error('Failed to parse membership summary response', error);
          setSummaryError(
            isZh
              ? '加载会员信息失败，请稍后再试'
              : 'Failed to load membership info. Please try again later.',
          );
          return;
        }
        const data =
          'details' in raw && raw.details
            ? raw.details
            : (raw as MembershipSummaryResponse);

        setMember({
          userStableId: data.userStableId,
          name: data.displayName ?? user?.name ?? undefined,
          email: data.email ?? user?.email ?? undefined,
          phone: data.phone ?? undefined,
          birthdayMonth: data.birthdayMonth ?? null,
          birthdayDay: data.birthdayDay ?? null,
          referrerEmail: data.referrerEmail ?? null,
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
            orderNumber: o.orderStableId,
            clientRequestId: o.clientRequestId ?? null,
            createdAt: new Date(o.createdAt).toLocaleString(),
            totalCents: o.totalCents,
            status: o.status,
            items: 0,
            deliveryType: o.fulfillmentType === "delivery" ? "delivery" : "pickup",
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
  }, [status, session, isZh, locale, searchParams]);

  // 拉取优惠券：会员信息到手后再查询
  useEffect(() => {
    if (!member?.userStableId) {
      setCoupons([]);
      setCouponLoading(false);
      setCouponError(null);
      return;
    }

    const controller = new AbortController();

    const loadCoupons = async () => {
      try {
        setCouponLoading(true);
        setCouponError(null);

        const params = new URLSearchParams([
          ['userStableId', member.userStableId],
        ]);
        const res = await fetch(
          `/api/v1/membership/coupons?${params.toString()}`,
          { signal: controller.signal },
        );

        if (!res.ok) {
          throw new Error(`Failed with status ${res.status}`);
        }

        const raw = (await res.json()) as
          | Coupon[]
          | { code?: string; message?: string; details?: Coupon[] };

        let list: Coupon[] = [];

        if (Array.isArray(raw)) {
          list = raw;
        } else if (raw && Array.isArray(raw.details)) {
          list = raw.details;
        }

        setCoupons(list);
      } catch (err) {
        if (err instanceof DOMException && err.name === 'AbortError') return;
        console.error(err);
        setCoupons([]);
        setCouponError(
          isZh
            ? '优惠券加载失败，请稍后再试。'
            : 'Failed to load coupons. Please try again later.',
        );
      } finally {
        setCouponLoading(false);
      }
    };

    void loadCoupons();
    return () => controller.abort();
  }, [member?.userStableId, isZh]);

  useEffect(() => {
    if (!member) return;
    setProfileName(member.name ?? '');
    setBirthdayMonthInput(
      member.birthdayMonth != null ? String(member.birthdayMonth) : '',
    );
    setBirthdayDayInput(
      member.birthdayDay != null ? String(member.birthdayDay) : '',
    );
    setProfileSaved(false);
  }, [member]);

  useEffect(() => {
    setProfileSaved(false);
  }, [profileName, birthdayMonthInput, birthdayDayInput]);

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

    const s = session as SessionWithUserId | null;
    const userStableId = s?.userId ?? s?.user?.id ?? undefined;
    if (!userStableId) return;

    const loadLedger = async () => {
      try {
        setLoyaltyLoading(true);
        setLoyaltyError(null);

        const params = new URLSearchParams({
          userStableId,
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

  const handleMarketingToggle = useCallback(
    async (next: boolean) => {
      if (!member) return;

      setMarketingSaving(true);
      setMarketingError(null);

      try {
        const res = await fetch('/api/v1/membership/marketing-consent', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            userStableId: member.userStableId,
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
    },
    [member, isZh],
  );

  const handleProfileSave = useCallback(async () => {
    if (!member) return;
    setProfileSaving(true);
    setProfileError(null);
    setProfileSaved(false);

    const payload: {
      userStableId: string;
      name?: string | null;
      birthdayMonth?: number | null;
      birthdayDay?: number | null;
    } = { userStableId: member.userStableId };

    const trimmedName = profileName.trim();
    if (trimmedName.length > 0) {
      payload.name = trimmedName;
    }

    if (member.birthdayMonth == null && member.birthdayDay == null) {
      if (birthdayMonthInput || birthdayDayInput) {
        const parsedMonth = Number.parseInt(birthdayMonthInput, 10);
        const parsedDay = Number.parseInt(birthdayDayInput, 10);
        if (
          !Number.isFinite(parsedMonth) ||
          !Number.isFinite(parsedDay) ||
          parsedMonth < 1 ||
          parsedMonth > 12 ||
          parsedDay < 1 ||
          parsedDay > 31
        ) {
          setProfileSaving(false);
          setProfileError(
            isZh
              ? '生日格式不正确，请填写 1-12 月和 1-31 日。'
              : 'Invalid birthday. Please enter month 1-12 and day 1-31.',
          );
          return;
        }
        payload.birthdayMonth = parsedMonth;
        payload.birthdayDay = parsedDay;
      }
    }

    try {
      const res = await fetch('/api/v1/membership/profile', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });

      if (!res.ok) {
        throw new Error(`Failed with status ${res.status}`);
      }

      const raw = (await res.json()) as {
        success?: boolean;
        user?: {
          id?: string;
          name?: string | null;
          birthdayMonth?: number | null;
          birthdayDay?: number | null;
        };
      };

      const updated = raw?.user;

      if (updated) {
        setMember((prev) =>
          prev
            ? {
                ...prev,
                name: updated.name ?? prev.name,
                birthdayMonth:
                  updated.birthdayMonth ?? prev.birthdayMonth ?? null,
                birthdayDay:
                  updated.birthdayDay ?? prev.birthdayDay ?? null,
              }
            : prev,
        );
      }
      setProfileSaved(true);
    } catch (err) {
      console.error(err);
      setProfileError(
        isZh
          ? '保存失败，请稍后再试。'
          : 'Failed to save. Please try again later.',
      );
    } finally {
      setProfileSaving(false);
    }
  }, [
    member,
    profileName,
    birthdayMonthInput,
    birthdayDayInput,
    isZh,
  ]);

  // ⭐ 新增：如果注册时勾选了“营销邮件”，第一次进入会员中心时自动帮他开关一次
  useEffect(() => {
    if (typeof window === 'undefined') return;
    if (!member?.userStableId) return;
    if (marketingOptIn === null) return;      // 还没从后端拿到数据
    if (marketingSaving) return;             // 正在提交就先不动

    try {
      const flag = window.localStorage.getItem(
        'sanqin_marketing_optin_initial',
      );
      // 只有在当前还是 false 且 flag=1 时，自动打开一次
      if (flag === '1' && marketingOptIn === false) {
        void handleMarketingToggle(true);
        window.localStorage.removeItem('sanqin_marketing_optin_initial');
      }
    } catch (e) {
      console.error(
        'Failed to apply initial marketing opt-in from localStorage',
        e,
      );
    }
  }, [member?.userStableId, marketingOptIn, marketingSaving, handleMarketingToggle]);

  const isLoading = status === 'loading' || summaryLoading;

  const loadAddresses = useCallback(async () => {
    if (!member?.userStableId) return;

    try {
      setAddressesLoading(true);
      setAddressesError(null);
      const params = new URLSearchParams({
        userStableId: member.userStableId,
      });
      const list = await apiFetch<MemberAddress[]>(
        `/membership/addresses?${params.toString()}`,
      );
      setAddresses(list ?? []);
    } catch (error) {
      console.error('Failed to load addresses', error);
      setAddressesError(
        isZh ? '地址加载失败，请稍后再试。' : 'Failed to load addresses.',
      );
      setAddresses([]);
    } finally {
      setAddressesLoading(false);
    }
  }, [isZh, member?.userStableId]);

  useEffect(() => {
    void loadAddresses();
  }, [loadAddresses]);

  const handleAddAddress = useCallback(
    async (address: MemberAddress, setDefault: boolean) => {
      if (!member?.userStableId) return;
      try {
        await apiFetch<{ success: boolean }>('/membership/addresses', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            userStableId: member.userStableId,
            label: address.label,
            receiver: address.receiver,
            phone: address.phone ?? '',
            addressLine1: address.addressLine1,
            addressLine2: address.addressLine2 ?? '',
            city: address.city,
            province: address.province,
            postalCode: address.postalCode,
            isDefault: setDefault,
          }),
        });
        await loadAddresses();
      } catch (error) {
        console.error('Failed to add address', error);
        setAddressesError(
          isZh ? '地址保存失败，请稍后再试。' : 'Failed to save address.',
        );
      }
    },
    [isZh, loadAddresses, member?.userStableId],
  );

  const handleDeleteAddress = useCallback(
    async (addressStableId: string) => {
      if (!member?.userStableId) return;
      try {
        const params = new URLSearchParams({
          userStableId: member.userStableId,
          addressStableId,
        });
        await apiFetch<{ success: boolean }>(
          `/membership/addresses?${params.toString()}`,
          { method: 'DELETE' },
        );
        await loadAddresses();
      } catch (error) {
        console.error('Failed to delete address', error);
        setAddressesError(
          isZh ? '地址删除失败，请稍后再试。' : 'Failed to delete address.',
        );
      }
    },
    [isZh, loadAddresses, member?.userStableId],
  );

  const handleSetDefault = useCallback(
    async (addressStableId: string) => {
      if (!member?.userStableId) return;
      try {
        await apiFetch<{ success: boolean }>('/membership/addresses/default', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            userStableId: member.userStableId,
            addressStableId,
          }),
        });
        await loadAddresses();
      } catch (error) {
        console.error('Failed to set default address', error);
        setAddressesError(
          isZh ? '默认地址设置失败，请稍后再试。' : 'Failed to set default address.',
        );
      }
    },
    [isZh, loadAddresses, member?.userStableId],
  );

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
              locale={locale as Locale}
            />
          )}

          {activeTab === 'orders' && (
            <OrdersSection
              isZh={isZh}
              orders={orders}
              locale={locale as Locale}
            />
          )}

          {activeTab === 'points' && (
            <PointsSection
              isZh={isZh}
              entries={loyaltyEntries}
              loading={loyaltyLoading}
              error={loyaltyError}
              locale={locale as Locale}
              loadedOnce={loyaltyLoadedOnce}
            />
          )}

          {activeTab === 'addresses' && (
            <AddressesSection
              isZh={isZh}
              addresses={addresses}
              loading={addressesLoading}
              error={addressesError}
              onAddAddress={handleAddAddress}
              onDeleteAddress={handleDeleteAddress}
              onSetDefault={handleSetDefault}
            />
          )}

          {activeTab === 'coupons' && (
            <CouponsSection
              isZh={isZh}
              coupons={coupons}
              loading={couponLoading}
              error={couponError}
            />
          )}

          {activeTab === 'profile' && (
            <ProfileSection
              isZh={isZh}
              user={member}
              profileName={profileName}
              birthdayMonthInput={birthdayMonthInput}
              birthdayDayInput={birthdayDayInput}
              onProfileNameChange={setProfileName}
              onBirthdayMonthChange={setBirthdayMonthInput}
              onBirthdayDayChange={setBirthdayDayInput}
              profileSaving={profileSaving}
              profileError={profileError}
              profileSaved={profileSaved}
              onSaveProfile={handleProfileSave}
              marketingOptIn={marketingOptIn}
              marketingSaving={marketingSaving}
              marketingError={marketingError}
              onToggleMarketing={handleMarketingToggle}
              locale={locale as Locale}
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
                {latestOrder.orderNumber}
              </span>
            </p>
            <p>
              {isZh ? '订单编号：' : 'Order Number: '}
              <span className="font-mono text-slate-900">
                {latestOrder.clientRequestId ?? '--'}
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
              <span className="font-medium text-slate-900">
                {formatOrderStatus(latestOrder.status, isZh)}
              </span>
            </p>
            <p className="mt-2">
              <Link
                href={`/${locale}/order/${latestOrder.orderNumber}`}
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
        {orders.map((order, index) => (
          <Link
            key={`${order.orderNumber}-${order.createdAt}-${index}`}
            href={`/${locale}/order/${order.orderNumber}`}
            className="flex items-center justify-between py-3 hover:bg-slate-50 rounded-lg px-2 -mx-2"
          >
            <div>
              <p className="font-mono text-slate-900">{order.orderNumber}</p>
              <p className="mt-1 text-[11px] text-slate-500">
                {isZh ? '订单编号：' : 'Order Number: '}
                <span className="font-mono text-slate-700">
                  {order.clientRequestId ?? '--'}
                </span>
              </p>
              <p className="mt-1 text-[11px] text-slate-500">
                {order.createdAt}
              </p>
            </div>
            <div className="text-right">
              <p className="font-medium text-slate-900">
                {formatCurrency(order.totalCents)}
              </p>
              <p className="mt-1 text-[11px] text-slate-500">
                {formatOrderStatus(order.status, isZh)}
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
            <div key={entry.ledgerId} className="py-2">
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
                  {entry.orderStableId && (
                    <p className="mt-1 text-[11px]">
                      <Link
                        href={`/${locale}/order/${entry.orderStableId}`}
                        className="text-amber-600 hover:underline"
                      >
                        {isZh ? '关联订单' : 'Related order'}: {entry.orderStableId}
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
  loading,
  error,
  onAddAddress,
  onDeleteAddress,
  onSetDefault,
}: {
  isZh: boolean;
  addresses: MemberAddress[];
  loading: boolean;
  error: string | null;
  onAddAddress: (address: MemberAddress, setDefault: boolean) => void;
  onDeleteAddress: (addressStableId: string) => void;
  onSetDefault: (addressStableId: string) => void;
}) {
  const [label, setLabel] = useState('');
  const [receiver, setReceiver] = useState('');
  const [phone, setPhone] = useState('');
  const [addressLine1, setAddressLine1] = useState('');
  const [addressLine2, setAddressLine2] = useState('');
  const [city, setCity] = useState('');
  const [province, setProvince] = useState('');
  const [postalCode, setPostalCode] = useState('');
  const [setAsDefault, setSetAsDefault] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);

  const resetForm = () => {
    setLabel('');
    setReceiver('');
    setPhone('');
    setAddressLine1('');
    setAddressLine2('');
    setCity('');
    setProvince('');
    setPostalCode('');
    setSetAsDefault(false);
    setFormError(null);
  };

  const handleAdd = () => {
    const trimmedReceiver = receiver.trim();
    const trimmedLine1 = addressLine1.trim();
    const trimmedCity = city.trim();
    const trimmedProvince = province.trim();
    const trimmedPostal = postalCode.trim();

    if (
      !trimmedReceiver ||
      !trimmedLine1 ||
      !trimmedCity ||
      !trimmedProvince ||
      !trimmedPostal
    ) {
      setFormError(
        isZh ? '请填写完整地址与联系人信息。' : 'Please complete the address details.',
      );
      return;
    }

    const fallbackLabel = isZh ? '地址' : 'Address';
    const address: MemberAddress = {
      addressStableId: '',
      label: label.trim() || fallbackLabel,
      receiver: trimmedReceiver,
      phone: phone.trim(),
      addressLine1: trimmedLine1,
      addressLine2: addressLine2.trim(),
      city: trimmedCity,
      province: trimmedProvince,
      postalCode: trimmedPostal,
      isDefault: setAsDefault,
    };

    onAddAddress(address, setAsDefault);
    resetForm();
  };

  return (
    <section className="rounded-2xl bg-white p-4 shadow-sm ring-1 ring-slate-200">
      <div className="mb-3 flex items-center justify-between">
        <h2 className="text-sm font-medium text-slate-900">
          {isZh ? '收货地址' : 'Delivery addresses'}
        </h2>
      </div>

      {loading && (
        <p className="mb-3 text-xs text-slate-500">
          {isZh ? '地址加载中…' : 'Loading addresses…'}
        </p>
      )}
      {error && <p className="mb-3 text-xs text-rose-600">{error}</p>}

      <div className="mb-4 rounded-xl border border-slate-200 bg-slate-50 p-3 text-xs text-slate-700">
        <p className="mb-2 text-[11px] font-medium text-slate-500">
          {isZh ? '新增地址' : 'Add a new address'}
        </p>
        <div className="grid gap-2 sm:grid-cols-2">
          <input
            className="rounded-lg border border-slate-200 px-3 py-2 text-xs"
            placeholder={isZh ? '地址标签（例如：家）' : 'Label (e.g. Home)'}
            value={label}
            onChange={(event) => setLabel(event.target.value)}
          />
          <input
            className="rounded-lg border border-slate-200 px-3 py-2 text-xs"
            placeholder={isZh ? '收件人姓名' : 'Receiver name'}
            value={receiver}
            onChange={(event) => setReceiver(event.target.value)}
          />
          <input
            className="rounded-lg border border-slate-200 px-3 py-2 text-xs"
            placeholder={isZh ? '联系电话' : 'Phone number'}
            value={phone}
            onChange={(event) => setPhone(event.target.value)}
          />
          <input
            className="rounded-lg border border-slate-200 px-3 py-2 text-xs"
            placeholder={isZh ? '地址行 1' : 'Address line 1'}
            value={addressLine1}
            onChange={(event) => setAddressLine1(event.target.value)}
          />
          <input
            className="rounded-lg border border-slate-200 px-3 py-2 text-xs"
            placeholder={isZh ? '地址行 2（可选）' : 'Address line 2 (optional)'}
            value={addressLine2}
            onChange={(event) => setAddressLine2(event.target.value)}
          />
          <input
            className="rounded-lg border border-slate-200 px-3 py-2 text-xs"
            placeholder={isZh ? '城市' : 'City'}
            value={city}
            onChange={(event) => setCity(event.target.value)}
          />
          <input
            className="rounded-lg border border-slate-200 px-3 py-2 text-xs"
            placeholder={isZh ? '省份/州' : 'Province/State'}
            value={province}
            onChange={(event) => setProvince(event.target.value)}
          />
          <input
            className="rounded-lg border border-slate-200 px-3 py-2 text-xs"
            placeholder={isZh ? '邮编' : 'Postal code'}
            value={postalCode}
            onChange={(event) => setPostalCode(event.target.value)}
          />
        </div>
        <label className="mt-3 flex items-center gap-2 text-[11px] text-slate-600">
          <input
            type="checkbox"
            checked={setAsDefault}
            onChange={(event) => setSetAsDefault(event.target.checked)}
          />
          {isZh ? '设为默认地址' : 'Set as default'}
        </label>
        {formError && <p className="mt-2 text-[11px] text-rose-600">{formError}</p>}
        <button
          type="button"
          className="mt-3 inline-flex items-center justify-center rounded-full bg-slate-900 px-4 py-2 text-[11px] font-medium text-white hover:bg-slate-800"
          onClick={handleAdd}
        >
          {isZh ? '保存地址' : 'Save address'}
        </button>
      </div>

      <div className="space-y-3 text-xs text-slate-700">
        {addresses.map((addr) => (
          <div
            key={addr.addressStableId}
            className="rounded-xl border border-slate-200 bg-slate-50 px-3 py-2"
          >
            <div className="flex items-center justify-between">
              <div className="font-medium text-slate-900">
                {addr.label}
              </div>
              <div className="flex items-center gap-2">
                {addr.isDefault && (
                  <span className="rounded-full bg-slate-900 px-2 py-0.5 text-[10px] text-white">
                    {isZh ? '默认' : 'Default'}
                  </span>
                )}
                {!addr.isDefault && (
                  <button
                    type="button"
                    className="text-[10px] text-slate-500 hover:text-slate-900"
                    onClick={() => onSetDefault(addr.addressStableId)}
                  >
                    {isZh ? '设为默认' : 'Set default'}
                  </button>
                )}
              </div>
            </div>
            <p className="mt-1">
              {addr.receiver} · {addr.phone}
            </p>
            <p className="mt-1 text-slate-600">
              {formatMemberAddress(addr)}
            </p>
            <div className="mt-2 flex items-center gap-3 text-[10px] text-slate-500">
              <button
                type="button"
                className="hover:text-rose-600"
                onClick={() => onDeleteAddress(addr.addressStableId)}
              >
                {isZh ? '删除' : 'Delete'}
              </button>
            </div>
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
  loading,
  error,
}: {
  isZh: boolean;
  coupons: Coupon[];
  loading: boolean;
  error: string | null;
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

      {loading && (
        <p className="text-xs text-slate-500">
          {isZh ? '优惠券加载中…' : 'Loading coupons…'}
        </p>
      )}

      {error && (
        <p className="text-[11px] text-red-600">{error}</p>
      )}

      <div className="space-y-3 text-xs text-slate-700">
        {coupons.map((coupon) => {
          const status = coupon.status ?? 'active';

          return (
            <div
              key={coupon.couponId}
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
                    statusColor[status]
                  }`}
                >
                  {statusLabel[status]}
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
                  <p className="mt-0.5">
                    {coupon.expiresAt
                      ? new Date(coupon.expiresAt).toLocaleDateString()
                      : isZh
                        ? '无有效期'
                        : 'No expiry'}
                  </p>
                </div>
              </div>
            </div>
          );
        })}

        {coupons.length === 0 && !loading && (
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
  profileName,
  birthdayMonthInput,
  birthdayDayInput,
  onProfileNameChange,
  onBirthdayMonthChange,
  onBirthdayDayChange,
  profileSaving,
  profileError,
  profileSaved,
  onSaveProfile,
  marketingOptIn,
  marketingSaving,
  marketingError,
  onToggleMarketing,
  locale,
}: {
  isZh: boolean;
  user: MemberProfile;
  profileName: string;
  birthdayMonthInput: string;
  birthdayDayInput: string;
  onProfileNameChange: (value: string) => void;
  onBirthdayMonthChange: (value: string) => void;
  onBirthdayDayChange: (value: string) => void;
  profileSaving: boolean;
  profileError: string | null;
  profileSaved: boolean;
  onSaveProfile: () => void;
  marketingOptIn: boolean | null;
  marketingSaving: boolean;
  marketingError: string | null;
  onToggleMarketing: (next: boolean) => void;
  locale: Locale;
}) {
  const effectiveOptIn = !!marketingOptIn;
  const hasBirthday =
    user.birthdayMonth != null && user.birthdayDay != null;
  const birthdayDisplay = hasBirthday
    ? isZh
      ? `${user.birthdayMonth}月${user.birthdayDay}日`
      : `${user.birthdayMonth}/${user.birthdayDay}`
    : null;

  return (
    <section className="rounded-2xl bg-white p-4 shadow-sm ring-1 ring-slate-200">
      <h2 className="text-sm font-medium text-slate-900">
        {isZh ? '账户信息' : 'Account info'}
      </h2>

      <div className="mt-3 space-y-3 text-xs text-slate-700">
        <div>
          <p className="text-slate-500">{isZh ? '昵称' : 'Name'}</p>
          <div className="mt-1 flex flex-wrap items-center gap-2">
            <input
              type="text"
              value={profileName}
              onChange={(event) => onProfileNameChange(event.target.value)}
              className="w-full rounded-lg border border-slate-200 px-2.5 py-1.5 text-xs text-slate-900 placeholder:text-slate-400 focus:border-slate-400 focus:outline-none sm:w-auto sm:min-w-[220px]"
              placeholder={isZh ? '请输入昵称' : 'Enter your name'}
            />
            <button
              type="button"
              onClick={onSaveProfile}
              disabled={profileSaving}
              className="rounded-full bg-slate-900 px-3 py-1.5 text-[11px] font-medium text-white hover:bg-slate-800 disabled:cursor-not-allowed disabled:bg-slate-400"
            >
              {profileSaving
                ? isZh
                  ? '保存中...'
                  : 'Saving...'
                : isZh
                  ? '保存'
                  : 'Save'}
            </button>
            {profileSaved && !profileSaving && (
              <span className="text-[11px] text-emerald-600">
                {isZh ? '已保存' : 'Saved'}
              </span>
            )}
          </div>
        </div>
        <div>
          <p className="text-slate-500">{isZh ? '生日' : 'Birthday'}</p>
          {hasBirthday ? (
            <p className="mt-0.5 text-slate-900">
              {birthdayDisplay}
              <span className="ml-2 text-[11px] text-slate-400">
                {isZh ? '已设置，无法修改' : 'Locked once set'}
              </span>
            </p>
          ) : (
            <div className="mt-1 flex flex-wrap items-center gap-2">
              <input
                type="number"
                min={1}
                max={12}
                value={birthdayMonthInput}
                onChange={(event) =>
                  onBirthdayMonthChange(event.target.value)
                }
                className="w-20 rounded-lg border border-slate-200 px-2 py-1.5 text-xs text-slate-900 focus:border-slate-400 focus:outline-none"
                placeholder={isZh ? '月' : 'MM'}
              />
              <input
                type="number"
                min={1}
                max={31}
                value={birthdayDayInput}
                onChange={(event) =>
                  onBirthdayDayChange(event.target.value)
                }
                className="w-20 rounded-lg border border-slate-200 px-2 py-1.5 text-xs text-slate-900 focus:border-slate-400 focus:outline-none"
                placeholder={isZh ? '日' : 'DD'}
              />
              <span className="text-[11px] text-slate-400">
                {isZh ? '填写后不可修改' : 'Once saved, cannot change'}
              </span>
            </div>
          )}
        </div>
        <div>
          <p className="text-slate-500">{isZh ? '邮箱' : 'Email'}</p>
          <p className="mt-0.5 text-slate-900">
            {user.email || (isZh ? '未绑定' : 'Not linked')}
          </p>
        </div>
        {user.referrerEmail ? (
          <div>
            <p className="text-slate-500">
              {isZh ? '推荐人邮箱' : 'Referrer email'}
            </p>
            <p className="mt-0.5 text-slate-900">
              {user.referrerEmail}
            </p>
          </div>
        ) : null}
        <div>
          <p className="text-slate-500">{isZh ? '手机号' : 'Phone'}</p>
          <div className="mt-0.5 flex items-center justify-between gap-2">
            <p className="text-slate-900">
              {user.phone || (isZh ? '未绑定' : 'Not linked')}
            </p>
            <Link
              href={`/${locale}/membership/login`}
              className="shrink-0 rounded-full border border-slate-200 px-2.5 py-1 text-[11px] font-medium text-slate-700 hover:bg-slate-50"
            >
              {isZh ? '更换手机号' : 'Change phone'}
            </Link>
          </div>
        </div>
        <div>
          <p className="text-slate-500">
            {isZh ? '会员编号（Stable ID）' : 'Member ID (Stable ID)'}
          </p>
          <p className="mt-0.5 break-all font-mono text-[11px] text-slate-900">
            {user.userStableId || (isZh ? '未识别' : 'Not available')}
          </p>
        </div>

        {/* 营销邮件订阅开关 */}
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
        {profileError && (
          <p className="text-[11px] text-rose-500">{profileError}</p>
        )}

        {/* 会员规则入口 */}
        <div className="mt-4 border-t border-slate-100 pt-3">
          <p className="text-slate-500">
            {isZh ? '会员规则' : 'Membership rules'}
          </p>
          <p className="mt-1 text-[11px] text-slate-500">
            {isZh
              ? '查看积分如何累积、抵扣、退款时如何处理等详细说明。'
              : 'See details on how points are earned, redeemed, and adjusted on refunds.'}
          </p>
          <Link
            href={`/${locale}/membership/rules`}
            className="mt-2 inline-flex items-center rounded-full bg-slate-900 px-3 py-1.5 text-xs font-medium text-white hover:bg-slate-800"
          >
            {isZh ? '查看会员规则' : 'View membership rules'}
          </Link>
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
