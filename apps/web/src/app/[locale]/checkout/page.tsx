// apps/web/src/app/[locale]/checkout/page.tsx
"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import type { Session } from "next-auth";
import {
  usePathname,
  useRouter,
  useSearchParams,
  useParams,
} from "next/navigation";
import { apiFetch } from "@/lib/api-client";
import { usePersistentCart } from "@/lib/cart";
import {
  calculateDistanceKm,
  geocodeAddress,
  STORE_COORDINATES,
  DELIVERY_RADIUS_KM,
} from "@/lib/location";
import {
  ConfirmationState,
  HOSTED_CHECKOUT_CURRENCY,
  LANGUAGE_NAMES,
  LOCALES,
  type Locale,
  type LocalizedCartItem,
  type ScheduleSlot,
  TAX_ON_DELIVERY,
  TAX_RATE,
  UI_STRINGS,
  addLocaleToPath,
  formatWithOrder,
  formatWithTotal,
  localizeMenuItem,
  MENU_ITEM_LOOKUP,
  type HostedCheckoutResponse,
  type DeliveryTypeOption,
} from "@/lib/order/shared";
import { useSession } from "next-auth/react";

const PHONE_OTP_REQUEST_URL = "/api/v1/auth/phone/request-code";
const PHONE_OTP_VERIFY_URL = "/api/v1/auth/phone/verify-code";

type DeliveryOptionDefinition = {
  provider: "DOORDASH" | "UBER";
  fee: number; // 仅用于显示说明，不参与实际计费
  eta: [number, number];
  labels: Record<Locale, { title: string; description: string }>;
};

type DeliveryOptionDisplay = {
  type: DeliveryTypeOption;
  /** 展示给用户看的配送费（单位：分） */
  fee: number;
  eta: [number, number];
  provider: DeliveryOptionDefinition["provider"];
  title: string;
  description: string;
};

type DistanceMessage = {
  text: string;
  tone: "muted" | "info" | "success" | "error";
};

type SessionWithUserId = Session & {
  userId?: string | null;
  user?: (Session["user"] & { id?: string | null }) | null;
};

type MemberTier = "BRONZE" | "SILVER" | "GOLD" | "PLATINUM";

type MembershipSummaryResponse = {
  userId: string;
  displayName: string | null;
  email: string | null;
  phone: string | null;
  tier: MemberTier;
  points: number;
  lifetimeSpendCents: number;
  availableDiscountCents: number;
  recentOrders: unknown[];
  phoneVerified?: boolean;
};

type MembershipSummaryEnvelope =
  | MembershipSummaryResponse
  | {
      code?: string;
      message?: string;
      details: MembershipSummaryResponse;
    };

type LoyaltyInfo = {
  userId: string;
  tier: MemberTier;
  points: number;
  availableDiscountCents: number;
};

type CheckoutCoupon = {
  id: string;
  title: string;
  code: string;
  discountCents: number;
  minSpendCents?: number;
  expiresAt?: string;
  // 为了过滤 “active” / “expired”等状态，加个可选字段，避免 TS 报错
  status?: "active" | "used" | "expired" | string;
};

type CouponsApiEnvelope =
  | CheckoutCoupon[]
  | {
      code?: string;
      message?: string;
      details?: CheckoutCoupon[];
    };

// 保证 Clover 那边收到的 item.name 是英文
function resolveEnglishName(itemId: string, localizedName: string): string {
  const def = MENU_ITEM_LOOKUP.get(itemId);
  if (!def) return localizedName;

  const enName = def.i18n?.en?.name;
  if (typeof enName === "string") {
    const trimmed = enName.trim();
    if (trimmed.length > 0) return trimmed;
  }
  return localizedName;
}

type CustomerInfo = {
  name: string;
  phone: string;
  addressLine1: string;
  addressLine2: string;
  city: string;
  province: string;
  postalCode: string;
  notes: string;
};

const DEFAULT_CITY = "Toronto";
const DEFAULT_PROVINCE = "ON";
const DELIVERY_COUNTRY = "Canada";
const POSTAL_CODE_PATTERN = /^[A-Za-z]\d[A-Za-z]\s?\d[A-Za-z]\d$/;
const PRIORITY_MAX_RADIUS_KM = DELIVERY_RADIUS_KM;

const formatDeliveryAddress = (customer: CustomerInfo) => {
  const cityProvince = [customer.city.trim(), customer.province.trim()]
    .filter(Boolean)
    .join(", ");
  const segments = [
    customer.addressLine1.trim(),
    customer.addressLine2.trim(),
    cityProvince,
    customer.postalCode.trim(),
    DELIVERY_COUNTRY,
  ].filter(Boolean);
  return segments.join(", ");
};

const formatPostalCodeInput = (value: string) => {
  const sanitized = value.toUpperCase().replace(/[^A-Z0-9]/g, "");
  if (sanitized.length <= 3) {
    return sanitized;
  }
  return `${sanitized.slice(0, 3)} ${sanitized.slice(3, 6)}`.trim();
};

const isPostalCodeValid = (value: string) =>
  POSTAL_CODE_PATTERN.test(value.trim().toUpperCase());

const DELIVERY_OPTION_DEFINITIONS: Record<
  DeliveryTypeOption,
  DeliveryOptionDefinition
> = {
  STANDARD: {
    provider: "DOORDASH",
    fee: 6,
    eta: [45, 60],
    labels: {
      en: {
        title: "Standard delivery",
        description:
          "Delivery range ≤ 10 km, fulfilled by DoorDash. ETA 45–60 minutes.",
      },
      zh: {
        title: "标准配送",
        description:
          "配送范围 ≤ 10 km，由 DoorDash 提供配送服务，预计送达时间 45–60 分钟。",
      },
    },
  },
  PRIORITY: {
    provider: "UBER",
    fee: 6,
    eta: [25, 35],
    labels: {
      en: {
        title: "Uber delivery",
        description:
          "Delivery range ≤ 10 km, fulfilled by Uber. Fee: $6 base + $1 per km. ETA 25–35 minutes.",
      },
      zh: {
        title: "Uber 配送",
        description:
          "配送范围 ≤ 10 km，由 Uber 提供配送服务，配送费：$6 起步 + 每公里 $1，预计送达时间 25–35 分钟。",
      },
    },
  },
};

// 目前只开放 PRIORITY（如果将来要开放 STANDARD，改成 ["STANDARD", "PRIORITY"]）
const DELIVERY_TYPES: DeliveryTypeOption[] = ["PRIORITY"];

export default function CheckoutPage() {
  const pathname = usePathname() || "/";
  const params = useParams<{ locale?: string }>();
  const locale = (params?.locale === "zh" ? "zh" : "en") as Locale;

  const router = useRouter();
  const searchParams = useSearchParams();
  const q = searchParams?.toString();
  const verifiedPhone = searchParams?.get("phone") ?? null; // 已验证手机号（如果有）
  const phoneVerifiedFlag = searchParams?.get("pv") ?? null; // "1" / "true" 代表已验证

  const strings = UI_STRINGS[locale];
  const radiusLabel = `${DELIVERY_RADIUS_KM} km`;
  const orderHref = q ? `/${locale}?${q}` : `/${locale}`;

  const { items, updateNotes, updateQuantity } = usePersistentCart();
  const { data: session, status: authStatus } = useSession();

  const membershipHref = `/${locale}/membership`;
  const membershipLabel =
    authStatus === "authenticated"
      ? locale === "zh"
        ? "会员中心"
        : "Membership"
      : locale === "zh"
        ? "会员登录"
        : "Member login";

  const [loyaltyLoading, setLoyaltyLoading] = useState(false);
  const [loyaltyError, setLoyaltyError] = useState<string | null>(null);

  const localizedCartItems = useMemo<LocalizedCartItem[]>(() => {
    return items
      .map((entry) => {
        const definition = MENU_ITEM_LOOKUP.get(entry.itemId);
        if (!definition) return null;
        return { ...entry, item: localizeMenuItem(definition, locale) };
      })
      .filter((item): item is LocalizedCartItem => Boolean(item));
  }, [items, locale]);

  const [fulfillment, setFulfillment] = useState<"pickup" | "delivery">(
    "pickup",
  );
  const [deliveryType, setDeliveryType] =
    useState<DeliveryTypeOption>("PRIORITY");
  const [schedule, setSchedule] = useState<ScheduleSlot>("asap");
  const [customer, setCustomer] = useState<CustomerInfo>({
    name: "",
    phone: "",
    addressLine1: "",
    addressLine2: "",
    city: DEFAULT_CITY,
    province: DEFAULT_PROVINCE,
    postalCode: "",
    notes: "",
  });

  // 会员手机号（从 membership 接口加载，用于预填）
  const [memberPhone, setMemberPhone] = useState<string | null>(null);
  const [phonePrefilled, setPhonePrefilled] = useState(false); // 只预填一次

  // 手机号验证流程状态
  const [phoneVerificationStep, setPhoneVerificationStep] = useState<
    "idle" | "codeSent" | "verified"
  >("idle");
  const [phoneVerificationCode, setPhoneVerificationCode] = useState("");
  const [phoneVerificationLoading, setPhoneVerificationLoading] =
    useState(false);
  const [phoneVerificationError, setPhoneVerificationError] = useState<
    string | null
  >(null);
  const [phoneVerified, setPhoneVerified] = useState(false); // ✅ 只有为 true 时才能下单

  const [confirmation, setConfirmation] = useState<ConfirmationState | null>(
    null,
  );
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [addressValidation, setAddressValidation] = useState<{
    distanceKm: number | null;
    isChecking: boolean;
    error: string | null;
  }>({ distanceKm: null, isChecking: false, error: null });

  const [redeemPointsInput, setRedeemPointsInput] = useState<string>("");
  const [loyaltyInfo, setLoyaltyInfo] = useState<LoyaltyInfo | null>(null);
  const [availableCoupons, setAvailableCoupons] = useState<CheckoutCoupon[]>(
    [],
  );
  const [appliedCoupon, setAppliedCoupon] = useState<CheckoutCoupon | null>(
    null,
  );
  const [couponLoading, setCouponLoading] = useState(false);
  const [couponError, setCouponError] = useState<string | null>(null);

  // ✅ 小计：按“分”计算，先把单价（CAD）×100 再四舍五入
  const subtotalCents = useMemo(
    () =>
      localizedCartItems.reduce(
        (total, cartItem) =>
          total + Math.round(cartItem.item.price * 100) * cartItem.quantity,
        0,
      ),
    [localizedCartItems],
  );

  // ✅ 服务费（目前 0 分）
  const serviceFeeCents: number = 0;

  const isDeliveryFulfillment = fulfillment === "delivery";

  // 用于计费的“公里数”：不足 1km 按 1km，向上取整
  const billedDistanceForPriorityKm =
    isDeliveryFulfillment &&
    deliveryType === "PRIORITY" &&
    addressValidation.distanceKm !== null
      ? Math.max(1, Math.ceil(addressValidation.distanceKm))
      : isDeliveryFulfillment && deliveryType === "PRIORITY"
        ? 1 // 还没算出距离时，优先配送按 1km 起步展示
        : 0;

  // UI 展示用的配送选项（standard 固定 $6；priority = $6 + $1/km）——都转换成“分”
  const deliveryOptions: DeliveryOptionDisplay[] = DELIVERY_TYPES.map(
    (type) => {
      const definition = DELIVERY_OPTION_DEFINITIONS[type];
      const localized = definition.labels[locale];

      let feeCents = 0;
      if (isDeliveryFulfillment && subtotalCents > 0) {
        if (type === "STANDARD") {
          feeCents = 600;
        } else {
          // PRIORITY：$6 + $1/km
          feeCents = 600 + 100 * billedDistanceForPriorityKm;
        }
      }

      return {
        type,
        fee: feeCents,
        eta: definition.eta,
        provider: definition.provider,
        title: localized.title,
        description: localized.description,
      };
    },
  );

  const resetAddressValidation = () =>
    setAddressValidation({ distanceKm: null, isChecking: false, error: null });

  const currencyFormatter = useMemo(
    () =>
      new Intl.NumberFormat(locale === "zh" ? "zh-Hans-CA" : "en-CA", {
        style: "currency",
        currency: HOSTED_CHECKOUT_CURRENCY,
        minimumFractionDigits: 2,
        maximumFractionDigits: 2,
      }),
    [locale],
  );

  // 统一从“分”格式化成 $xx.xx
  const formatMoney = (cents: number) =>
    currencyFormatter.format(cents / 100).replace(/^CA\$\s?/, "$");

  const formatDistanceValue = (km: number) => {
    const rounded = Math.round(km * 10) / 10;
    if (!Number.isFinite(rounded)) return `${km} km`;
    return `${
      Number.isInteger(rounded) ? rounded.toFixed(0) : rounded.toFixed(1)
    } km`;
  };

  const applyDistanceTemplate = (template: string, distanceLabel?: string) =>
    template.replace("{distance}", distanceLabel ?? "").replace(
      "{radius}",
      radiusLabel,
    );

  const selectedDeliveryDefinition = DELIVERY_OPTION_DEFINITIONS[deliveryType];

  // 这里和上面的 deliveryOptions 保持同一套规则（单位：分）
  const deliveryFeeCents =
    !isDeliveryFulfillment || subtotalCents <= 0
      ? 0
      : deliveryType === "STANDARD"
        ? 600
        : 600 + 100 * billedDistanceForPriorityKm;

  // === 积分抵扣相关计算 ===

  // 每“点”可以抵扣多少分（1 CAD = 100 分）
  const loyaltyCentsPerPoint = useMemo(() => {
    if (!loyaltyInfo) return 0;
    if (loyaltyInfo.points <= 0) return 0;
    return 100; // 1 pt = $1.00
  }, [loyaltyInfo]);

  const couponDiscountCents = useMemo(() => {
    if (!appliedCoupon) return 0;
    if (
      typeof appliedCoupon.minSpendCents === "number" &&
      subtotalCents < appliedCoupon.minSpendCents
    ) {
      return 0;
    }
    return Math.min(appliedCoupon.discountCents, subtotalCents);
  }, [appliedCoupon, subtotalCents]);

  // 本单最多可抵扣多少金额（分）
  const maxRedeemableCentsForOrder = useMemo(() => {
    if (!loyaltyInfo) return 0;
    if (subtotalCents <= 0) return 0;

    const subtotalAfterCoupon = Math.max(0, subtotalCents - couponDiscountCents);
    return Math.min(loyaltyInfo.availableDiscountCents, subtotalAfterCoupon);
  }, [loyaltyInfo, subtotalCents, couponDiscountCents]);

  // 本单最多可使用多少积分（允许小数）
  const maxRedeemablePointsForOrder = useMemo(() => {
    if (!loyaltyInfo) return 0;
    if (loyaltyCentsPerPoint <= 0) return 0;

    const raw = maxRedeemableCentsForOrder / loyaltyCentsPerPoint;
    return Math.round(raw * 100) / 100;
  }, [loyaltyInfo, loyaltyCentsPerPoint, maxRedeemableCentsForOrder]);

  // 用户输入“本单使用多少积分” → 折算成抵扣金额（分）
  const loyaltyRedeemCents = useMemo(() => {
    if (!loyaltyInfo) return 0;
    if (!redeemPointsInput) return 0;
    if (loyaltyCentsPerPoint <= 0) return 0;

    const normalized = redeemPointsInput.replace(/[^\d.]/g, "");
    const requestedPoints = Number(normalized);
    if (!Number.isFinite(requestedPoints) || requestedPoints <= 0) {
      return 0;
    }

    const clampedPoints = Math.min(
      requestedPoints,
      maxRedeemablePointsForOrder,
    );

    const centsFloat = clampedPoints * loyaltyCentsPerPoint;
    const cents = Math.round(centsFloat + 1e-6);

    return Math.min(cents, maxRedeemableCentsForOrder);
  }, [
    loyaltyInfo,
    redeemPointsInput,
    loyaltyCentsPerPoint,
    maxRedeemablePointsForOrder,
    maxRedeemableCentsForOrder,
  ]);

  // 抵扣后的商品小计：用于税和合计的计算
  const effectiveSubtotalCents = useMemo(
    () =>
      Math.max(0, subtotalCents - couponDiscountCents - loyaltyRedeemCents),
    [subtotalCents, couponDiscountCents, loyaltyRedeemCents],
  );

  // 税基 = 抵扣后小计 +（如配置了的话）配送费
  const taxableBaseCents =
    effectiveSubtotalCents + (TAX_ON_DELIVERY ? deliveryFeeCents : 0);

  const taxCents = Math.round(taxableBaseCents * TAX_RATE);

  // ✅ 最终总价：抵扣后小计 + 配送费 + 税
  const totalCents = effectiveSubtotalCents + deliveryFeeCents + taxCents;

  const deliveryAddressText = useMemo(
    () => formatDeliveryAddress(customer),
    [customer],
  );

  const addressWithinRadius =
    addressValidation.distanceKm !== null &&
    addressValidation.distanceKm <= DELIVERY_RADIUS_KM &&
    !addressValidation.error;

  const postalCodeIsValid = isPostalCodeValid(customer.postalCode);
  const hasDeliveryAddressInputs =
    customer.addressLine1.trim().length > 0 && postalCodeIsValid;
  const showPostalCodeError =
    customer.postalCode.trim().length > 0 && !postalCodeIsValid;
  const deliveryAddressReady =
    isDeliveryFulfillment &&
    customer.addressLine1.trim().length > 0 &&
    customer.city.trim().length > 0 &&
    customer.province.trim().length > 0 &&
    postalCodeIsValid;

  // ⭐ 下单前置条件：有菜 + 姓名 + 手机号长度 + 手机已验证 + （外送时地址完整）
  const canPlaceOrder =
    localizedCartItems.length > 0 &&
    customer.name.trim().length > 0 &&
    customer.phone.trim().length >= 6 &&
    phoneVerified &&
    (fulfillment === "pickup" || deliveryAddressReady);

  const scheduleLabel =
    strings.scheduleOptions.find((option) => option.id === schedule)?.label ??
    "";

  const handleCustomerChange = (field: keyof CustomerInfo, value: string) => {
    setCustomer((prev) => ({ ...prev, [field]: value }));

    // 🔐 手机号变更时，重置验证状态
    if (field === "phone") {
      setPhoneVerificationError(null);
      setPhoneVerificationCode("");

      const trimmed = value.trim();
      if (!trimmed) {
        // 清空手机号 → 一定是未验证
        setPhoneVerified(false);
        setPhoneVerificationStep("idle");
        return;
      }

      if (memberPhone) {
        // 会员：如果改回与数据库一致的手机号 → 保持已验证；否则要求重新验证
        const normalizedMember = memberPhone.replace(/\s+/g, "");
        const normalizedNew = trimmed.replace(/\s+/g, "");
        if (normalizedNew === normalizedMember) {
          setPhoneVerified(true);
          setPhoneVerificationStep("verified");
        } else {
          setPhoneVerified(false);
          setPhoneVerificationStep("idle");
        }
      } else {
        // 非会员：任何修改都需要重新验证
        setPhoneVerified(false);
        setPhoneVerificationStep("idle");
      }
    }
  };

  // 发送短信验证码
  const handleSendPhoneCode = async () => {
    const rawPhone = customer.phone.trim();
    if (rawPhone.length < 6) {
      setPhoneVerificationError(
        locale === "zh"
          ? "请输入有效手机号后再获取验证码。"
          : "Please enter a valid phone number before requesting a code.",
      );
      return;
    }

    setPhoneVerificationLoading(true);
    setPhoneVerificationError(null);

    try {
      const res = await fetch(PHONE_OTP_REQUEST_URL, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          phone: rawPhone,
          purpose: "checkout", // 后端可按用途区分（可选）
        }),
      });

      if (!res.ok) {
        throw new Error(`Request failed with status ${res.status}`);
      }

      setPhoneVerificationStep("codeSent");
    } catch (err) {
      console.error(err);
      setPhoneVerificationError(
        locale === "zh"
          ? "验证码发送失败，请稍后重试。"
          : "Failed to send verification code. Please try again.",
      );
    } finally {
      setPhoneVerificationLoading(false);
    }
  };

  // 校验短信验证码
  const handleVerifyPhoneCode = async () => {
    const rawPhone = customer.phone.trim();
    if (!phoneVerificationCode.trim()) {
      setPhoneVerificationError(
        locale === "zh"
          ? "请输入短信验证码。"
          : "Please enter the verification code.",
      );
      return;
    }

    setPhoneVerificationLoading(true);
    setPhoneVerificationError(null);

    try {
      const res = await fetch(PHONE_OTP_VERIFY_URL, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          phone: rawPhone,
          code: phoneVerificationCode.trim(),
          purpose: "checkout",
        }),
      });

      if (!res.ok) {
        throw new Error(`Verify failed with status ${res.status}`);
      }

      // ✅ 验证成功：允许下单
      setPhoneVerified(true);
      setPhoneVerificationStep("verified");
    } catch (err) {
      console.error(err);
      setPhoneVerificationError(
        locale === "zh"
          ? "验证码验证失败，请检查后重试。"
          : "Verification failed. Please check the code and try again.",
      );
      setPhoneVerified(false);
    } finally {
      setPhoneVerificationLoading(false);
    }
  };

  const isCouponApplicable = (coupon: CheckoutCoupon) =>
    subtotalCents >= (coupon.minSpendCents ?? 0);

  const handleApplyCoupon = (coupon: CheckoutCoupon) => {
    if (!isCouponApplicable(coupon)) return;

    setAppliedCoupon(coupon);
    setAvailableCoupons((prev) => prev.filter((item) => item.id !== coupon.id));
    setCouponError(null);
  };

  const handleRemoveCoupon = () => {
    if (!appliedCoupon) return;
    setAvailableCoupons((prev) => [appliedCoupon, ...prev]);
    setAppliedCoupon(null);
  };

  useEffect(() => {
    if (!isDeliveryFulfillment) {
      resetAddressValidation();
    }
  }, [isDeliveryFulfillment]);

  useEffect(() => {
    if (!isDeliveryFulfillment) return;
    resetAddressValidation();
  }, [
    customer.addressLine1,
    customer.addressLine2,
    customer.city,
    customer.province,
    customer.postalCode,
    isDeliveryFulfillment,
  ]);

  // 加载会员积分 + 会员手机号
  useEffect(() => {
    if (authStatus !== "authenticated") {
      setLoyaltyInfo(null);
      setAvailableCoupons([]);
      setMemberPhone(null);
      return;
    }

    const s = session as SessionWithUserId | null;
    const userId = s?.userId ?? s?.user?.id ?? undefined;

    if (!userId) {
      setLoyaltyInfo(null);
      setAvailableCoupons([]);
      setMemberPhone(null);
      return;
    }

    const controller = new AbortController();

    async function loadLoyalty() {
      try {
        setLoyaltyLoading(true);
        setLoyaltyError(null);

        const user = s?.user ?? null;
        const params = new URLSearchParams();

        params.set("userId", userId ?? "");
        params.set("name", user?.name ?? "");
        params.set("email", user?.email ?? "");

        // 如果 URL 上带了已验证的手机号，就顺手传给 membership 接口做绑定
        if (verifiedPhone && phoneVerifiedFlag === "1") {
          params.set("phone", verifiedPhone);
          params.set("pv", "1");
        }

        const res = await fetch(
          `/api/v1/membership/summary?${params.toString()}`,
          { signal: controller.signal },
        );

        if (!res.ok) {
          throw new Error(`Failed with status ${res.status}`);
        }

        const raw = (await res.json()) as MembershipSummaryEnvelope;
        const data =
          "details" in raw && raw.details
            ? raw.details
            : (raw as MembershipSummaryResponse);

        setLoyaltyInfo({
          userId: data.userId,
          tier: data.tier,
          points: data.points,
          availableDiscountCents: data.availableDiscountCents,
        });

        setMemberPhone(data.phone ?? null);
      } catch (err) {
        if (err instanceof DOMException && err.name === "AbortError") {
          return;
        }
        console.error(err);
        setLoyaltyError(
          locale === "zh"
            ? "积分信息加载失败，暂时无法使用积分抵扣。"
            : "Failed to load loyalty info. Points cannot be used right now.",
        );
        setLoyaltyInfo(null);
        setMemberPhone(null);
      } finally {
        setLoyaltyLoading(false);
      }
    }

    void loadLoyalty();

    return () => controller.abort();
  }, [authStatus, session, locale, verifiedPhone, phoneVerifiedFlag]);

  // 加载优惠券列表
  useEffect(() => {
    if (authStatus !== "authenticated" || !session?.user) {
      setAvailableCoupons([]);
      return;
    }

    const sessionWithUserId = session as SessionWithUserId;
    const userId = sessionWithUserId?.userId;
    if (typeof userId !== "string" || !userId) {
      setAvailableCoupons([]);
      return;
    }

    const ensuredUserId: string = userId;
    const controller = new AbortController();

    async function loadCoupons() {
      try {
        setCouponLoading(true);
        setCouponError(null);

        const params = new URLSearchParams([["userId", ensuredUserId]]);
        const res = await fetch(
          `/api/v1/membership/coupons?${params.toString()}`,
          { signal: controller.signal },
        );

        if (!res.ok) {
          throw new Error(`Failed with status ${res.status}`);
        }

        const raw = (await res.json()) as CouponsApiEnvelope;

        let list: CheckoutCoupon[] = [];
        if (Array.isArray(raw)) {
          list = raw;
        } else if (
          raw &&
          typeof raw === "object" &&
          Array.isArray(raw.details)
        ) {
          list = raw.details;
        }

        const normalized = list.filter(
          (item) => !item.status || item.status === "active",
        );

        setAvailableCoupons(normalized);
      } catch (err) {
        if (err instanceof DOMException && err.name === "AbortError") {
          return;
        }
        console.error(err);
        setCouponError(
          locale === "zh"
            ? "可用优惠券加载失败，暂时无法使用优惠券。"
            : "Failed to load coupons. Coupons cannot be used right now.",
        );
        setAvailableCoupons([]);
      } finally {
        setCouponLoading(false);
      }
    }

    void loadCoupons();

    return () => controller.abort();
  }, [authStatus, session, locale]);

  // 用会员手机号预填结算电话：只填一次，且用户没自己输入时才填
  useEffect(() => {
    if (phonePrefilled) return;
    if (!memberPhone) return;

    setCustomer((prev) => {
      if (prev.phone && prev.phone.trim().length > 0) {
        return prev; // 用户已经输入了，就不覆盖
      }
      return { ...prev, phone: memberPhone };
    });

    setPhonePrefilled(true);
  }, [memberPhone, phonePrefilled]);

  // ✅ 如果当前手机号与会员账号中的手机号一致，就自动视为“已验证”
  useEffect(() => {
    if (!memberPhone) return;

    const normalizedMember = memberPhone.replace(/\s+/g, "");
    const normalizedCurrent = customer.phone.replace(/\s+/g, "");

    if (normalizedCurrent && normalizedCurrent === normalizedMember) {
      setPhoneVerified(true);
      setPhoneVerificationStep("verified");
      setPhoneVerificationError(null);
    }
  }, [memberPhone, customer.phone]);

  // 带可选 override 类型的距离校验
  const validateDeliveryDistance = async (
    overrideDeliveryType?: DeliveryTypeOption,
  ) => {
    const effectiveType = overrideDeliveryType ?? deliveryType;

    setAddressValidation({ distanceKm: null, isChecking: true, error: null });

    try {
      const coordinates = await geocodeAddress(deliveryAddressText, {
        cityHint: `${customer.city}, ${customer.province}`,
      });

      if (!coordinates) {
        setAddressValidation({
          distanceKm: null,
          isChecking: false,
          error: strings.deliveryDistance.notFound,
        });
        return { success: false } as const;
      }

      const distanceKm = calculateDistanceKm(STORE_COORDINATES, coordinates);

      // 标准配送：限制在 DELIVERY_RADIUS_KM 以内
      if (effectiveType === "STANDARD" && distanceKm > DELIVERY_RADIUS_KM) {
        const distanceLabel = formatDistanceValue(distanceKm);
        const message = applyDistanceTemplate(
          strings.deliveryDistance.outsideRange,
          distanceLabel,
        );
        setAddressValidation({
          distanceKm,
          isChecking: false,
          error: message,
        });
        return { success: false } as const;
      }

      // 优先闪送：最大 PRIORITY_MAX_RADIUS_KM
      if (effectiveType === "PRIORITY" && distanceKm > PRIORITY_MAX_RADIUS_KM) {
        const distanceLabel = formatDistanceValue(distanceKm);
        const message =
          locale === "zh"
            ? `当前地址距离门店约 ${distanceLabel}，超出优先闪送最大范围（${PRIORITY_MAX_RADIUS_KM} km）。`
            : `This address is about ${distanceLabel} away from the store, which exceeds the maximum ${PRIORITY_MAX_RADIUS_KM} km range for priority delivery.`;

        setAddressValidation({
          distanceKm,
          isChecking: false,
          error: message,
        });
        return { success: false } as const;
      }

      // 在可配送范围内：记录距离用于计费
      setAddressValidation({
        distanceKm,
        isChecking: false,
        error: null,
      });
      return { success: true, distanceKm } as const;
    } catch {
      setAddressValidation({
        distanceKm: null,
        isChecking: false,
        error: strings.deliveryDistance.failed,
      });
      return { success: false } as const;
    }
  };

  // ⭐ 统一触发：只在外送 + 有地址1 + 合法邮编 时才会真正调用 validateDeliveryDistance
  const triggerDistanceValidationIfReady = () => {
    if (!isDeliveryFulfillment) return;
    if (!hasDeliveryAddressInputs) return;
    if (addressValidation.isChecking) return;

    void validateDeliveryDistance();
  };

  const handlePlaceOrder = async () => {
    if (!canPlaceOrder || isSubmitting) return;

    setErrorMessage(null);
    setConfirmation(null);
    setIsSubmitting(true);

    let deliveryDistanceKm: number | null = null;

    // 先做距离校验
    if (isDeliveryFulfillment) {
      const validationResult = await validateDeliveryDistance();
      if (!validationResult.success) {
        setIsSubmitting(false);
        return;
      }
      deliveryDistanceKm = validationResult.distanceKm ?? null;
    } else {
      resetAddressValidation();
    }

    const orderNumber = `SQ${Date.now().toString().slice(-6)}`;

    // ==== 重新算一遍本单的费用（全部用“分”） ====
    let deliveryFeeCentsForOrder = 0;
    if (isDeliveryFulfillment && subtotalCents > 0) {
      if (deliveryType === "STANDARD") {
        deliveryFeeCentsForOrder = 600;
      } else {
        const billedKm =
          deliveryDistanceKm !== null
            ? Math.max(1, Math.ceil(deliveryDistanceKm))
            : 1;
        deliveryFeeCentsForOrder = 600 + 100 * billedKm;
      }
    }

    const loyaltyRedeemCentsForOrder = loyaltyRedeemCents;
    const couponDiscountCentsForOrder = couponDiscountCents;

    const discountedSubtotalForOrder = Math.max(
      0,
      subtotalCents - couponDiscountCentsForOrder - loyaltyRedeemCentsForOrder,
    );

    const taxableBaseCentsForOrder =
      discountedSubtotalForOrder +
      (TAX_ON_DELIVERY ? deliveryFeeCentsForOrder : 0);
    const taxCentsForOrder = Math.round(
      taxableBaseCentsForOrder * TAX_RATE,
    );

    const totalCentsForOrder =
      discountedSubtotalForOrder + deliveryFeeCentsForOrder + taxCentsForOrder;

    const deliveryMetadata = isDeliveryFulfillment
      ? {
          deliveryType,
          deliveryProvider: selectedDeliveryDefinition.provider,
          deliveryEtaMinutes: selectedDeliveryDefinition.eta,
          deliveryDistanceKm:
            deliveryDistanceKm !== null
              ? Math.round(deliveryDistanceKm * 100) / 100
              : undefined,
        }
      : null;

    const payload = {
      locale,
      amountCents: totalCentsForOrder,
      currency: HOSTED_CHECKOUT_CURRENCY,
      referenceId: orderNumber,
      description: `San Qin online order ${orderNumber}`,
      returnUrl:
        typeof window !== "undefined"
          ? `${window.location.origin}/${locale}/thank-you/${orderNumber}`
          : undefined,
      metadata: {
        locale,
        fulfillment,
        schedule,
        customer: { ...customer, address: deliveryAddressText },

        // 小计相关
        subtotalCents,
        subtotalAfterDiscountCents: discountedSubtotalForOrder,
        taxCents: taxCentsForOrder,
        serviceFeeCents,
        deliveryFeeCents: deliveryFeeCentsForOrder,
        taxRate: TAX_RATE,

        // 积分相关
        loyaltyRedeemCents: loyaltyRedeemCentsForOrder,
        loyaltyAvailableDiscountCents:
          loyaltyInfo?.availableDiscountCents ?? 0,
        loyaltyPointsBalance: loyaltyInfo?.points ?? 0,
        loyaltyUserId: loyaltyInfo?.userId,

        coupon: appliedCoupon
          ? {
              id: appliedCoupon.id,
              code: appliedCoupon.code,
              title: appliedCoupon.title,
              discountCents: couponDiscountCentsForOrder,
              minSpendCents: appliedCoupon.minSpendCents,
            }
          : undefined,

        ...(deliveryMetadata ?? {}),

        items: localizedCartItems.map((cartItem) => ({
          id: cartItem.itemId,
          nameEn: resolveEnglishName(cartItem.itemId, cartItem.item.name),
          nameZh: cartItem.item.name,
          displayName: cartItem.item.name,
          quantity: cartItem.quantity,
          notes: cartItem.notes,
          priceCents: Math.round(cartItem.item.price * 100),
        })),
      },
    };

    try {
      // 1️⃣ 纯积分订单：抵扣后总价为 0 -> 不走 Clover
      if (totalCentsForOrder <= 0) {
        await apiFetch("/orders/loyalty-only", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(payload),
        });

        router.push(`/${locale}/thank-you/${orderNumber}`);
        return;
      }

      // 2️⃣ 总价 > 0：正常走 Clover Hosted Checkout
      const { checkoutUrl } = await apiFetch<HostedCheckoutResponse>(
        "/clover/pay/online/hosted-checkout",
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(payload),
        },
      );

      if (!checkoutUrl) {
        throw new Error(strings.errors.missingCheckoutUrl);
      }

      if (typeof window !== "undefined") {
        window.location.href = checkoutUrl;
      } else {
        setConfirmation({
          orderNumber,
          totalCents: totalCentsForOrder,
          fulfillment,
        });
      }
    } catch (error) {
      const message =
        error instanceof Error
          ? error.message
          : strings.errors.checkoutFailed;
      setErrorMessage(message);
    } finally {
      setIsSubmitting(false);
    }
  };

  const payButtonLabel =
    isSubmitting
      ? strings.processing
      : formatWithTotal(strings.payCta, formatMoney(totalCents));

  let addressDistanceMessage: DistanceMessage | null = null;
  if (isDeliveryFulfillment) {
    if (!hasDeliveryAddressInputs) {
      if (deliveryType === "STANDARD") {
        addressDistanceMessage = {
          text: applyDistanceTemplate(strings.deliveryDistance.restriction),
          tone: "muted",
        };
      } else {
        addressDistanceMessage = null;
      }
    } else if (addressValidation.isChecking) {
      addressDistanceMessage = {
        text: strings.deliveryDistance.checking,
        tone: "info",
      };
    } else if (addressValidation.error) {
      addressDistanceMessage = {
        text: addressValidation.error,
        tone: "error",
      };
    } else if (addressValidation.distanceKm !== null) {
      const distanceLabel = formatDistanceValue(addressValidation.distanceKm);

      if (deliveryType === "STANDARD") {
        const template = addressWithinRadius
          ? strings.deliveryDistance.withinRange
          : strings.deliveryDistance.outsideRange;

        const tone: DistanceMessage["tone"] = addressWithinRadius
          ? "success"
          : "error";

        addressDistanceMessage = {
          text: applyDistanceTemplate(template, distanceLabel),
          tone,
        };
      } else if (deliveryType === "PRIORITY") {
        const text =
          locale === "zh"
            ? `当前地址距离门店约 ${distanceLabel}，优先闪送配送费会按该距离自动计算。`
            : `This address is about ${distanceLabel} away from the store. Priority delivery fee will be calculated based on this distance.`;

        addressDistanceMessage = {
          text,
          tone: "info",
        };
      }
    }
  }

  return (
    <div className="space-y-10 pb-24">
      <section className="rounded-3xl bg-white p-6 shadow-sm">
        <div className="flex flex-col gap-6 md:flex-row md:items-center md:justify-between">
          <div>
            <h1 className="text-2xl font-semibold text-slate-900">
              {strings.cartTitle}
            </h1>
            <p className="mt-2 max-w-xl text-sm text-slate-600">
              {strings.paymentHint}
            </p>
          </div>
          <div className="flex flex-col items-start gap-3 md:items-end">
            <div className="flex items-center gap-2 text-xs text-slate-500">
              <span className="font-medium">{strings.languageSwitch}</span>
              <div className="inline-flex gap-1 rounded-full bg-slate-200 p-1">
                {LOCALES.map((code) => (
                  <button
                    key={code}
                    type="button"
                    onClick={() => {
                      try {
                        document.cookie = `locale=${code}; path=/; max-age=${
                          60 * 60 * 24 * 365
                        }`;
                        localStorage.setItem("preferred-locale", code);
                      } catch {}
                      const nextPath = addLocaleToPath(code, pathname || "/");
                      router.push(q ? `${nextPath}?${q}` : nextPath);
                    }}
                    className={`rounded-full px-3 py-1 text-xs font-medium transition ${
                      locale === code
                        ? "bg-white text-slate-900 shadow"
                        : "text-slate-600 hover:bg-white/70"
                    }`}
                    aria-pressed={locale === code}
                  >
                    {LANGUAGE_NAMES[code]}
                  </button>
                ))}
              </div>
            </div>

            {/* 会员入口 + 返回菜单 */}
            <div className="flex flex-wrap gap-2">
              <Link
                href={membershipHref}
                className="inline-flex items-center gap-2 rounded-full bg-slate-900 px-4 py-2 text-xs font-semibold text-white transition hover:bg-slate-700"
              >
                {membershipLabel}
              </Link>
              <Link
                href={orderHref}
                className="inline-flex items-center gap-2 rounded-full border border-slate-200 px-4 py-2 text-xs font-semibold text-slate-600 transition hover:border-slate-300 hover:bg-slate-50"
              >
                {locale === "zh" ? "返回菜单" : "Back to menu"}
              </Link>
            </div>
          </div>
        </div>
      </section>

      <section className="rounded-3xl border border-slate-200 bg-white p-6 shadow-lg">
        {localizedCartItems.length === 0 ? (
          <div className="space-y-4 text-center text-sm text-slate-500">
            <p>{strings.cartEmpty}</p>
            <div>
              <Link
                href={orderHref}
                className="inline-flex items-center gap-2 rounded-full bg-slate-900 px-4 py-2 text-sm font-semibold text-white transition hover:bg-slate-700"
              >
                {locale === "zh" ? "去点餐" : "Browse dishes"}
              </Link>
            </div>
          </div>
        ) : (
          <div className="space-y-6">
            <ul className="space-y-4">
              {localizedCartItems.map((cartItem) => (
                <li
                  key={cartItem.itemId}
                  className="rounded-2xl border border-slate-200 p-4"
                >
                  <div className="flex items-start justify-between gap-4">
                    <div>
                      <p className="text-sm font-semibold text-slate-900">
                        {cartItem.item.name}
                      </p>
                      <p className="mt-1 text-xs text-slate-500">
                        {currencyFormatter.format(cartItem.item.price)} ×{" "}
                        {cartItem.quantity}
                      </p>
                    </div>
                    <div className="flex items-center gap-2">
                      <button
                        type="button"
                        onClick={() => updateQuantity(cartItem.itemId, -1)}
                        className="grid h-8 w-8 place-items-center rounded-full border border-slate-200 text-lg font-semibold text-slate-600 transition hover:bg-slate-100"
                        aria-label={strings.quantity.decrease}
                      >
                        −
                      </button>
                      <span className="min-w-[1.5rem] text-center text-sm font-medium">
                        {cartItem.quantity}
                      </span>
                      <button
                        type="button"
                        onClick={() => updateQuantity(cartItem.itemId, 1)}
                        className="grid h-8 w-8 place-items-center rounded-full border border-slate-200 text-lg font-semibold text-slate-600 transition hover:bg-slate-100"
                        aria-label={strings.quantity.increase}
                      >
                        +
                      </button>
                    </div>
                  </div>
                  <label className="mt-3 block text-xs font-medium text-slate-500">
                    {strings.cartNotesLabel}
                    <textarea
                      value={cartItem.notes}
                      onChange={(event) =>
                        updateNotes(cartItem.itemId, event.target.value)
                      }
                      placeholder={strings.cartNotesPlaceholder}
                      className="mt-1 w-full rounded-2xl border border-slate-200 bg-slate-50 p-2 text-sm text-slate-700 focus:border-slate-400 focus:outline-none"
                      rows={2}
                    />
                  </label>
                </li>
              ))}
            </ul>

            <div className="space-y-4">
              <div>
                <h3 className="text-xs font-semibold uppercase tracking-[0.3em] text-slate-500">
                  {strings.fulfillmentLabel}
                </h3>
                <div className="mt-3 grid grid-cols-2 gap-3 text-sm font-medium">
                  <button
                    type="button"
                    onClick={() => setFulfillment("pickup")}
                    className={`rounded-2xl border px-3 py-2 ${
                      fulfillment === "pickup"
                        ? "border-slate-900 bg-slate-900 text-white"
                        : "border-slate-200 bg-slate-50 text-slate-600"
                    }`}
                  >
                    {strings.fulfillment.pickup}
                  </button>
                  <button
                    type="button"
                    onClick={() => setFulfillment("delivery")}
                    className={`rounded-2xl border px-3 py-2 ${
                      fulfillment === "delivery"
                        ? "border-slate-900 bg-slate-900 text-white"
                        : "border-slate-200 bg-slate-50 text-slate-600"
                    }`}
                  >
                    {strings.fulfillment.delivery}
                  </button>
                </div>
              </div>

              {isDeliveryFulfillment ? (
                <>
                  <div className="space-y-3">
                    <h3 className="text-xs font-semibold uppercase tracking-[0.3em] text-slate-500">
                      {strings.deliveryOptionsLabel}
                    </h3>
                    <div className="grid gap-3 md:grid-cols-2">
                      {deliveryOptions.map((option) => (
                        <button
                          key={option.type}
                          type="button"
                          onClick={() => {
                            setDeliveryType(option.type);

                            if (
                              isDeliveryFulfillment &&
                              hasDeliveryAddressInputs &&
                              !addressValidation.isChecking
                            ) {
                              void validateDeliveryDistance(option.type);
                            }
                          }}
                          className={`text-left rounded-2xl border p-4 transition ${
                            deliveryType === option.type
                              ? "border-emerald-500 bg-emerald-50 shadow-sm"
                              : "border-slate-200 bg-white hover:border-slate-300"
                          }`}
                          aria-pressed={deliveryType === option.type}
                        >
                          <p className="text-sm font-semibold text-slate-900">
                            {option.title}
                          </p>
                          <p className="mt-1 text-xs text-slate-600">
                            {option.description}
                          </p>
                          <div className="mt-3 flex items-baseline justify-between text-sm">
                            <span className="font-semibold text-slate-900">
                              {formatMoney(option.fee)}
                            </span>
                            <span className="text-xs uppercase tracking-wide text-slate-500">
                              {locale === "zh"
                                ? option.type === "STANDARD"
                                  ? "固定配送费"
                                  : "起步价$6 + 每公里$1距离计费"
                                : option.type === "STANDARD"
                                  ? "Flat fee"
                                  : "Base fee $6 + $1 per km"}
                            </span>
                          </div>
                        </button>
                      ))}
                    </div>
                  </div>

                  <div className="space-y-3">
                    <label className="block text-xs font-semibold uppercase tracking-[0.3em] text-slate-500">
                      {strings.scheduleLabel}
                      <select
                        value={schedule}
                        onChange={(event) =>
                          setSchedule(event.target.value as ScheduleSlot)
                        }
                        className="mt-2 w-full rounded-2xl border border-slate-200 bg-white p-2 text-sm text-slate-700 focus:border-slate-400 focus:outline-none"
                      >
                        {strings.scheduleOptions.map((option) => (
                          <option key={option.id} value={option.id}>
                            {option.label}
                          </option>
                        ))}
                      </select>
                    </label>
                  </div>
                </>
              ) : (
                <p className="rounded-2xl bg-slate-100 p-3 text-xs text-slate-600">
                  {strings.fulfillment.pickupNote}
                </p>
              )}

              {/* 联系方式 + 手机号验证 */}
              <div className="space-y-3">
                <h3 className="text-xs font-semibold uppercase tracking-[0.3em] text-slate-500">
                  {strings.contactInfoLabel}
                </h3>
                <label className="block text-xs font-medium text-slate-600">
                  {strings.contactFields.name}
                  <input
                    value={customer.name}
                    onChange={(event) =>
                      handleCustomerChange("name", event.target.value)
                    }
                    placeholder={strings.contactFields.namePlaceholder}
                    className="mt-1 w-full rounded-2xl border border-slate-200 bg-white p-2 text-sm text-slate-700 focus:border-slate-400 focus:outline-none"
                  />
                </label>

                <label className="block text-xs font-medium text-slate-600">
                  {strings.contactFields.phone}
                  <div className="mt-1 flex flex-col gap-2 sm:flex-row sm:items-center">
                    <input
                      value={customer.phone}
                      onChange={(event) =>
                        handleCustomerChange("phone", event.target.value)
                      }
                      placeholder={strings.contactFields.phonePlaceholder}
                      className="w-full rounded-2xl border border-slate-200 bg-white p-2 text-sm text-slate-700 focus:border-slate-400 focus:outline-none"
                    />
                    <div className="flex items-center gap-2">
                      {phoneVerified ? (
                        <span className="inline-flex items-center rounded-full bg-emerald-50 px-3 py-1 text-[11px] font-medium text-emerald-700">
                          {locale === "zh" ? "手机号已验证" : "Phone verified"}
                        </span>
                      ) : (
                        <button
                          type="button"
                          onClick={handleSendPhoneCode}
                          disabled={
                            phoneVerificationLoading ||
                            customer.phone.trim().length < 6
                          }
                          className="shrink-0 rounded-full border border-slate-300 px-3 py-1 text-[11px] font-medium text-slate-600 hover:bg-slate-100 disabled:cursor-not-allowed disabled:opacity-60"
                        >
                          {phoneVerificationLoading
                            ? locale === "zh"
                              ? "发送中…"
                              : "Sending…"
                            : locale === "zh"
                              ? "获取验证码"
                              : "Send code"}
                        </button>
                      )}
                    </div>
                  </div>

                  {!phoneVerified && phoneVerificationStep === "codeSent" && (
                    <div className="mt-2 flex flex-col gap-2 sm:flex-row sm:items-center">
                      <input
                        value={phoneVerificationCode}
                        onChange={(e) =>
                          setPhoneVerificationCode(e.target.value)
                        }
                        placeholder={
                          locale === "zh" ? "请输入短信验证码" : "Enter SMS code"
                        }
                        className="w-full rounded-2xl border border-slate-200 bg-white p-2 text-sm text-slate-700 focus:border-slate-400 focus:outline-none"
                      />
                      <button
                        type="button"
                        onClick={handleVerifyPhoneCode}
                        disabled={phoneVerificationLoading}
                        className="shrink-0 rounded-full bg-slate-900 px-3 py-1 text-[11px] font-medium text-white hover:bg-slate-800 disabled:cursor-not-allowed disabled:opacity-60"
                      >
                        {phoneVerificationLoading
                          ? locale === "zh"
                            ? "验证中…"
                            : "Verifying…"
                          : locale === "zh"
                            ? "验证手机号"
                            : "Verify phone"}
                      </button>
                    </div>
                  )}

                  {phoneVerificationError && (
                    <p className="mt-1 text-[11px] text-rose-600">
                      {phoneVerificationError}
                    </p>
                  )}

                  {!phoneVerified && !phoneVerificationError && (
                    <p className="mt-1 text-[11px] text-slate-500">
                      {locale === "zh"
                        ? "为保障订单通知及外送沟通，请先验证手机号后再提交订单。"
                        : "Please verify your phone number before placing the order so we can contact you if needed."}
                    </p>
                  )}
                </label>

                {fulfillment === "delivery" ? (
                  <div className="space-y-3 rounded-2xl bg-slate-50 p-3">
                    <label className="block text-xs font-medium text-slate-600">
                      {strings.contactFields.addressLine1}
                      <input
                        value={customer.addressLine1}
                        onChange={(event) =>
                          handleCustomerChange(
                            "addressLine1",
                            event.target.value,
                          )
                        }
                        placeholder={
                          strings.contactFields.addressLine1Placeholder
                        }
                        className="mt-1 w-full rounded-2xl border border-slate-200 bg-white p-2 text-sm text-slate-700 focus:border-slate-400 focus:outline-none"
                      />
                    </label>
                    <label className="block text-xs font-medium text-slate-600">
                      {strings.contactFields.addressLine2}
                      <input
                        value={customer.addressLine2}
                        onChange={(event) =>
                          handleCustomerChange(
                            "addressLine2",
                            event.target.value,
                          )
                        }
                        placeholder={
                          strings.contactFields.addressLine2Placeholder
                        }
                        className="mt-1 w-full rounded-2xl border border-slate-200 bg-white p-2 text-sm text-slate-700 focus:border-slate-400 focus:outline-none"
                      />
                    </label>
                    <div className="grid gap-3 md:grid-cols-2">
                      <label className="block text-xs font-medium text-slate-600">
                        {strings.contactFields.city}
                        <input
                          value={customer.city}
                          onChange={(event) =>
                            handleCustomerChange("city", event.target.value)
                          }
                          placeholder={strings.contactFields.cityPlaceholder}
                          className="mt-1 w-full rounded-2xl border border-slate-200 bg-white p-2 text-sm text-slate-700 focus:border-slate-400 focus:outline-none"
                        />
                      </label>
                      <label className="block text-xs font-medium text-slate-600">
                        {strings.contactFields.province}
                        <input
                          value={customer.province}
                          onChange={(event) =>
                            handleCustomerChange(
                              "province",
                              event.target.value.toUpperCase(),
                            )
                          }
                          placeholder={
                            strings.contactFields.provincePlaceholder
                          }
                          className="mt-1 w-full rounded-2xl border border-slate-200 bg-white p-2 text-sm text-slate-700 focus:border-slate-400 focus:outline-none"
                        />
                      </label>
                    </div>
                    <div className="grid gap-3 md:grid-cols-2">
                      <label className="block text-xs font-medium text-slate-600">
                        {strings.contactFields.postalCode}
                        <input
                          value={customer.postalCode}
                          onChange={(event) =>
                            handleCustomerChange(
                              "postalCode",
                              formatPostalCodeInput(event.target.value),
                            )
                          }
                          onBlur={triggerDistanceValidationIfReady}
                          placeholder={
                            strings.contactFields.postalCodePlaceholder
                          }
                          className={`mt-1 w-full rounded-2xl border bg-white p-2 text-sm text-slate-700 focus:outline-none ${
                            showPostalCodeError
                              ? "border-red-400 focus:border-red-500"
                              : "border-slate-200 focus:border-slate-400"
                          }`}
                        />
                      </label>
                      <label className="block text-xs font-medium text-slate-600">
                        {strings.contactFields.country}
                        <input
                          value={DELIVERY_COUNTRY}
                          disabled
                          className="mt-1 w-full rounded-2xl border border-slate-200 bg-slate-100 p-2 text-sm text-slate-500"
                        />
                      </label>
                    </div>
                    <p
                      className={`text-xs ${
                        showPostalCodeError
                          ? "text-red-600"
                          : "text-slate-500"
                      }`}
                    >
                      {showPostalCodeError
                        ? strings.contactFields.postalCodeError
                        : deliveryType === "STANDARD"
                          ? strings.contactFields.postalCodeHint
                          : ""}{" "}
                      {/* 优先闪送时不显示“只支持 5km 内外送”这句 */}
                    </p>
                    {addressDistanceMessage ? (
                      <p
                        className={`text-xs ${
                          addressDistanceMessage.tone === "success"
                            ? "text-emerald-600"
                            : addressDistanceMessage.tone === "error"
                              ? "text-red-600"
                              : addressDistanceMessage.tone === "info"
                                ? "text-slate-600"
                                : "text-slate-500"
                        }`}
                      >
                        {addressDistanceMessage.text}
                      </p>
                    ) : null}
                  </div>
                ) : null}

                <label className="block text-xs font-medium text-slate-600">
                  {strings.contactFields.notes}
                  <textarea
                    value={customer.notes}
                    onChange={(event) =>
                      handleCustomerChange("notes", event.target.value)
                    }
                    placeholder={strings.contactFields.notesPlaceholder}
                    className="mt-1 w-full rounded-2xl border border-slate-200 bg-white p-2 text-sm text-slate-700 focus:border-slate-400 focus:outline-none"
                    rows={2}
                  />
                </label>
              </div>

              <div className="space-y-2">
                <p className="text-xs text-slate-500">
                  {strings.paymentHint}
                </p>
                {errorMessage ? (
                  <div className="rounded-2xl border border-red-200 bg-red-50 p-3 text-xs text-red-600">
                    {errorMessage}
                  </div>
                ) : null}
              </div>

              {(availableCoupons.length > 0 ||
                appliedCoupon ||
                couponLoading ||
                couponError) && (
                <div className="rounded-2xl border border-amber-200 bg-amber-50 p-3 text-xs text-slate-800">
                  <div className="flex items-center justify-between gap-2">
                    <div>
                      <p className="font-semibold">
                        {locale === "zh" ? "优惠券" : "Coupons"}
                      </p>
                      <p className="mt-1 text-[11px] text-slate-600">
                        {locale === "zh"
                          ? "请选择本单可用的优惠券。"
                          : "Pick a coupon to apply to this order."}
                      </p>
                    </div>
                    {couponLoading && (
                      <span className="text-[11px] text-slate-500">
                        {locale === "zh" ? "加载中…" : "Loading…"}
                      </span>
                    )}
                  </div>

                  {appliedCoupon ? (
                    <div className="mt-2 rounded-xl border border-amber-200 bg-white px-3 py-2">
                      <div className="flex items-center justify-between gap-2">
                        <div>
                          <p className="text-sm font-semibold text-slate-900">
                            {appliedCoupon.title}
                          </p>
                          <p className="text-[11px] text-slate-500">
                            {appliedCoupon.code}
                          </p>
                        </div>
                        <button
                          type="button"
                          onClick={handleRemoveCoupon}
                          className="shrink-0 rounded-full border border-slate-300 px-3 py-1 text-[11px] font-medium text-slate-600 hover:bg-slate-100"
                        >
                          {locale === "zh" ? "取消使用" : "Remove"}
                        </button>
                      </div>

                      <div className="mt-2 flex items-center justify-between text-[11px] text-slate-600">
                        <span className="font-semibold text-amber-700">
                          {locale === "zh" ? "立减 " : "Save "}
                          {formatMoney(couponDiscountCents)}
                        </span>
                        {appliedCoupon.minSpendCents ? (
                          <span
                            className={
                              subtotalCents >=
                              (appliedCoupon.minSpendCents ?? 0)
                                ? "text-emerald-700"
                                : "text-red-600"
                            }
                          >
                            {locale === "zh"
                              ? `满 ${formatMoney(
                                  appliedCoupon.minSpendCents,
                                )} 可用`
                              : `Min spend ${formatMoney(
                                  appliedCoupon.minSpendCents,
                                )}.`}
                          </span>
                        ) : null}
                      </div>
                    </div>
                  ) : (
                    <div className="mt-2 space-y-2">
                      {availableCoupons.map((coupon) => {
                        const applicable = isCouponApplicable(coupon);
                        return (
                          <div
                            key={coupon.id}
                            className="rounded-xl border border-dashed border-amber-200 bg-white px-3 py-2"
                          >
                            <div className="flex items-center justify-between gap-2">
                              <div>
                                <p className="text-sm font-semibold text-slate-900">
                                  {coupon.title}
                                </p>
                                <p className="text-[11px] text-slate-500">
                                  {coupon.minSpendCents
                                    ? locale === "zh"
                                      ? `满 ${formatMoney(
                                          coupon.minSpendCents,
                                        )} 可用`
                                      : `Min spend ${formatMoney(
                                          coupon.minSpendCents,
                                        )}`
                                    : locale === "zh"
                                      ? "无门槛"
                                      : "No minimum spend"}
                                </p>
                              </div>
                              <button
                                type="button"
                                disabled={!applicable}
                                onClick={() => handleApplyCoupon(coupon)}
                                className={`shrink-0 rounded-full px-3 py-1 text-[11px] font-medium ${
                                  applicable
                                    ? "border border-amber-300 text-amber-700 hover:bg-amber-100"
                                    : "border border-slate-200 text-slate-400"
                                }`}
                              >
                                {applicable
                                  ? locale === "zh"
                                    ? "使用"
                                    : "Apply"
                                  : locale === "zh"
                                    ? "未满足条件"
                                    : "Not eligible"}
                              </button>
                            </div>

                            <div className="mt-1 flex items-center justify-between text-[11px] text-slate-600">
                              <span className="font-semibold text-amber-700">
                                {locale === "zh" ? "立减 " : "Save "}
                                {formatMoney(coupon.discountCents)}
                              </span>
                              {coupon.expiresAt ? (
                                <span className="text-slate-500">
                                  {coupon.expiresAt}
                                </span>
                              ) : null}
                            </div>
                          </div>
                        );
                      })}

                      {availableCoupons.length === 0 && !couponLoading ? (
                        <p className="text-[11px] text-slate-600">
                          {locale === "zh"
                            ? "暂无可用优惠券。"
                            : "No coupons available."}
                        </p>
                      ) : null}
                    </div>
                  )}

                  {couponError && (
                    <p className="mt-2 text-[11px] text-red-600">
                      {couponError}
                    </p>
                  )}
                </div>
              )}

              {loyaltyInfo && (
                <div className="rounded-2xl border border-amber-200 bg-amber-50 p-3 text-xs text-slate-800">
                  <div className="flex items-center justify-between gap-2">
                    <div>
                      <p className="font-semibold">
                        {locale === "zh" ? "积分抵扣" : "Redeem points"}
                      </p>
                      <p className="mt-1 text-[11px] text-slate-600">
                        {locale === "zh"
                          ? `当前积分：${loyaltyInfo.points.toFixed(
                              2,
                            )}，本单最多可抵扣 ${formatMoney(
                              maxRedeemableCentsForOrder,
                            )}。`
                          : `You have ${loyaltyInfo.points.toFixed(
                              2,
                            )} pts. You can redeem up to ${formatMoney(
                              maxRedeemableCentsForOrder,
                            )} this order.`}
                      </p>
                    </div>
                    {loyaltyLoading && (
                      <span className="text-[11px] text-slate-500">
                        {locale === "zh" ? "加载中…" : "Loading…"}
                      </span>
                    )}
                  </div>

                  <div className="mt-2 flex flex-col gap-2 md:flex-row md:items-end">
                    <label className="flex-1">
                      <span className="text-[11px] text-slate-600">
                        {locale === "zh"
                          ? "本单使用积分数量"
                          : "Points to use this order"}
                      </span>
                      <input
                        type="number"
                        min={0}
                        step="0.01"
                        value={redeemPointsInput}
                        onChange={(e) => {
                          const raw = e.target.value;
                          const n = Number(raw);
                          if (Number.isNaN(n) || n < 0) {
                            setRedeemPointsInput("");
                            return;
                          }

                          const clamped = Math.min(
                            n,
                            maxRedeemablePointsForOrder,
                          );
                          setRedeemPointsInput(String(clamped));
                        }}
                        className="mt-1 w-full rounded-2xl border border-slate-300 bg-white p-2 text-sm text-slate-700 focus:border-slate-400 focus:outline-none"
                      />
                    </label>
                    <button
                      type="button"
                      className="shrink-0 rounded-2xl border border-slate-300 px-3 py-1 text-xs font-medium text-slate-600 hover:bg-slate-100"
                      onClick={() =>
                        setRedeemPointsInput(
                          maxRedeemablePointsForOrder.toFixed(2),
                        )
                      }
                    >
                      {locale === "zh" ? "全部使用" : "Use max"}
                    </button>

                    <div className="text-[11px] text-slate-600 md:w-40">
                      <p className="font-medium">
                        {locale === "zh" ? "折算抵扣金额" : "Discount value"}
                      </p>
                      <p className="mt-1 text-sm font-semibold text-emerald-700">
                        {loyaltyRedeemCents > 0
                          ? `- ${formatMoney(loyaltyRedeemCents)}`
                          : formatMoney(0)}
                      </p>
                    </div>
                  </div>

                  {loyaltyError && (
                    <p className="mt-2 text-[11px] text-red-600">
                      {loyaltyError}
                    </p>
                  )}
                </div>
              )}

              {/* 订单金额小结 */}
              <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4 text-sm text-slate-600">
                <div className="flex items-center justify-between text-xs">
                  <span>{strings.summary.subtotal}</span>
                  <span>{formatMoney(subtotalCents)}</span>
                </div>

                {couponDiscountCents > 0 && (
                  <div className="mt-1 flex items-center justify-between text-xs text-amber-700">
                    <span>{locale === "zh" ? "优惠券" : "Coupon"}</span>
                    <span>-{formatMoney(couponDiscountCents)}</span>
                  </div>
                )}

                {loyaltyRedeemCents > 0 && (
                  <div className="mt-1 flex items-center justify-between text-xs">
                    <span>
                      {locale === "zh" ? "积分抵扣" : "Points discount"}
                    </span>
                    <span>-{formatMoney(loyaltyRedeemCents)}</span>
                  </div>
                )}

                {serviceFeeCents > 0 ? (
                  <div className="mt-2 flex items-center justify-between text-xs">
                    <span>{strings.summary.serviceFee}</span>
                    <span>{formatMoney(serviceFeeCents)}</span>
                  </div>
                ) : null}

                {fulfillment === "delivery" ? (
                  <div className="mt-2 flex items-center justify-between text-xs">
                    <span>{strings.summary.deliveryFee}</span>
                    <span>{formatMoney(deliveryFeeCents)}</span>
                  </div>
                ) : null}

                <div className="mt-2 flex items-center justify-between text-xs">
                  <span>{strings.summary.tax}</span>
                  <span>{formatMoney(taxCents)}</span>
                </div>

                <div className="mt-3 border-t border-slate-200 pt-3 text-sm font-semibold text-slate-900">
                  <div className="flex items-center justify-between">
                    <span>{strings.summary.total}</span>
                    <span>{formatMoney(totalCents)}</span>
                  </div>
                </div>
              </div>

              <button
                type="button"
                onClick={handlePlaceOrder}
                disabled={!canPlaceOrder || isSubmitting}
                className="w-full rounded-full bg-emerald-600 px-5 py-3 text-sm font-semibold text-white transition enabled:hover:bg-emerald-500 disabled:cursor-not-allowed disabled:bg-emerald-200"
              >
                {payButtonLabel}
              </button>

              {/* 信用卡手续费提示（仅提示，不参与金额计算） */}
              <p className="mt-2 text-center text-[11px] leading-snug text-slate-500">
                {locale === "zh"
                  ? "使用信用卡支付时，支付网络可能会额外收取不高于订单金额 2.4% 的信用卡手续费（由 Clover / 发卡行收取，我们不从中获利）。具体金额以刷卡小票或银行账单为准。"
                  : "When paying by credit card, the payment networks may apply a surcharge of up to 2.4% of the order total (charged by Clover / your card issuer; we do not profit from this). Please refer to your receipt or card statement for the exact amount."}
              </p>
            </div>

            {confirmation ? (
              <div className="rounded-3xl border border-emerald-200 bg-emerald-50 p-4 text-sm text-emerald-700">
                <p className="font-semibold">{strings.confirmation.title}</p>
                <p className="mt-1">
                  {formatWithOrder(
                    confirmation.fulfillment === "delivery"
                      ? strings.confirmation.delivery
                      : strings.confirmation.pickup,
                    confirmation.orderNumber,
                    formatMoney(confirmation.totalCents),
                    scheduleLabel,
                  )}
                </p>
                <p className="mt-1 text-xs text-emerald-600">
                  {formatWithOrder(
                    confirmation.fulfillment === "delivery"
                      ? strings.confirmation.deliveryMeta
                      : strings.confirmation.pickupMeta,
                    confirmation.orderNumber,
                    formatMoney(confirmation.totalCents),
                    scheduleLabel,
                  )}
                </p>
              </div>
            ) : null}
          </div>
        )}
      </section>
    </div>
  );
}
