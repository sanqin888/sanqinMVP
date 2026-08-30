import type { OrderItemOptionsSnapshot } from './order-item-options';

export type OrderItemComponentDisplaySnapshot = {
  productStableId: string;
  nameEn: string | null;
  nameZh: string | null;
  quantity: number;
  priceDeltaCents?: number;
  source: 'FIXED' | 'OPTION';
  sourceOptionStableId?: string | null;
  options: OrderItemOptionsSnapshot;
};
