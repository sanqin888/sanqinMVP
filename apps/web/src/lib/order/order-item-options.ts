// apps/web/src/lib/order/order-item-options.ts
// Typed snapshot for order item option selections stored in orders.optionsJson.

export type OrderItemOptionChoiceSnapshot = {
  stableId: string;
  templateGroupStableId: string;
  nameEn: string;
  nameZh: string | null;
  priceDeltaCents: number;
  sortOrder: number;
};

export type OrderItemOptionGroupSnapshot = {
  templateGroupStableId: string;
  nameEn: string;
  nameZh: string | null;
  minSelect: number;
  maxSelect: number | null;
  sortOrder: number;
  choices: OrderItemOptionChoiceSnapshot[];
};

export type OrderItemOptionsSnapshot = OrderItemOptionGroupSnapshot[];

