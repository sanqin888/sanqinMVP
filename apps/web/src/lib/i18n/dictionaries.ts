import type { Locale } from "./locales";

const zh = {
  common: {
    viewMore: "了解更多",
    startOrder: "开始下单",
  },
  home: {
    title: "欢迎来到三秦",
    subtitle: "地道西北风味 · 线上预订 · 门店自取",
    blocks: {
      menuTitle: "查看菜单",
      menuDesc: "牛肉臊子、凉皮、肉夹馍等人气单品。",
      orderTitle: "现在下单",
      orderDesc: "选择门店与取餐时间，极速制作。",
    },
  },
  thankYou: {
    brand: "SAN QIN 三秦面馆",
    title: "感谢下单",
    intro:
      "支付已完成，感谢您的支持。我们正在确认订单详情，请保持手机畅通以接收短信通知。",
    numberLabel: "订单编号",
    note: "请保留编号以便查询或到店取餐时出示。",
    contact: "如需调整订单，请致电门店或通过短信联系我们。",
    backCta: "返回菜单",
    switchLabel: "English",
  },
};

const en = {
  common: {
    viewMore: "Learn more",
    startOrder: "Start order",
  },
  home: {
    title: "Welcome to San Qin",
    subtitle: "Authentic Northwestern Chinese · Order online · Pick up in-store",
    blocks: {
      menuTitle: "View menu",
      menuDesc: "Top picks like Biangbiang noodles, Liangpi, Roujiamo.",
      orderTitle: "Order now",
      orderDesc: "Choose a store and pickup time. Freshly made fast.",
    },
  },
  thankYou: {
    brand: "SAN QIN NOODLE HOUSE",
    title: "Thank you!",
    intro:
      "Payment confirmed. Thanks for supporting us! We are double-checking the order details — please keep your phone available for text updates.",
    numberLabel: "Your order number",
    note: "Keep this number for reference when picking up or reaching out.",
    contact: "Need to adjust anything? Call the restaurant or send us a text.",
    backCta: "Back to menu",
    switchLabel: "中文",
  },
};

export async function getDictionary(locale: Locale) {
  return locale === "zh" ? zh : en;
}
