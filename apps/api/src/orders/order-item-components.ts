import type { OrderItemOptionsSnapshot } from './order-item-options';

export type OrderItemComponentSource = 'FIXED' | 'OPTION';

/**
 * Immutable snapshot of an actual menu item contained by a purchased parent item.
 * Pricing remains on the parent OrderItem; this snapshot is for fulfillment,
 * item-level sales quantities, labels and historical display.
 */
export type OrderItemComponentSnapshot = {
  productStableId: string;
  nameEn: string | null;
  nameZh: string | null;
  quantityPerParent: number;
  source: OrderItemComponentSource;
  sourceOptionStableId?: string | null;
  options: OrderItemOptionsSnapshot;
};

export type OrderItemComponentsSnapshot = OrderItemComponentSnapshot[];

export function readOrderItemComponentsSnapshot(
  value: unknown,
): OrderItemComponentsSnapshot {
  if (!Array.isArray(value)) return [];

  return value.flatMap((entry) => {
    if (!entry || typeof entry !== 'object') return [];
    const record = entry as Record<string, unknown>;
    const productStableId =
      typeof record.productStableId === 'string'
        ? record.productStableId.trim()
        : '';
    const quantityPerParent =
      typeof record.quantityPerParent === 'number' &&
      Number.isFinite(record.quantityPerParent)
        ? Math.max(1, Math.trunc(record.quantityPerParent))
        : 0;
    const source = record.source;
    if (
      !productStableId ||
      quantityPerParent < 1 ||
      (source !== 'FIXED' && source !== 'OPTION')
    ) {
      return [];
    }

    return [
      {
        productStableId,
        nameEn: typeof record.nameEn === 'string' ? record.nameEn : null,
        nameZh: typeof record.nameZh === 'string' ? record.nameZh : null,
        quantityPerParent,
        source,
        sourceOptionStableId:
          typeof record.sourceOptionStableId === 'string'
            ? record.sourceOptionStableId
            : null,
        options: Array.isArray(record.options)
          ? (record.options as OrderItemOptionsSnapshot)
          : [],
      } satisfies OrderItemComponentSnapshot,
    ];
  });
}
