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
};

export async function getDictionary(locale: Locale) {
  return locale === "zh" ? zh : en;
}
