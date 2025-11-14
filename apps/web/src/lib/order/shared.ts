// apps/web/src/lib/order/shared.ts
// 可同时被客户端/服务端安全引入的共享模块（不使用 next/headers、fs 等仅服务端 API）

/** ===== 基础类型 / 常量 ===== */
export type Locale = "en" | "zh";
export const LOCALES = ["en", "zh"] as const;
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
  address: string;
  notes: string;
  namePlaceholder: string;
  phonePlaceholder: string;
  addressPlaceholder: string;
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

    // ↙↙ 本次补充（缺少会导致运行时报错）
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
      pickup: string;   // {order} {total} {schedule}
      delivery: string; // {order} {total} {schedule}
      pickupMeta: string;
      deliveryMeta: string;
    };
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
      address: "Address",
      notes: "Notes",
      namePlaceholder: "Your name",
      phonePlaceholder: "Mobile number",
      addressPlaceholder: "Street, city, postal code",
      notesPlaceholder: "E.g., less spicy / no cilantro",
    },

    // ✅ 新增
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
  },
  zh: {
    tagline: "新鲜 • 迅速 • 手工",
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
      address: "地址",
      notes: "备注",
      namePlaceholder: "请输入姓名",
      phonePlaceholder: "手机号",
      addressPlaceholder: "街道 / 城市 / 邮编",
      notesPlaceholder: "例如：少辣 / 不要香菜",
    },

    // ✅ 新增
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
  },
};

/** ===== 菜单定义 ===== */
export type MenuItemDefinition = {
  id: string;
  price: number;
  calories?: number;
  tags?: string[];
  i18n: {
    en: { name: string; description: string };
    zh: { name: string; description: string };
  };
  category: "bestsellers" | "noodles" | "snacks";
};

const MENU_DEFS: MenuItemDefinition[] = [
  {
    id: "liangpi",
    price: 11.99,
    calories: 520,
    tags: ["cold", "vegan"],
    category: "bestsellers",
    i18n: {
      en: { name: "Liangpi (Cold Skin Noodles)", description: "Chewy cold noodles, sesame & chili dressing." },
      zh: { name: "凉皮", description: "筋道爽滑，芝麻辣油拌料。" },
    },
  },
  {
    id: "roujiamo",
    price: 8.99,
    calories: 430,
    tags: ["pork"],
    category: "bestsellers",
    i18n: {
      en: { name: "Roujiamo", description: "Crispy bun stuffed with braised pork." },
      zh: { name: "肉夹馍", description: "焦香面饼夹秘卤肉，咸香适口。" },
    },
  },
  {
    id: "beef-noodle",
    price: 13.5,
    calories: 680,
    tags: ["beef", "hot"],
    category: "noodles",
    i18n: {
      en: { name: "Beef Noodle Soup", description: "Rich broth with hand-pulled noodles." },
      zh: { name: "红烧牛肉面", description: "手擀面配浓郁红烧汤底。" },
    },
  },
  {
    id: "cucumber-salad",
    price: 6.5,
    calories: 120,
    tags: ["cold", "vegan"],
    category: "snacks",
    i18n: {
      en: { name: "Smashed Cucumber", description: "Garlic, vinegar, sesame oil." },
      zh: { name: "蒜拍黄瓜", description: "蒜香爽脆，香醋芝麻油。" },
    },
  },
];

export function localizeMenuItem(def: MenuItemDefinition, locale: Locale) {
  const t = def.i18n[locale];
  return {
    id: def.id,
    name: t.name,
    description: t.description,
    price: def.price,
    calories: def.calories,
    tags: def.tags ?? [],
  };
}

export const MENU_ITEM_LOOKUP: Map<string, MenuItemDefinition> = new Map(
  MENU_DEFS.map((d) => [d.id, d]),
);

export type LocalizedCategory = {
  id: string;
  name: string;
  description: string;
  items: Array<ReturnType<typeof localizeMenuItem>>;
};

export function buildLocalizedMenu(locale: Locale): LocalizedCategory[] {
  const catInfo: Record<
    MenuItemDefinition["category"],
    { name: Record<Locale, string>; desc: Record<Locale, string> }
  > = {
    bestsellers: {
      name: { en: "Best Sellers", zh: "人气必点" },
      desc: { en: "Crowd favorites you can’t go wrong with.", zh: "经典不踩雷。" },
    },
    noodles: {
      name: { en: "Noodles", zh: "面食" },
      desc: { en: "Hand-pulled and hearty bowls.", zh: "手擀面/牛肉面等。" },
    },
    snacks: {
      name: { en: "Snacks & Sides", zh: "小食&凉菜" },
      desc: { en: "Shareable bites.", zh: "开胃小食，适合分享。" },
    },
  };

  const groups: Record<MenuItemDefinition["category"], LocalizedCategory> = {
    bestsellers: { id: "bestsellers", name: "", description: "", items: [] },
    noodles: { id: "noodles", name: "", description: "", items: [] },
    snacks: { id: "snacks", name: "", description: "", items: [] },
  };

  for (const cat of Object.keys(groups) as Array<MenuItemDefinition["category"]>) {
    groups[cat].name = catInfo[cat].name[locale];
    groups[cat].description = catInfo[cat].desc[locale];
  }

  for (const def of MENU_DEFS) {
    groups[def.category].items.push(localizeMenuItem(def, locale));
  }

  return ["bestsellers", "noodles", "snacks"].map((k) => groups[k as keyof typeof groups]);
}

/** ===== 结算页相关类型 ===== */
export type CartEntry = {
  itemId: string;
  quantity: number;
  notes: string;
};

export type LocalizedCartItem = {
  itemId: string;
  quantity: number;
  notes: string;
  item: ReturnType<typeof localizeMenuItem>;
};

export type DeliveryTypeOption = 'STANDARD' | 'PRIORITY';
export type DeliveryProviderOption = 'DOORDASH_DRIVE' | 'UBER_DIRECT';

export type ConfirmationState = {
  orderNumber: string;
  total: number;
  fulfillment: "pickup" | "delivery";
};

export type HostedCheckoutResponse = {
  checkoutUrl: string;
};

/** ===== 工具函数 ===== */
export function addLocaleToPath(next: Locale, path: string) {
  if (!path.startsWith("/")) path = `/${path}`;
  const parts = path.split("/");
  const first = parts[1];
  if (first === "zh" || first === "en") {
    parts[1] = next;
    return parts.join("/");
  }
  return `/${next}${path}`;
}

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
