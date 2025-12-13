// apps/web/src/lib/order/shared.ts
// 可同时被客户端/服务端安全引入的共享模块（不使用 next/headers、fs 等仅服务端 API）

/** ===== 基础类型 / 常量 ===== */
import type { Locale } from "@/lib/i18n/locales";
export type { Locale } from "@/lib/i18n/locales";
export { LOCALES } from "@/lib/i18n/locales";
export { addLocaleToPath } from "@/lib/i18n/path";

export const LANGUAGE_NAMES: Record<Locale, string> = {
  en: "English",
  zh: "中文",
};

// 结算货币 & 税率（安省 HST 13%）
export const HOSTED_CHECKOUT_CURRENCY = "CAD";
export const TAX_RATE = 0.13;
// 配送费是否计税
export const TAX_ON_DELIVERY = true;

/** ===== UI 文案（双语） ===== */
type OrderStep = { id: number; label: string };
type SummaryStrings = {
  subtotal: string;
  tax: string;
  serviceFee: string;
  deliveryFee: string;
  total: string;
};
type ContactFields = {
  name: string;
  phone: string;
  notes: string;
  addressLine1: string;
  addressLine2: string;
  city: string;
  province: string;
  postalCode: string;
  country: string;
  namePlaceholder: string;
  phonePlaceholder: string;
  addressLine1Placeholder: string;
  addressLine2Placeholder: string;
  cityPlaceholder: string;
  provincePlaceholder: string;
  postalCodePlaceholder: string;
  postalCodeHint: string;
  postalCodeError: string;
  notesPlaceholder: string;
};
type FulfillmentStrings = {
  pickup: string;
  delivery: string;
  pickupNote: string;
};
export type ScheduleSlot = "asap" | "30min" | "60min";
type ScheduleOption = { id: ScheduleSlot; label: string };

type QuantityStrings = {
  increase: string;
  decrease: string;
};

type DeliveryDistanceStrings = {
  restriction: string; // {radius}
  checking: string;
  withinRange: string; // {distance} {radius}
  outsideRange: string; // {distance} {radius}
  notFound: string;
  failed: string;
};

type ThankYouStrings = {
  brand: string;
  switchLabel: string;
  title: string;
  intro: string;
  numberLabel: string;
  note: string;
  contact: string;
  backCta: string;
};

export const UI_STRINGS: Record<
  Locale,
  {
    // 点单页
    tagline: string;
    heroTitle: string;
    heroDescription: string;
    orderSteps: OrderStep[];
    languageSwitch: string;
    cartTitle: string;
    floatingCartLabel: string;
    limitedDaily: string;
    addToCart: string;

    // 结算页
    paymentHint: string;
    fulfillmentLabel: string;
    fulfillment: FulfillmentStrings;
    deliveryOptionsLabel: string;
    deliveryFlatFeeLabel: string;
    scheduleLabel: string;
    scheduleOptions: ScheduleOption[];
    summary: SummaryStrings;
    contactInfoLabel: string;
    contactFields: ContactFields;
    deliveryDistance: DeliveryDistanceStrings;

    // 购物车补充
    cartEmpty: string;
    cartNotesLabel: string;
    cartNotesPlaceholder: string;
    quantity: QuantityStrings;

    // 交互/错误/确认
    processing: string;
    payCta: string; // 包含 {total}
    errors: {
      missingCheckoutUrl: string;
      checkoutFailed: string;
    };
    confirmation: {
      title: string;
      pickup: string; // {order} {total} {schedule}
      delivery: string; // {order} {total} {schedule}
      pickupMeta: string;
      deliveryMeta: string;
    };

    // 支付成功页（thank-you）
    thankYou: ThankYouStrings;
  }
> = {
  en: {
    tagline: "FRESH • FAST • HANDMADE",
    heroTitle: "Order San Qin fast & tasty dishes",
    heroDescription:
      "Classic Liangpi, Roujiamo, hand-pulled noodles and more. Order now and pick up in minutes—or get delivery.",
    orderSteps: [
      { id: 1, label: "Choose your dishes" },
      { id: 2, label: "Add notes & confirm" },
      { id: 3, label: "Pay securely online" },
    ],
    languageSwitch: "Language",
    cartTitle: "Cart",
    floatingCartLabel: "Cart",
    limitedDaily: "Limited daily supply",
    addToCart: "Add to cart",

    paymentHint: "We accept secure online payment. Taxes shown at checkout.",
    fulfillmentLabel: "Fulfillment",
    fulfillment: {
      pickup: "Pickup",
      delivery: "Delivery",
      pickupNote: "Your order will be ready for pickup at the counter.",
    },
    deliveryOptionsLabel: "Delivery speed",
    deliveryFlatFeeLabel: "flat fee",
    scheduleLabel: "Schedule",
    scheduleOptions: [
      { id: "asap", label: "ASAP" },
      { id: "30min", label: "In ~30 minutes" },
      { id: "60min", label: "In ~60 minutes" },
    ],
    summary: {
      subtotal: "Subtotal",
      tax: "Tax (HST)",
      serviceFee: "Service fee",
      deliveryFee: "Delivery fee",
      total: "Total",
    },
    contactInfoLabel: "Contact information",
    contactFields: {
      name: "Name",
      phone: "Phone",
      notes: "Notes",
      addressLine1: "Address line 1",
      addressLine2: "Address line 2",
      city: "City",
      province: "Province",
      postalCode: "Postal code",
      country: "Country",
      namePlaceholder: "Your name",
      phonePlaceholder: "Mobile number",
      addressLine1Placeholder: "Street number + street",
      addressLine2Placeholder: "Apt / Unit / Buzz Code (optional)",
      cityPlaceholder: "Toronto",
      provincePlaceholder: "ON",
      postalCodePlaceholder: "M2N 7J5",
      postalCodeHint: "Format: M2N 7J5",
      postalCodeError: "Enter a valid postal code in the M2N 7J5 format.",
      notesPlaceholder: "E.g., less spicy / no cilantro",
    },
    deliveryDistance: {
      restriction: "Delivery available only within {radius} of the restaurant.",
      checking: "Checking delivery distance...",
      withinRange: "Delivery distance: {distance} (within the {radius} limit).",
      outsideRange:
        "Delivery distance: {distance}, which is outside our {radius} limit.",
      notFound:
        "We couldn’t locate that address. Please include street, city, and postal code.",
      failed: "We couldn’t verify this address right now. Please try again.",
    },

    cartEmpty: "Your cart is empty.",
    cartNotesLabel: "Item notes",
    cartNotesPlaceholder: "Any special instructions?",
    quantity: {
      increase: "Increase quantity",
      decrease: "Decrease quantity",
    },

    processing: "Processing...",
    payCta: "Pay {total}",
    errors: {
      missingCheckoutUrl: "Payment link is missing. Please try again.",
      checkoutFailed: "Checkout failed. Please try again in a moment.",
    },
    confirmation: {
      title: "Order placed",
      pickup:
        "Order {order} placed for pickup. Total {total}. Schedule: {schedule}.",
      delivery:
        "Order {order} placed for delivery. Total {total}. Schedule: {schedule}.",
      pickupMeta:
        "Show your order number {order} at the counter to pick up.",
      deliveryMeta:
        "We’re preparing your order {order}. You’ll receive updates by SMS/phone.",
    },

    thankYou: {
      brand: "San Qin · Xi'an Street Food",
      switchLabel: "中文",
      title: "Payment successful",
      intro: "Thank you for your order! We're preparing your food.",
      numberLabel: "Order number",
      note: "Please keep this order number for pickup or delivery inquiries.",
      contact: "If you have any questions, feel free to reach out to us.",
      backCta: "Back to homepage",
    },
  },
  zh: {
    tagline: "新鲜 · 迅速 · 手工",
    heroTitle: "线上点餐 · 三秦特色",
    heroDescription:
      "经典凉皮、肉夹馍、手擀面等。现在下单，数分钟即可自取，或选择外送。",
    orderSteps: [
      { id: 1, label: "挑选菜品" },
      { id: 2, label: "备注与确认" },
      { id: 3, label: "在线支付" },
    ],
    languageSwitch: "语言",
    cartTitle: "购物车",
    floatingCartLabel: "购物车",
    limitedDaily: "每日限量",
    addToCart: "加入购物车",

    paymentHint: "支持安全在线支付，税费在结算时显示。",
    fulfillmentLabel: "取餐方式",
    fulfillment: {
      pickup: "到店自取",
      delivery: "外送",
      pickupNote: "订单将在柜台备好，请报订单号取餐。",
    },
    deliveryOptionsLabel: "配送方式",
    deliveryFlatFeeLabel: "固定配送费",
    scheduleLabel: "送达/取餐时间",
    scheduleOptions: [
      { id: "asap", label: "尽快" },
      { id: "30min", label: "约 30 分钟后" },
      { id: "60min", label: "约 60 分钟后" },
    ],
    summary: {
      subtotal: "小计",
      tax: "税（HST）",
      serviceFee: "服务费",
      deliveryFee: "配送费",
      total: "合计",
    },
    contactInfoLabel: "联系方式",
    contactFields: {
      name: "姓名",
      phone: "电话",
      notes: "备注",
      addressLine1: "地址行 1",
      addressLine2: "地址行 2",
      city: "城市",
      province: "省份",
      postalCode: "邮编",
      country: "国家",
      namePlaceholder: "请输入姓名",
      phonePlaceholder: "手机号",
      addressLine1Placeholder: "门牌号 + 街道",
      addressLine2Placeholder: "公寓号 / 门禁码（选填）",
      cityPlaceholder: "Toronto",
      provincePlaceholder: "ON",
      postalCodePlaceholder: "M2N 7J5",
      postalCodeHint: "格式：M2N 7J5",
      postalCodeError: "请填写正确的邮编（例如 M2N 7J5）。",
      notesPlaceholder: "例如：少辣 / 不要香菜",
    },
    deliveryDistance: {
      restriction: "目前仅支持距离门店 {radius} 内的外送。",
      checking: "正在计算配送距离...",
      withinRange: "配送距离约 {distance}，在 {radius} 范围内。",
      outsideRange: "配送距离约 {distance}，超出 {radius} 限制。",
      notFound: "未能定位该地址，请补充街道、城市与邮编信息。",
      failed: "暂时无法验证地址，请稍后再试。",
    },

    cartEmpty: "购物车为空",
    cartNotesLabel: "菜品备注",
    cartNotesPlaceholder: "口味/忌口等备注",
    quantity: {
      increase: "增加数量",
      decrease: "减少数量",
    },

    processing: "处理中...",
    payCta: "支付 {total}",
    errors: {
      missingCheckoutUrl: "未获取到支付链接，请稍后重试。",
      checkoutFailed: "支付发起失败，请稍后再试。",
    },
    confirmation: {
      title: "下单成功",
      pickup: "订单 {order} 已下单（自取）。合计 {total}。时间：{schedule}。",
      delivery: "订单 {order} 已下单（外送）。合计 {total}。时间：{schedule}。",
      pickupMeta: "到店取餐请出示订单号 {order}。",
      deliveryMeta: "我们正在为您备餐，订单 {order} 更新将以短信/电话通知。",
    },

    thankYou: {
      brand: "三秦 · 西安小吃",
      switchLabel: "English",
      title: "支付成功",
      intro: "感谢下单！我们已经开始为你制作餐品。",
      numberLabel: "订单编号",
      note: "请保留此订单编号，用于取餐或咨询配送状态。",
      contact: "如有问题，欢迎随时联系我们。",
      backCta: "返回首页",
    },
  },
};

/** ===== 菜单类型（完全由 DB 提供） ===== */

/**
 * 前台展示的单个菜品：
 * - stableId（与 POS / 订单 / Clover 对齐）
 * - name = 当前语言显示名
 * - nameEn/nameZh = Clover / 其它场景可用的固定中英文名
 */
export type LocalizedMenuItem = {
  stableId: string;
  name: string; // localized display name
  nameEn: string;
  nameZh?: string;
  price: number; // 单价（CAD）
  imageUrl?: string;
  // 已按当前语言拼好的配料说明
  ingredients?: string;
  optionGroups?: DbMenuOptionGroup[];
};

export type LocalizedCategory = {
  id: string;
  name: string;
  items: LocalizedMenuItem[];
};

/** ===== DB 菜单类型（对齐 /admin/menu/full 的结构） ===== */

// 这些类型用于前台从 API 读取菜单时的类型标注，不直接依赖 Prisma 包。

export type DbMenuOption = {
  id: string;

  // 属于哪个“模板组”
  templateGroupId: string;

  nameEn: string;
  nameZh: string | null;
  priceDeltaCents: number;

  isAvailable: boolean;
  tempUnavailableUntil: string | null;

  sortOrder: number;
};

// ✅ 对齐后端新架构：菜品绑定（MenuItemOptionGroup）+ 模板组信息
export type DbMenuOptionGroup = {
  id: string; // 绑定 id（MenuItemOptionGroup.id）
  itemId: string;

  templateGroupId: string;

  // 绑定级规则
  minSelect: number;
  maxSelect: number | null;
  sortOrder: number;
  isEnabled: boolean;

  // 模板组信息（为前端显示/编辑提供）
  nameEn: string;
  nameZh: string | null;
  templateIsAvailable: boolean;
  templateTempUnavailableUntil: string | null;

  options: DbMenuOption[];
};

export type DbMenuItem = {
  id: string; // cuid
  categoryId: string;
  stableId: string;
  nameEn: string;
  nameZh: string | null;

  basePriceCents: number;
  isAvailable: boolean;
  isVisible: boolean;
  tempUnavailableUntil: string | null;
  sortOrder: number;

  imageUrl: string | null;
  ingredientsEn: string | null;
  ingredientsZh: string | null;

  optionGroups: DbMenuOptionGroup[];
};

export type DbMenuCategory = {
  id: string;
  sortOrder: number;
  nameEn: string;
  nameZh: string | null;
  isActive: boolean;
  items: DbMenuItem[];
};
/** ===== Public 菜单类型（对齐 /menu/public 的结构） ===== */

export type DbPublicMenuItem = Omit<DbMenuItem, "id">;

export type DbPublicMenuCategory = Omit<DbMenuCategory, "items"> & {
  items: DbPublicMenuItem[];
};

/**
 * 真正用于前台展示的菜单类型（与 LocalizedCategory 相同）
 */
export type PublicMenuCategory = LocalizedCategory;

/** ===== 可售判定（含 tempUnavailableUntil）===== */
/**
 * tempUntil 如果是未来时间 => 视为“暂不可售”
 * 解析失败 => 当作没设置（不拦截），避免因为脏数据导致全下架
 */
function isAvailableNow(isAvailable: boolean, tempUntil: string | null): boolean {
  if (!isAvailable) return false;
  if (!tempUntil) return true;

  const t = Date.parse(tempUntil);
  if (!Number.isFinite(t)) return true;

  return Date.now() >= t;
}

/**
 * ⭐ 从「数据库菜单（/admin/menu/full 或 /menu/public 返回的结构）」构建前台本地化菜单。
 *
 * - 分类名称用 DB 的 nameEn/nameZh；
 * - 菜品名称/价格/图片/配料/中英文，全部用 DB；
 * - 只展示 isActive && isVisible && isAvailable(含临时下架时间) 的菜品；
 * - optionGroups / options 同样按“可售(含临时下架)”过滤并按 sortOrder 排序。
 */
export function buildLocalizedMenuFromDb(
  dbMenu: Array<DbMenuCategory | DbPublicMenuCategory>,
  locale: Locale,
): PublicMenuCategory[] {
  const isZh = locale === "zh";

  const activeCategories = (dbMenu ?? [])
    .filter((c) => c?.isActive)
    .sort((a, b) => a.sortOrder - b.sortOrder);

  return activeCategories.map<PublicMenuCategory>((c) => {
    const localizedName = isZh && c.nameZh ? c.nameZh : c.nameEn;

    const items = (c.items ?? [])
      .filter(
        (i) =>
          i?.isVisible &&
          isAvailableNow(i.isAvailable, i.tempUnavailableUntil),
      )
      .sort((a, b) => a.sortOrder - b.sortOrder)
      .map<LocalizedMenuItem | null>((i) => {
          const stableId =
            typeof (i as any).stableId === "string" && (i as any).stableId
            ? (i as any).stableId
            : null;

          if (!stableId) {
          throw new Error(`[menu] missing stableId for item, dbId=${(i as any).id ?? "unknown"}`);
          }

        const name = isZh && i.nameZh ? i.nameZh : i.nameEn;

        const ingredientsText =
          isZh && i.ingredientsZh
            ? i.ingredientsZh
            : i.ingredientsEn ?? "";

        const optionGroups = (i.optionGroups ?? [])
          .filter(
            (g) =>
              g?.isEnabled &&
              isAvailableNow(
                g.templateIsAvailable,
                g.templateTempUnavailableUntil,
              ),
          )
          .sort((a, b) => a.sortOrder - b.sortOrder)
          .map((g) => ({
            ...g,
            options: (g.options ?? [])
              .filter((o) => isAvailableNow(o.isAvailable, o.tempUnavailableUntil))
              .sort((a, b) => a.sortOrder - b.sortOrder),
          }));

        return {
          stableId,
          name,
          nameEn: i.nameEn,
          nameZh: i.nameZh ?? undefined,
          price: i.basePriceCents / 100,
          imageUrl: i.imageUrl ?? undefined,
          ingredients: ingredientsText || undefined,
          optionGroups,
        };
      })
      .filter((x): x is LocalizedMenuItem => Boolean(x));


    return {
      id: c.id,
      name: localizedName,
      items,
    };
  });
}

/** ===== 结算页相关类型 ===== */
export type CartEntry = {
  stableId: string; // 对应 LocalizedMenuItem.stableId
  quantity: number;
  notes: string;
};

export type LocalizedCartItem = {
  stableId: string;
  quantity: number;
  notes: string;
  item: LocalizedMenuItem;
};

export type DeliveryTypeOption = "STANDARD" | "PRIORITY";
export type DeliveryProviderOption = "DOORDASH" | "UBER";

export type ConfirmationState = {
  orderNumber: string;
  totalCents: number;
  fulfillment: "pickup" | "delivery";
};

export type HostedCheckoutResponse = {
  checkoutUrl: string;
};

/** ===== 工具函数 ===== */
export function formatWithTotal(tpl: string, totalFormatted: string) {
  return tpl.replaceAll("{total}", totalFormatted);
}

export function formatWithOrder(
  tpl: string,
  orderNumber: string,
  totalFormatted: string,
  scheduleLabel: string,
) {
  return tpl
    .replaceAll("{order}", orderNumber)
    .replaceAll("{total}", totalFormatted)
    .replaceAll("{schedule}", scheduleLabel);
}
