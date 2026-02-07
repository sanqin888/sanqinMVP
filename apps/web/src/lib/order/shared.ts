// apps/web/src/lib/order/shared.ts
// 可同时被客户端/服务端安全引入的共享模块（不使用 next/headers、fs 等仅服务端 API）

/** ===== 基础类型 / 常量 ===== */
import type { Locale } from "@/lib/i18n/locales";
import type { LocalizedMenuItem } from "@/lib/menu/menu-transformer";

export const LANGUAGE_NAMES: Record<Locale, string> = {
  en: "English",
  zh: "中文",
};

// 结算货币 & 税率（安省 HST 13%）
export const HOSTED_CHECKOUT_CURRENCY = "CAD";
export const TAX_RATE = 0.13;
// 配送费是否计税
export const TAX_ON_DELIVERY = true;

/** ===== 结算页相关类型 ===== */
export type SelectedOptionSnapshot = {
  id: string;
  name: string;
  priceDeltaCents?: number;
};

export type CartEntry = {
  cartLineId: string;
  productStableId: string; // 对应 LocalizedMenuItem.stableId
  quantity: number;
  notes: string;
  options?: Record<string, SelectedOptionSnapshot[]>;
};

export type LocalizedCartItem = {
  cartLineId: string;
  productStableId: string;
  quantity: number;
  notes: string;
  options?: Record<string, SelectedOptionSnapshot[]>;
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
  orderStableId: string;
  orderNumber: string;
};

export type CardTokenPaymentResponse = {
  orderStableId: string;
  orderNumber: string;
  paymentId: string;
  status: string;
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
