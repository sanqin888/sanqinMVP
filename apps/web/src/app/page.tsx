"use client";

import { useEffect, useMemo, useState } from "react";
import { apiFetch } from "../lib/api-client";

type Locale = "zh" | "en";
const LOCALES: Locale[] = ["zh", "en"];
const LANGUAGE_NAMES: Record<Locale, string> = { zh: "中文", en: "English" };

type LocalizedText = Record<Locale, string>;

type MenuItemDefinition = {
  id: string;
  name: LocalizedText;
  description: LocalizedText;
  price: number;
  tags?: LocalizedText[];
  calories?: number;
};

type MenuCategoryDefinition = {
  id: string;
  name: LocalizedText;
  description: LocalizedText;
  items: MenuItemDefinition[];
};

type MenuItemLocalized = {
  id: string;
  name: string;
  description: string;
  price: number;
  tags?: string[];
  calories?: number;
};

type MenuCategoryLocalized = {
  id: string;
  name: string;
  description: string;
  items: MenuItemLocalized[];
};

type CartEntry = {
  itemId: string;
  quantity: number;
  notes: string;
};

type LocalizedCartItem = CartEntry & { item: MenuItemLocalized };

type ConfirmationState = {
  orderNumber: string;
  total: number;
  fulfillment: "pickup" | "delivery";
};

type ScheduleSlot = "asap" | "18:00-18:30" | "18:30-19:00" | "19:00-19:30";

type HostedCheckoutResponse = {
  checkoutUrl: string;
  checkoutId?: string;
};

const MENU_DEFINITIONS: MenuCategoryDefinition[] = [
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

const MENU_ITEM_LOOKUP = new Map<string, MenuItemDefinition>();
MENU_DEFINITIONS.forEach((category) => {
  category.items.forEach((item) => {
    MENU_ITEM_LOOKUP.set(item.id, item);
  });
});

function localizeMenuItem(item: MenuItemDefinition, locale: Locale): MenuItemLocalized {
  return {
    id: item.id,
    name: item.name[locale],
    description: item.description[locale],
    price: item.price,
    calories: item.calories,
    tags: item.tags?.map((tag) => tag[locale]),
  };
}

function buildLocalizedMenu(locale: Locale): MenuCategoryLocalized[] {
  return MENU_DEFINITIONS.map((category) => ({
    id: category.id,
    name: category.name[locale],
    description: category.description[locale],
    items: category.items.map((item) => localizeMenuItem(item, locale)),
  }));
}

const UI_STRINGS: Record<Locale, {
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
}> = {
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
      serviceFee: "打包服务费",
      deliveryFee: "骑手配送费",
      total: "预计支付",
    },
    paymentHint: "点击后将在新页面打开 Clover 安全支付。",
    scheduleLabel: "送达时间",
    scheduleOptions: [
      { id: "asap", label: "尽快送达（约 30 分钟）" },
      { id: "18:00-18:30", label: "18:00-18:30" },
      { id: "18:30-19:00", label: "18:30-19:00" },
      { id: "19:00-19:30", label: "19:00-19:30" },
    ],
    contactInfoLabel: "联系信息",
    contactFields: {
      name: "联系人姓名",
      namePlaceholder: "请输入姓名",
      phone: "手机号",
      phonePlaceholder: "用于接收取餐通知",
      address: "配送地址",
      addressPlaceholder: "请填写楼宇 / 门牌号 / 楼层",
      notes: "订单备注",
      notesPlaceholder: "例如：抵达请电话联系、过敏原提醒等",
    },
    payCta: "提交订单并支付 {total}",
    processing: "正在跳转 Clover 支付…",
    languageSwitch: "界面语言",
    errors: {
      checkoutFailed: "支付链接创建失败，请稍后重试或联系工作人员。",
      missingCheckoutUrl: "后端未返回 Clover 支付链接。",
    },
    confirmation: {
      title: "已创建订单",
      pickup:
        "订单 {order} 已创建，请在新打开的 Clover 页面完成支付，短信会通知取餐号。",
      delivery:
        "订单 {order} 已创建，请在 Clover 页面完成支付，骑手将按时上门。",
      pickupMeta:
        "支付金额：{total} · 取餐准备就绪后会短信通知取餐号。",
      deliveryMeta: "支付金额：{total} · 预计送达时间：{schedule}。",
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
      serviceFee: "Packaging fee",
      deliveryFee: "Delivery fee",
      total: "Estimated total",
    },
    paymentHint: "A secure Clover checkout will open in a new tab after you continue.",
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

function formatWithTotal(template: string, total: string): string {
  return template.replace("{total}", total);
}

function formatWithOrder(
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

export default function Home() {
  const [locale, setLocale] = useState<Locale>("zh");
  const [cartItems, setCartItems] = useState<CartEntry[]>([]);
  const [fulfillment, setFulfillment] = useState<"pickup" | "delivery">("pickup");
  const [schedule, setSchedule] = useState<ScheduleSlot>("asap");
  const [customer, setCustomer] = useState({
    name: "",
    phone: "",
    address: "",
    notes: "",
  });
  const [confirmation, setConfirmation] = useState<ConfirmationState | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const strings = UI_STRINGS[locale];

  useEffect(() => {
    const navLang =
      typeof navigator !== "undefined"
        ? navigator.languages?.[0] ?? navigator.language
        : undefined;
    if (!navLang) return;
    const normalized = navLang.toLowerCase();
    setLocale(normalized.startsWith("zh") ? "zh" : "en");
  }, []);

  useEffect(() => {
    if (typeof document !== "undefined") {
      document.documentElement.lang = locale === "zh" ? "zh-Hans" : "en";
    }
  }, [locale]);

  const menu = useMemo(() => buildLocalizedMenu(locale), [locale]);

  const localizedCartItems = useMemo<LocalizedCartItem[]>(() => {
    return cartItems
      .map((entry) => {
        const definition = MENU_ITEM_LOOKUP.get(entry.itemId);
        if (!definition) return null;
        return { ...entry, item: localizeMenuItem(definition, locale) };
      })
      .filter((item): item is LocalizedCartItem => Boolean(item));
  }, [cartItems, locale]);

  const currencyFormatter = useMemo(
    () =>
      new Intl.NumberFormat(locale === "zh" ? "zh-CN" : "en-US", {
        style: "currency",
        currency: "CNY",
        minimumFractionDigits: 0,
        maximumFractionDigits: 2,
      }),
    [locale],
  );

  const subtotal = useMemo(
    () =>
      localizedCartItems.reduce(
        (total, cartItem) => total + cartItem.item.price * cartItem.quantity,
        0,
      ),
    [localizedCartItems],
  );

  const serviceFee = subtotal > 0 ? 3.5 : 0;
  const deliveryFee = fulfillment === "delivery" && subtotal > 0 ? 6 : 0;
  const total = subtotal + serviceFee + deliveryFee;

  const canPlaceOrder =
    localizedCartItems.length > 0 &&
    customer.name.trim().length > 0 &&
    customer.phone.trim().length >= 6 &&
    (fulfillment === "pickup" || customer.address.trim().length > 5);

  const scheduleLabel = strings.scheduleOptions.find(
    (option) => option.id === schedule,
  )?.label ?? "";

  const handleAddToCart = (itemId: string) => {
    setConfirmation(null);
    setErrorMessage(null);
    setCartItems((prev) => {
      const existing = prev.find((entry) => entry.itemId === itemId);
      if (existing) {
        return prev.map((entry) =>
          entry.itemId === itemId
            ? { ...entry, quantity: entry.quantity + 1 }
            : entry,
        );
      }
      return [...prev, { itemId, quantity: 1, notes: "" }];
    });
  };

  const updateQuantity = (itemId: string, delta: number) => {
    setConfirmation(null);
    setCartItems((prev) =>
      prev
        .map((entry) =>
          entry.itemId === itemId
            ? { ...entry, quantity: entry.quantity + delta }
            : entry,
        )
        .filter((entry) => entry.quantity > 0),
    );
  };

  const updateNotes = (itemId: string, notes: string) => {
    setCartItems((prev) =>
      prev.map((entry) =>
        entry.itemId === itemId ? { ...entry, notes } : entry,
      ),
    );
  };

  const handleCustomerChange = (
    field: "name" | "phone" | "address" | "notes",
    value: string,
  ) => {
    setCustomer((prev) => ({ ...prev, [field]: value }));
  };

  const handlePlaceOrder = async () => {
    if (!canPlaceOrder || isSubmitting) return;

    setErrorMessage(null);
    setConfirmation(null);

    const orderNumber = `SQ${Date.now().toString().slice(-6)}`;
    const totalCents = Math.round(total * 100);

    try {
      setIsSubmitting(true);

      const payload = {
        amountCents: totalCents,
        currency: "CNY",
        referenceId: orderNumber,
        description: `San Qin online order ${orderNumber}`,
        returnUrl:
          typeof window !== "undefined"
            ? `${window.location.origin}/order/${orderNumber}`
            : undefined,
        metadata: {
          locale,
          fulfillment,
          schedule,
          customer,
          subtotal,
          serviceFee,
          deliveryFee,
          items: localizedCartItems.map((cartItem) => ({
            id: cartItem.itemId,
            name: cartItem.item.name,
            quantity: cartItem.quantity,
            notes: cartItem.notes,
            price: cartItem.item.price,
          })),
        },
      };

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
        setConfirmation({ orderNumber, total, fulfillment });
      }
    } catch (error) {
      const message =
        error instanceof Error ? error.message : strings.errors.checkoutFailed;
      setErrorMessage(message);
      setConfirmation({ orderNumber, total, fulfillment });
    } finally {
      setIsSubmitting(false);
    }
  };

  const payButtonLabel = isSubmitting
    ? strings.processing
    : formatWithTotal(strings.payCta, currencyFormatter.format(total));

  return (
    <div className="min-h-screen bg-slate-50 pb-16 text-slate-900">
      <div className="mx-auto max-w-6xl px-4 pb-12 pt-10">
        <header className="rounded-3xl bg-white/90 p-8 shadow-sm backdrop-blur">
          <p className="text-sm font-medium uppercase tracking-[0.3em] text-slate-500">
            {strings.tagline}
          </p>
          <div className="mt-4 flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
            <div>
              <h1 className="text-3xl font-semibold tracking-tight text-slate-900 md:text-4xl">
                {strings.heroTitle}
              </h1>
              <p className="mt-3 max-w-2xl text-base text-slate-600">
                {strings.heroDescription}
              </p>
            </div>
            <div className="flex flex-col items-start gap-4 lg:items-end">
              <div className="flex flex-wrap gap-3 text-sm font-medium text-slate-600">
                {strings.orderSteps.map((step) => (
                  <div
                    key={step.id}
                    className="flex items-center gap-2 rounded-full border border-slate-200 bg-slate-100 px-4 py-2"
                  >
                    <span className="grid h-7 w-7 place-items-center rounded-full bg-slate-900 text-white">
                      {step.id}
                    </span>
                    <span>{step.label}</span>
                  </div>
                ))}
              </div>
              <div className="flex items-center gap-2 text-xs text-slate-500">
                <span className="font-medium">{strings.languageSwitch}</span>
                <div className="inline-flex gap-1 rounded-full bg-slate-200 p-1">
                  {LOCALES.map((code) => (
                    <button
                      key={code}
                      type="button"
                      onClick={() => setLocale(code)}
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
            </div>
          </div>
        </header>

        <div className="mt-10 grid gap-8 lg:grid-cols-[1.5fr_1fr]">
          <section className="space-y-10">
            {menu.map((category) => (
              <div key={category.id} className="space-y-4">
                <div className="flex flex-col gap-2 md:flex-row md:items-end md:justify-between">
                  <div>
                    <h2 className="text-2xl font-semibold text-slate-900">
                      {category.name}
                    </h2>
                    <p className="mt-1 max-w-2xl text-sm text-slate-600">
                      {category.description}
                    </p>
                  </div>
                </div>
                <div className="grid gap-4 md:grid-cols-2">
                  {category.items.map((item) => (
                    <article
                      key={item.id}
                      className="group flex flex-col justify-between rounded-3xl border border-slate-200 bg-white p-5 shadow-sm transition hover:-translate-y-0.5 hover:shadow-md"
                    >
                      <div className="space-y-3">
                        <div className="flex items-start justify-between gap-4">
                          <div>
                            <h3 className="text-lg font-semibold text-slate-900">
                              {item.name}
                            </h3>
                            <p className="mt-1 text-sm text-slate-600">
                              {item.description}
                            </p>
                          </div>
                          <span className="rounded-full bg-slate-900/90 px-3 py-1 text-sm font-semibold text-white">
                            {currencyFormatter.format(item.price)}
                          </span>
                        </div>
                        <div className="flex flex-wrap items-center gap-2 text-xs text-slate-500">
                          {item.tags?.map((tag) => (
                            <span
                              key={tag}
                              className="rounded-full bg-slate-100 px-2 py-1 font-medium text-slate-600"
                            >
                              #{tag}
                            </span>
                          ))}
                          {item.calories ? (
                            <span className="rounded-full bg-amber-50 px-2 py-1 font-medium text-amber-600">
                              {item.calories} kcal
                            </span>
                          ) : null}
                        </div>
                      </div>
                      <div className="mt-5 flex items-center justify-between gap-4">
                        <p className="text-xs text-slate-500">{strings.limitedDaily}</p>
                        <button
                          type="button"
                          onClick={() => handleAddToCart(item.id)}
                          className="inline-flex items-center justify-center rounded-full bg-slate-900 px-4 py-2 text-sm font-semibold text-white transition hover:bg-slate-700"
                        >
                          {strings.addToCart}
                        </button>
                      </div>
                    </article>
                  ))}
                </div>
              </div>
            ))}
          </section>

          <aside className="lg:sticky lg:top-10">
            <div className="rounded-3xl border border-slate-200 bg-white p-6 shadow-lg">
              <h2 className="text-lg font-semibold text-slate-900">{strings.cartTitle}</h2>
              {localizedCartItems.length === 0 ? (
                <p className="mt-4 rounded-2xl border border-dashed border-slate-200 bg-slate-50 p-4 text-sm text-slate-500">
                  {strings.cartEmpty}
                </p>
              ) : (
                <ul className="mt-4 space-y-4">
                  {localizedCartItems.map((cartItem) => (
                    <li key={cartItem.itemId} className="rounded-2xl border border-slate-200 p-4">
                      <div className="flex items-start justify-between gap-4">
                        <div>
                          <p className="text-sm font-semibold text-slate-900">
                            {cartItem.item.name}
                          </p>
                          <p className="mt-1 text-xs text-slate-500">
                            {currencyFormatter.format(cartItem.item.price)} × {cartItem.quantity}
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
                          onChange={(event) => updateNotes(cartItem.itemId, event.target.value)}
                          placeholder={strings.cartNotesPlaceholder}
                          className="mt-1 w-full rounded-2xl border border-slate-200 bg-slate-50 p-2 text-sm text-slate-700 focus:border-slate-400 focus:outline-none"
                          rows={2}
                        />
                      </label>
                    </li>
                  ))}
                </ul>
              )}

              <div className="mt-6 space-y-4">
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

                <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4 text-sm text-slate-600">
                  <div className="flex items-center justify-between text-xs">
                    <span>{strings.summary.subtotal}</span>
                    <span>{currencyFormatter.format(subtotal)}</span>
                  </div>
                  <div className="mt-2 flex items-center justify-between text-xs">
                    <span>{strings.summary.serviceFee}</span>
                    <span>{currencyFormatter.format(serviceFee)}</span>
                  </div>
                  {fulfillment === "delivery" ? (
                    <div className="mt-2 flex items-center justify-between text-xs">
                      <span>{strings.summary.deliveryFee}</span>
                      <span>{currencyFormatter.format(deliveryFee)}</span>
                    </div>
                  ) : null}
                  <div className="mt-3 border-t border-slate-200 pt-3 text-sm font-semibold text-slate-900">
                    <div className="flex items-center justify-between">
                      <span>{strings.summary.total}</span>
                      <span>{currencyFormatter.format(total)}</span>
                    </div>
                  </div>
                </div>

                {fulfillment === "delivery" ? (
                  <div className="space-y-3">
                    <label className="block text-xs font-semibold uppercase tracking-[0.3em] text-slate-500">
                      {strings.scheduleLabel}
                      <select
                        value={schedule}
                        onChange={(event) => setSchedule(event.target.value as ScheduleSlot)}
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
                ) : (
                  <p className="rounded-2xl bg-slate-100 p-3 text-xs text-slate-600">
                    {strings.fulfillment.pickupNote}
                  </p>
                )}

                <div className="space-y-3">
                  <h3 className="text-xs font-semibold uppercase tracking-[0.3em] text-slate-500">
                    {strings.contactInfoLabel}
                  </h3>
                  <label className="block text-xs font-medium text-slate-600">
                    {strings.contactFields.name}
                    <input
                      value={customer.name}
                      onChange={(event) => handleCustomerChange("name", event.target.value)}
                      placeholder={strings.contactFields.namePlaceholder}
                      className="mt-1 w-full rounded-2xl border border-slate-200 bg-white p-2 text-sm text-slate-700 focus:border-slate-400 focus:outline-none"
                    />
                  </label>
                  <label className="block text-xs font-medium text-slate-600">
                    {strings.contactFields.phone}
                    <input
                      value={customer.phone}
                      onChange={(event) => handleCustomerChange("phone", event.target.value)}
                      placeholder={strings.contactFields.phonePlaceholder}
                      className="mt-1 w-full rounded-2xl border border-slate-200 bg-white p-2 text-sm text-slate-700 focus:border-slate-400 focus:outline-none"
                    />
                  </label>
                  {fulfillment === "delivery" ? (
                    <label className="block text-xs font-medium text-slate-600">
                      {strings.contactFields.address}
                      <textarea
                        value={customer.address}
                        onChange={(event) => handleCustomerChange("address", event.target.value)}
                        placeholder={strings.contactFields.addressPlaceholder}
                        className="mt-1 w-full rounded-2xl border border-slate-200 bg-white p-2 text-sm text-slate-700 focus:border-slate-400 focus:outline-none"
                        rows={2}
                      />
                    </label>
                  ) : null}
                  <label className="block text-xs font-medium text-slate-600">
                    {strings.contactFields.notes}
                    <textarea
                      value={customer.notes}
                      onChange={(event) => handleCustomerChange("notes", event.target.value)}
                      placeholder={strings.contactFields.notesPlaceholder}
                      className="mt-1 w-full rounded-2xl border border-slate-200 bg-white p-2 text-sm text-slate-700 focus:border-slate-400 focus:outline-none"
                      rows={2}
                    />
                  </label>
                </div>

                <div className="space-y-2">
                  <p className="text-xs text-slate-500">{strings.paymentHint}</p>
                  {errorMessage ? (
                    <div className="rounded-2xl border border-red-200 bg-red-50 p-3 text-xs text-red-600">
                      {errorMessage}
                    </div>
                  ) : null}
                </div>

                <button
                  type="button"
                  onClick={handlePlaceOrder}
                  disabled={!canPlaceOrder || isSubmitting}
                  className="w-full rounded-full bg-emerald-600 px-5 py-3 text-sm font-semibold text-white transition enabled:hover:bg-emerald-500 disabled:cursor-not-allowed disabled:bg-emerald-200"
                >
                  {payButtonLabel}
                </button>
              </div>

              {confirmation ? (
                <div className="mt-6 rounded-3xl border border-emerald-200 bg-emerald-50 p-4 text-sm text-emerald-700">
                  <p className="font-semibold">{strings.confirmation.title}</p>
                  <p className="mt-1">
                    {formatWithOrder(
                      confirmation.fulfillment === "delivery"
                        ? strings.confirmation.delivery
                        : strings.confirmation.pickup,
                      confirmation.orderNumber,
                      currencyFormatter.format(confirmation.total),
                      scheduleLabel,
                    )}
                  </p>
                  <p className="mt-1 text-xs text-emerald-600">
                    {formatWithOrder(
                      confirmation.fulfillment === "delivery"
                        ? strings.confirmation.deliveryMeta
                        : strings.confirmation.pickupMeta,
                      confirmation.orderNumber,
                      currencyFormatter.format(confirmation.total),
                      scheduleLabel,
                    )}
                  </p>
                </div>
              ) : null}
            </div>
          </aside>
        </div>
      </div>
    </div>
  );
}
