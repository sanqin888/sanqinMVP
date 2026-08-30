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

export type OrderItemComponentDisplaySnapshot = Omit<
  OrderItemComponentSnapshot,
  'quantityPerParent'
> & {
  quantity: number;
  priceDeltaCents: number;
};

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

export function buildOrderItemParentDisplayOptions(
  optionsValue: unknown,
  components: OrderItemComponentDisplaySnapshot[],
): OrderItemOptionsSnapshot | null {
  if (!Array.isArray(optionsValue)) return null;
  const options = optionsValue as OrderItemOptionsSnapshot;
  if (options.length === 0) return [];
  if (components.length === 0) return options;

  const componentSourceOptionIds = new Set(
    components.flatMap((component) =>
      component.sourceOptionStableId ? [component.sourceOptionStableId] : [],
    ),
  );

  return options
    .filter((group) => {
      const groupKey = group.groupKey?.trim();
      return (
        !groupKey ||
        (!groupKey.includes('__component-') && !groupKey.includes('__option-'))
      );
    })
    .map((group) => ({
      ...group,
      choices: group.choices.filter(
        (choice) => !componentSourceOptionIds.has(choice.stableId),
      ),
    }))
    .filter((group) => group.choices.length > 0);
}

export function buildOrderItemComponentDisplaySnapshots(
  value: unknown,
  parentQuantity: number,
  optionsValue?: unknown,
): OrderItemComponentDisplaySnapshot[] {
  const normalizedParentQuantity = Math.max(1, Math.trunc(parentQuantity || 1));
  const optionPriceByStableId = new Map<string, number>();
  if (Array.isArray(optionsValue)) {
    for (const group of optionsValue as OrderItemOptionsSnapshot) {
      for (const choice of group.choices ?? []) {
        optionPriceByStableId.set(choice.stableId, choice.priceDeltaCents ?? 0);
      }
    }
  }

  return readOrderItemComponentsSnapshot(value).map((component) => {
    const { quantityPerParent, ...rest } = component;
    return {
      ...rest,
      quantity: normalizedParentQuantity * quantityPerParent,
      priceDeltaCents: component.sourceOptionStableId
        ? (optionPriceByStableId.get(component.sourceOptionStableId) ?? 0)
        : 0,
    };
  });
}
