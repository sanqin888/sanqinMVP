// apps/api/src/orders/order-item-options.ts
//
// Strongly-typed snapshot of an order item's option selections.

export type OrderItemOptionChoiceSnapshot = {
  /** StableId of the selected option */
  stableId: string;
  /** StableId of the template group this option belongs to */
  templateGroupStableId: string;
  /** Stable business id of a linked menu item selected by this option. */
  targetItemStableId?: string | null;
  nameEn: string | null;
  nameZh: string | null;
  /** External title retained as an immutable order-time fallback. */
  displayName?: string | null;
  /** Price delta (cents) applied by this option */
  priceDeltaCents: number;
  sortOrder: number;
};

export type OrderItemOptionGroupSnapshot = {
  templateGroupStableId: string;
  groupKey?: string | null;
  nameEn: string | null;
  nameZh: string | null;
  /** External title retained as an immutable order-time fallback. */
  displayName?: string | null;
  minSelect: number;
  maxSelect: number | null;
  sortOrder: number;
  choices: OrderItemOptionChoiceSnapshot[];
};

export type OrderItemOptionsSnapshot = OrderItemOptionGroupSnapshot[];
