export type Locale = "zh" | "en";
export const LOCALES: Locale[] = ["zh", "en"];
export const LANGUAGE_NAMES: Record<Locale, string> = { zh: "中文", en: "English" };

export const TAX_RATE = Number.parseFloat(process.env.NEXT_PUBLIC_SALES_TAX_RATE ?? "0.13");
export const TAX_ON_DELIVERY = (process.env.NEXT_PUBLIC_TAX_ON_DELIVERY ?? "true") === "true";
export const HOSTED_CHECKOUT_CURRENCY = "CAD" as const;

export type LocalizedText = Record<Locale, string>;

export type MenuItemDefinition = {
  id: string;
  name: LocalizedText;
  description: LocalizedText;
  price: number;
  tags?: LocalizedText[];
  calories?: number;
};

export type MenuCategoryDefinition = {
  id: string;
  name: LocalizedText;
  description: LocalizedText;
  items: MenuItemDefinition[];
};

export type MenuItemLocalized = {
  id: string;
  name: string;
  description: string;
  price: number;
  tags?: string[];
  calories?: number;
};

export type MenuCategoryLocalized = {
  id: string;
  name: string;
  description: string;
  items: MenuItemLocalized[];
};

export type CartEntry = {
  itemId: string;
  quantity: number;
  notes: string;
};

export type LocalizedCartItem = CartEntry & { item: MenuItemLocalized };

export type ConfirmationState = {
  orderNumber: string;
  total: number;
  fulfillment: "pickup" | "delivery";
};

export type ScheduleSlot = "asap" | "18:00-18:30" | "18:30-19:00" | "19:00-19:30";

export type HostedCheckoutResponse = {
  checkoutUrl: string;
  checkoutId?: string;
};

export const MENU_DEFINITIONS: MenuCategoryDefinition[] = [
  {
    id: "signature-noodles",
    name: { zh: "招牌面食", en: "Signature Noodles" },
    description: {
      zh: "每日手擀面搭配慢炖汤底，保证筋道口感与层次丰富的汤味。",
      en: "Hand-pulled noodles paired with slow-simmered broths for a chewy bite and layered flavor.",
    },
    items: [
      {
        id: "braised-beef-noodles",
        name: { zh: "老坛红烧牛肉面", en: "Pickled Chili Braised Beef Noodles" },
        description: {
          zh: "慢炖牛腱配陈年酸菜与番茄汤底，微辣开胃。",
          en: "Slow-braised beef shank with aged pickled mustard greens in a tomato broth, lightly spicy and appetizing.",
        },
        price: 38,
        tags: [
          { zh: "招牌", en: "Signature" },
          { zh: "微辣", en: "Mild Spice" },
        ],
        calories: 520,
      },
      {
        id: "pepper-chicken-noodles",
        name: { zh: "藤椒鸡汤面", en: "Green Sichuan Pepper Chicken Noodles" },
        description: {
          zh: "藤椒鸡汤鲜香带麻，搭配时蔬与手工面。",
          en: "Fragrant chicken broth infused with green Sichuan peppercorns, served with seasonal greens and handmade noodles.",
        },
        price: 34,
        tags: [{ zh: "清爽", en: "Refreshing" }],
        calories: 468,
      },
      {
        id: "vegetable-mushroom-noodles",
        name: { zh: "香菇素笋面", en: "Mushroom & Bamboo Shoots Veggie Noodles" },
        description: {
          zh: "有机香菇与笋尖炖煮，汤底醇厚适合素食者。",
          en: "Organic shiitake and bamboo shoots simmered to a rich vegetarian broth, ideal for plant-forward diners.",
        },
        price: 32,
        tags: [{ zh: "素食", en: "Vegetarian" }],
        calories: 410,
      },
    ],
  },
  {
    id: "small-plates",
    name: { zh: "小食精选", en: "Small Plates" },
    description: {
      zh: "佐餐小食，丰富味觉层次，适合分享。",
      en: "Shareable sides that build layers of flavor alongside the noodles.",
    },
    items: [
      {
        id: "crispy-shallot-pancake",
        name: { zh: "金黄葱油饼", en: "Golden Scallion Pancake" },
        description: {
          zh: "表层酥脆内里柔软，淋上秘制葱油。",
          en: "Crispy outside, tender inside, finished with our signature scallion oil.",
        },
        price: 16,
        tags: [{ zh: "人气", en: "Guest Favorite" }],
        calories: 260,
      },
      {
        id: "chili-dumpling",
        name: { zh: "红油抄手", en: "Chili Oil Pork Dumplings" },
        description: {
          zh: "手包鲜肉抄手浸入自制红油酱汁，辣香兼备。",
          en: "Hand-folded pork wontons coated in house-blended chili oil—bold and aromatic.",
        },
        price: 22,
        tags: [{ zh: "重口", en: "Bold Flavor" }],
        calories: 320,
      },
      {
        id: "tea-eggs",
        name: { zh: "桂花茶叶蛋", en: "Osmanthus Tea Egg" },
        description: {
          zh: "桂花入味，茶香四溢的慢煮溏心蛋。",
          en: "Soft-boiled egg steeped with osmanthus blossoms and tea for gentle floral sweetness.",
        },
        price: 12,
        calories: 150,
      },
    ],
  },
  {
    id: "drinks-desserts",
    name: { zh: "饮品甜品", en: "Drinks & Desserts" },
    description: {
      zh: "精选饮品与甜点，平衡味蕾。",
      en: "Thoughtfully paired drinks and desserts to balance the meal.",
    },
    items: [
      {
        id: "soy-milk",
        name: { zh: "现磨豆乳", en: "Fresh Soy Milk" },
        description: {
          zh: "每日新鲜研磨黄豆，微甜顺滑。",
          en: "Fresh-ground soybeans with a delicate sweetness and silky texture.",
        },
        price: 10,
        tags: [{ zh: "热销", en: "Top Seller" }],
        calories: 180,
      },
      {
        id: "cold-brew-tea",
        name: { zh: "冷泡乌龙茶", en: "Cold Brew Oolong Tea" },
        description: {
          zh: "低温萃取保留茶香与回甘，冰爽解腻。",
          en: "Cold-steeped to preserve the oolong aroma with a crisp, refreshing finish.",
        },
        price: 14,
        calories: 80,
      },
      {
        id: "black-sesame-pudding",
        name: { zh: "黑芝麻奶冻", en: "Black Sesame Coconut Pudding" },
        description: {
          zh: "芝麻研磨搭配生椰奶，口感绵密。",
          en: "Stone-ground black sesame blended with fresh coconut milk for a silky pudding.",
        },
        price: 18,
        tags: [{ zh: "限量", en: "Limited" }],
        calories: 260,
      },
    ],
  },
];

export const MENU_ITEM_LOOKUP = new Map<string, MenuItemDefinition>();
MENU_DEFINITIONS.forEach((category) => {
  category.items.forEach((item) => {
    MENU_ITEM_LOOKUP.set(item.id, item);
  });
});

export function localizeMenuItem(item: MenuItemDefinition, locale: Locale): MenuItemLocalized {
  return {
    id: item.id,
    name: item.name[locale],
    description: item.description[locale],
    price: item.price,
    calories: item.calories,
    tags: item.tags?.map((tag) => tag[locale]),
  };
}

export function buildLocalizedMenu(locale: Locale): MenuCategoryLocalized[] {
  return MENU_DEFINITIONS.map((category) => ({
    id: category.id,
    name: category.name[locale],
    description: category.description[locale],
    items: category.items.map((item) => localizeMenuItem(item, locale)),
  }));
}

export const UI_STRINGS: Record<
  Locale,
  {
    tagline: string;
    heroTitle: string;
    heroDescription: string;
    orderSteps: { id: number; label: string }[];
    limitedDaily: string;
    addToCart: string;
    cartTitle: string;
    cartEmpty: string;
    cartNotesLabel: string;
    cartNotesPlaceholder: string;
    quantity: { decrease: string; increase: string };
    fulfillmentLabel: string;
    fulfillment: {
      pickup: string;
      delivery: string;
      pickupNote: string;
    };
    summary: {
      subtotal: string;
      tax: string;
      serviceFee: string;
      deliveryFee: string;
      total: string;
    };
    paymentHint: string;
    scheduleLabel: string;
    scheduleOptions: { id: ScheduleSlot; label: string }[];
    contactInfoLabel: string;
    contactFields: {
      name: string;
      namePlaceholder: string;
      phone: string;
      phonePlaceholder: string;
      address: string;
      addressPlaceholder: string;
      notes: string;
      notesPlaceholder: string;
    };
    payCta: string;
    processing: string;
    floatingCartLabel: string;
    languageSwitch: string;
    errors: {
      checkoutFailed: string;
      missingCheckoutUrl: string;
    };
    confirmation: {
      title: string;
      pickup: string;
      delivery: string;
      pickupMeta: string;
      deliveryMeta: string;
    };
  }
> = {
  zh: {
    tagline: "三秦面馆 · 晚市菜单",
    heroTitle: "智能点餐，安心堂食与外送",
    heroDescription:
      "结合顾客习惯设计的点餐流。先挑选喜爱的菜品，再确认取餐方式并填写联系信息，最后一键跳转 Clover 完成支付。",
    orderSteps: [
      { id: 1, label: "挑选菜品" },
      { id: 2, label: "确认方式" },
      { id: 3, label: "填写信息" },
      { id: 4, label: "在线支付" },
    ],
    limitedDaily: "精选食材每日限量供应，建议尽快下单。",
    addToCart: "加入购物车",
    cartTitle: "购物车与下单",
    cartEmpty:
      "购物车为空。挑选喜欢的菜品后，系统会为你计算配送与服务费用。",
    cartNotesLabel: "口味备注",
    cartNotesPlaceholder: "例如：少辣 / 加香菜",
    quantity: {
      decrease: "减少份数",
      increase: "增加份数",
    },
    fulfillmentLabel: "取餐方式",
    fulfillment: {
      pickup: "到店自取",
      delivery: "骑手外送",
      pickupNote: "到店自取预计 15 分钟后即可取餐，我们会短信通知取餐号。",
    },
    summary: {
      subtotal: "菜品小计",
      tax: "税费（HST）",
      serviceFee: "打包服务费",
      deliveryFee: "骑手配送费",
      total: "预计支付",
    },
    paymentHint: "点击继续后将打开 Clover 安全支付页面。",
    scheduleLabel: "配送时间",
    scheduleOptions: [
      { id: "asap", label: "尽快送达（约 30 分钟）" },
      { id: "18:00-18:30", label: "18:00 – 18:30" },
      { id: "18:30-19:00", label: "18:30 – 19:00" },
      { id: "19:00-19:30", label: "19:00 – 19:30" },
    ],
    contactInfoLabel: "联系信息",
    contactFields: {
      name: "姓名",
      namePlaceholder: "请填写姓名",
      phone: "手机号",
      phonePlaceholder: "用于短信通知",
      address: "配送地址",
      addressPlaceholder: "街道 / 门牌 / 楼层",
      notes: "订单备注",
      notesPlaceholder: "例如：呼叫我，或过敏信息",
    },
    payCta: "使用 Clover 支付 {total}",
    processing: "正在跳转 Clover 支付页…",
    floatingCartLabel: "购物车",
    languageSwitch: "语言",
    errors: {
      checkoutFailed: "暂时无法创建支付链接，请稍后重试或联系店员协助。",
      missingCheckoutUrl: "未获取到 Clover 支付链接。",
    },
    confirmation: {
      title: "订单已生成",
      pickup:
        "订单 {order} 已准备好——请在新打开的 Clover 页面完成支付，短信通知后再前往取餐。",
      delivery:
        "订单 {order} 已准备好——完成 Clover 支付后，骑手会按时出发配送。",
      pickupMeta:
        "支付金额：{total} · 厨房完成后会短信发送取餐号。",
      deliveryMeta:
        "支付金额：{total} · 预约时间：{schedule}。",
    },
  },
  en: {
    tagline: "San Qin Noodle House · Dinner Menu",
    heroTitle: "Smart ordering for dine-in and delivery",
    heroDescription:
      "A guest-friendly flow: pick your dishes, choose fulfillment, leave your contact, then jump to Clover for secure payment.",
    orderSteps: [
      { id: 1, label: "Browse dishes" },
      { id: 2, label: "Choose fulfillment" },
      { id: 3, label: "Add contact details" },
      { id: 4, label: "Pay online" },
    ],
    limitedDaily:
      "Daily limited ingredients—place your order soon to secure a serving.",
    addToCart: "Add to cart",
    cartTitle: "Cart & checkout",
    cartEmpty:
      "Your cart is empty. Add dishes to calculate service and delivery fees automatically.",
    cartNotesLabel: "Cooking notes",
    cartNotesPlaceholder: "e.g. less chili / extra cilantro",
    quantity: {
      decrease: "Decrease quantity",
      increase: "Increase quantity",
    },
    fulfillmentLabel: "Fulfillment",
    fulfillment: {
      pickup: "Pick up in store",
      delivery: "Courier delivery",
      pickupNote:
        "Pick-up orders are ready in about 15 minutes—we'll text you the pickup code.",
    },
    summary: {
      subtotal: "Subtotal",
      tax: "Tax (HST)",
      serviceFee: "Packaging fee",
      deliveryFee: "Delivery fee",
      total: "Estimated total",
    },
    paymentHint:
      "A secure Clover checkout will open in a new tab after you continue.",
    scheduleLabel: "Delivery window",
    scheduleOptions: [
      { id: "asap", label: "ASAP (≈30 minutes)" },
      { id: "18:00-18:30", label: "6:00 – 6:30 PM" },
      { id: "18:30-19:00", label: "6:30 – 7:00 PM" },
      { id: "19:00-19:30", label: "7:00 – 7:30 PM" },
    ],
    contactInfoLabel: "Contact details",
    contactFields: {
      name: "Name",
      namePlaceholder: "Full name",
      phone: "Phone",
      phonePlaceholder: "We'll text the pickup or delivery updates",
      address: "Delivery address",
      addressPlaceholder: "Building / unit / floor",
      notes: "Order notes",
      notesPlaceholder: "e.g. call on arrival, allergy info",
    },
    payCta: "Pay {total} securely with Clover",
    processing: "Redirecting to Clover checkout…",
    floatingCartLabel: "Cart",
    languageSwitch: "Language",
    errors: {
      checkoutFailed:
        "We couldn't start the Clover checkout. Please try again or ask a team member for help.",
      missingCheckoutUrl: "Clover did not return a checkout link.",
    },
    confirmation: {
      title: "Order created",
      pickup:
        "Order {order} is ready—complete payment on the Clover page that opened and pick up when you receive the text notification.",
      delivery:
        "Order {order} is ready—complete payment on Clover and our courier will head out on time.",
      pickupMeta:
        "Payment total: {total} · We'll text the pickup code once the kitchen finishes.",
      deliveryMeta:
        "Payment total: {total} · Requested window: {schedule}.",
    },
  },
};

export function removeLeadingLocale(path: string) {
  return path.replace(/^\/(zh|en)(?=\/|$)/, "");
}

export function addLocaleToPath(locale: Locale, path: string) {
  if (!path.startsWith("/")) path = `/${path}`;
  return `/${locale}${removeLeadingLocale(path)}`;
}

export function formatWithTotal(template: string, total: string): string {
  return template.replace("{total}", total);
}

export function formatWithOrder(
  template: string,
  order: string,
  total: string,
  schedule: string,
): string {
  return template
    .replace("{order}", order)
    .replace("{total}", total)
    .replace("{schedule}", schedule);
}
