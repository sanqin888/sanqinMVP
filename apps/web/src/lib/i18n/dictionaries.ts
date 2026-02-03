// apps/web/src/lib/i18n/dictionaries.ts

import type { Locale } from "@/lib/i18n/locales";

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

type UtensilStrings = {
  title: string;
  description: string;
  yes: string;
  no: string;
  typeLabel: string;
  typeChopsticks: string;
  typeFork: string;
  quantityLabel: string;
  optionOne: string;
  optionTwo: string;
  optionOther: string;
  otherLabel: string;
  otherPlaceholder: string;
};

type ThankYouStrings = {
  brand: string;
  switchLabel: string;
  title: string;
  intro: string;
  numberLabel: string;
  note: string;
  mapTitle: string;
  mapCta: string;
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
    chooseOptions: string;

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
    utensils: UtensilStrings;

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
    heroTitle: "Order SanQ Roujiamo fast & tasty dishes",
    heroDescription:
      "Classic Liangpi, Roujiamo, featured noodles and more. Order now and pick up in minutes—or get delivery.",
    orderSteps: [
      { id: 1, label: "Choose your dishes" },
      { id: 2, label: "Add notes & confirm" },
      { id: 3, label: "Pay securely online" },
      { id: 4, label: "Enjoy Your Meal" },
    ],
    languageSwitch: "Language",
    cartTitle: "Cart",
    floatingCartLabel: "Cart",
    limitedDaily: "Limited daily supply",
    addToCart: "Add to cart",
    chooseOptions: "Choose options",

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
      notesPlaceholder: "E.g., Buzz Code",
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

    utensils: {
      title: "Utensils",
      description: "Do you need disposable utensils with your order?",
      yes: "Yes",
      no: "No",
      typeLabel: "Choose a utensil",
      typeChopsticks: "Chopsticks",
      typeFork: "Fork",
      quantityLabel: "How many sets?",
      optionOne: "1 set",
      optionTwo: "2 sets",
      optionOther: "Other amount",
      otherLabel: "Other quantity",
      otherPlaceholder: "Enter quantity",
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
      brand: "SanQ · Xi'an Street Food",
      switchLabel: "中文",
      title: "Payment successful",
      intro: "Thank you for your order! We're preparing your food.",
      numberLabel: "Order number",
      note: "Please keep this order number for pickup or delivery inquiries.",
      mapTitle: "Store location",
      mapCta: "Navigate in Google Maps",
      contact: "If you have any questions, feel free to reach out to us.",
      backCta: "Back to homepage",
    },
  },
  zh: {
    tagline: "新鲜 · 迅速 · 手工",
    heroTitle: "三秦肉夹馍 · 线上点餐",
    heroDescription:
      "经典凉皮、肉夹馍、特色面食等。现在下单，数分钟即可自取或外送，享受美食。",
    orderSteps: [
      { id: 1, label: "挑选菜品" },
      { id: 2, label: "备注与确认" },
      { id: 3, label: "在线支付" },
      { id: 4, label: "享用美食" },
    ],
    languageSwitch: "语言",
    cartTitle: "购物车",
    floatingCartLabel: "购物车",
    limitedDaily: "每日限量",
    addToCart: "加入购物车",
    chooseOptions: "选择选项",

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
      notesPlaceholder: "例如：门铃号码",
    },
    deliveryDistance: {
      restriction: "目前仅支持距离门店 {radius} 内的外送。",
      checking: "正在计算配送距离...",
      withinRange: "配送距离约 {distance}，在 {radius} 范围内。",
      outsideRange: "配送距离约 {distance}，超出 {radius} 限制。",
      notFound: "未能定位该地址，请补充街道、城市与邮编信息。",
      failed: "暂时无法验证地址，请稍后再试。",
    },

    utensils: {
      title: "餐具",
      description: "需要一次性餐具吗？",
      yes: "需要",
      no: "不需要",
      typeLabel: "选择餐具",
      typeChopsticks: "筷子",
      typeFork: "叉子",
      quantityLabel: "需要几套餐具？",
      optionOne: "1 份",
      optionTwo: "2 份",
      optionOther: "其他数量",
      otherLabel: "其他份数",
      otherPlaceholder: "请输入数量",
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
      mapTitle: "门店位置",
      mapCta: "打开 Google 地图导航",
      contact: "如有问题，欢迎随时联系我们。",
      backCta: "返回首页",
    },
  },
};
