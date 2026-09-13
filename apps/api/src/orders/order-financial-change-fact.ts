import { Channel, PaymentMethod, type Prisma } from '@prisma/client';

import type {
  OrderFinancialChangeActionV1,
  OrderFinancialChangeChannelV1,
  OrderFinancialChangeFactV1,
  OrderFinancialChangeOccurrenceEvidenceV1,
  OrderFinancialChangePaymentMethodV1,
  OrderFinancialChangeSettlementV1,
  OrderFinancialChangeStateV1,
} from './order-financial-change-facts-reader.contract';

export const ORDER_FINANCIAL_CHANGE_FACT_SOURCE = 'orders.financial';
export const ORDER_FINANCIAL_ADJUSTMENT_FACT_EVENT =
  'order.financial_adjustment.v1';
export const ORDER_FINANCIAL_REVERSAL_FACT_EVENT =
  'order.financial_reversal.v1';

export type OrderFinancialChangeSnapshot = {
  orderStableId: string;
  storeId: string | null;
  channel: Channel;
  paymentMethod: PaymentMethod;
  subtotalCents: number;
  subtotalAfterDiscountCents: number;
  taxCents: number;
  deliveryFeeCents: number;
  creditCardSurchargeCents: number;
  totalCents: number;
  paymentTotalCents: number;
  items: Array<{
    qty: number;
    isDailySpecialApplied?: boolean;
  }>;
};

type PersistedOrderFinancialChangeFactV1 = Omit<
  OrderFinancialChangeFactV1,
  'occurredAt'
> & {
  occurredAt: string;
};

const asRecord = (value: unknown): Record<string, unknown> | null =>
  value && typeof value === 'object' && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;

const asNonEmptyString = (value: unknown): string | null => {
  if (typeof value !== 'string') return null;
  const trimmed = value.trim();
  return trimmed ? trimmed : null;
};

const asNonNegativeInteger = (value: unknown): number | null =>
  typeof value === 'number' && Number.isSafeInteger(value) && value >= 0
    ? value
    : null;

const asNullableNonNegativeInteger = (
  value: unknown,
): number | null | undefined =>
  value === null ? null : (asNonNegativeInteger(value) ?? undefined);

const asDate = (value: unknown): Date | null => {
  if (typeof value !== 'string') return null;
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
};

const isPaymentMethod = (
  value: unknown,
): value is OrderFinancialChangePaymentMethodV1 =>
  value === 'CASH' ||
  value === 'CARD' ||
  value === 'WECHAT_ALIPAY' ||
  value === 'STORE_BALANCE' ||
  value === 'UBEREATS';

const isChannel = (value: unknown): value is OrderFinancialChangeChannelV1 =>
  value === 'web' || value === 'in_store' || value === 'ubereats';

const isAction = (value: unknown): value is OrderFinancialChangeActionV1 =>
  value === 'RETENDER' ||
  value === 'VOID_ITEM' ||
  value === 'SWAP_ITEM' ||
  value === 'ADDITIONAL_CHARGE' ||
  value === 'FULL_REFUND' ||
  value === 'EXTERNAL_CANCELLATION';

const isOccurrenceEvidence = (
  value: unknown,
): value is OrderFinancialChangeOccurrenceEvidenceV1 =>
  value === 'ORDER_CONFIRMATION' || value === 'PROVIDER_EVENT';

const isActionValidForKind = (
  kind: unknown,
  action: unknown,
): boolean =>
  kind === 'ADJUSTMENT'
    ? action === 'RETENDER' ||
      action === 'VOID_ITEM' ||
      action === 'SWAP_ITEM' ||
      action === 'ADDITIONAL_CHARGE'
    : kind === 'REVERSAL'
      ? action === 'FULL_REFUND' || action === 'EXTERNAL_CANCELLATION'
      : false;

export const toOrderFinancialChangePaymentMethod = (
  value: PaymentMethod,
): OrderFinancialChangePaymentMethodV1 => {
  switch (value) {
    case PaymentMethod.CASH:
      return 'CASH';
    case PaymentMethod.CARD:
      return 'CARD';
    case PaymentMethod.WECHAT_ALIPAY:
      return 'WECHAT_ALIPAY';
    case PaymentMethod.STORE_BALANCE:
      return 'STORE_BALANCE';
    case PaymentMethod.UBEREATS:
      return 'UBEREATS';
    default:
      throw new Error(
        `Unsupported financial change payment method: ${String(value)}`,
      );
  }
};

export const toOrderFinancialChangeChannel = (
  value: Channel,
): OrderFinancialChangeChannelV1 => {
  switch (value) {
    case Channel.web:
      return 'web';
    case Channel.in_store:
      return 'in_store';
    case Channel.ubereats:
      return 'ubereats';
    default:
      throw new Error(
        `Unsupported financial change channel: ${String(value)}`,
      );
  }
};

const assertMoney = (value: number, field: string): number => {
  if (!Number.isSafeInteger(value) || value < 0) {
    throw new Error(`${field} must be a non-negative safe integer`);
  }
  return value;
};

const assertSameChangeIdentity = (
  before: OrderFinancialChangeSnapshot,
  after: OrderFinancialChangeSnapshot,
): void => {
  if (
    before.orderStableId !== after.orderStableId ||
    before.storeId !== after.storeId ||
    before.channel !== after.channel
  ) {
    throw new Error(
      'financial change before/after snapshots must keep the same order/store/channel identity',
    );
  }
};

export const buildOrderFinancialChangeState = (
  snapshot: OrderFinancialChangeSnapshot,
): OrderFinancialChangeStateV1 => {
  const effectiveSubtotalCents = assertMoney(
    snapshot.subtotalCents,
    'subtotalCents',
  );
  const subtotalAfterDiscountCents = assertMoney(
    snapshot.subtotalAfterDiscountCents,
    'subtotalAfterDiscountCents',
  );
  if (subtotalAfterDiscountCents > effectiveSubtotalCents) {
    throw new Error(
      'subtotalAfterDiscountCents cannot exceed effective subtotal for a financial change fact',
    );
  }
  const hasDailySpecial = snapshot.items.some(
    (item) => item.isDailySpecialApplied === true,
  );
  const itemQuantity = snapshot.items.reduce((sum, item) => {
    if (!Number.isSafeInteger(item.qty) || item.qty < 0) {
      throw new Error('item quantity must be a non-negative safe integer');
    }
    return sum + item.qty;
  }, 0);

  return {
    paymentMethod: toOrderFinancialChangePaymentMethod(snapshot.paymentMethod),
    itemQuantity,
    nominalSubtotalCents: hasDailySpecial ? null : effectiveSubtotalCents,
    effectiveSubtotalCents,
    salesDiscountCents: hasDailySpecial
      ? null
      : effectiveSubtotalCents - subtotalAfterDiscountCents,
    subtotalAfterDiscountCents,
    taxCents: assertMoney(snapshot.taxCents, 'taxCents'),
    deliveryRevenueCents: assertMoney(
      snapshot.deliveryFeeCents,
      'deliveryFeeCents',
    ),
    cardSurchargeCents: assertMoney(
      snapshot.creditCardSurchargeCents,
      'creditCardSurchargeCents',
    ),
    orderTotalCents: assertMoney(snapshot.totalCents, 'totalCents'),
    paymentTotalCents: assertMoney(
      snapshot.paymentTotalCents,
      'paymentTotalCents',
    ),
  };
};

export const zeroOrderFinancialChangeState = (
  paymentMethod: OrderFinancialChangePaymentMethodV1,
): OrderFinancialChangeStateV1 => ({
  paymentMethod,
  itemQuantity: 0,
  nominalSubtotalCents: 0,
  effectiveSubtotalCents: 0,
  salesDiscountCents: 0,
  subtotalAfterDiscountCents: 0,
  taxCents: 0,
  deliveryRevenueCents: 0,
  cardSurchargeCents: 0,
  orderTotalCents: 0,
  paymentTotalCents: 0,
});

export const buildOrderFinancialChangeSettlement = (params: {
  previousOrderPaymentMethod: PaymentMethod;
  resultingOrderPaymentMethod: PaymentMethod;
  declaredSettlementPaymentMethod: PaymentMethod | null;
  refundGrossCents: number;
  redeemReturnCents: number;
  additionalChargeCents: number;
}): OrderFinancialChangeSettlementV1 => {
  const refundGrossCents = assertMoney(
    params.refundGrossCents,
    'refundGrossCents',
  );
  const redeemReturnCents = assertMoney(
    params.redeemReturnCents,
    'redeemReturnCents',
  );
  const additionalChargeCents = assertMoney(
    params.additionalChargeCents,
    'additionalChargeCents',
  );
  if (redeemReturnCents > refundGrossCents) {
    throw new Error('redeemReturnCents cannot exceed refundGrossCents');
  }
  const tenderRefundCents = refundGrossCents - redeemReturnCents;
  if (
    (tenderRefundCents > 0 || additionalChargeCents > 0) &&
    params.declaredSettlementPaymentMethod === null
  ) {
    throw new Error(
      'non-zero tender settlement requires declaredSettlementPaymentMethod',
    );
  }
  return {
    previousOrderPaymentMethod: toOrderFinancialChangePaymentMethod(
      params.previousOrderPaymentMethod,
    ),
    resultingOrderPaymentMethod: toOrderFinancialChangePaymentMethod(
      params.resultingOrderPaymentMethod,
    ),
    declaredSettlementPaymentMethod:
      params.declaredSettlementPaymentMethod === null
        ? null
        : toOrderFinancialChangePaymentMethod(
            params.declaredSettlementPaymentMethod,
          ),
    refundGrossCents,
    redeemReturnCents,
    additionalChargeCents,
  };
};

export const buildOrderFinancialAdjustmentFact = (params: {
  factStableId: string;
  occurredAt: Date;
  action: 'RETENDER' | 'VOID_ITEM' | 'SWAP_ITEM' | 'ADDITIONAL_CHARGE';
  before: OrderFinancialChangeSnapshot;
  after: OrderFinancialChangeSnapshot;
  declaredPaymentMethod: PaymentMethod | null;
  refundGrossCents: number;
  redeemReturnCents: number;
  additionalChargeCents: number;
}): OrderFinancialChangeFactV1 => {
  assertSameChangeIdentity(params.before, params.after);
  return {
    version: 1,
    factStableId: params.factStableId,
    orderStableId: params.before.orderStableId,
    storeStableId: params.before.storeId,
    occurredAt: params.occurredAt,
    kind: 'ADJUSTMENT',
    action: params.action,
    occurrenceEvidence: 'ORDER_CONFIRMATION',
    channel: toOrderFinancialChangeChannel(params.before.channel),
    currency: 'CAD',
    before: buildOrderFinancialChangeState(params.before),
    after: buildOrderFinancialChangeState(params.after),
    settlement: buildOrderFinancialChangeSettlement({
      previousOrderPaymentMethod: params.before.paymentMethod,
      resultingOrderPaymentMethod: params.after.paymentMethod,
      declaredSettlementPaymentMethod: params.declaredPaymentMethod,
      refundGrossCents: params.refundGrossCents,
      redeemReturnCents: params.redeemReturnCents,
      additionalChargeCents: params.additionalChargeCents,
    }),
  };
};

export const buildOrderFinancialReversalFact = (params: {
  factStableId: string;
  occurredAt: Date;
  action: 'FULL_REFUND' | 'EXTERNAL_CANCELLATION';
  occurrenceEvidence: OrderFinancialChangeOccurrenceEvidenceV1;
  before: OrderFinancialChangeSnapshot;
  declaredPaymentMethod: PaymentMethod;
  refundGrossCents: number;
}): OrderFinancialChangeFactV1 => {
  const before = buildOrderFinancialChangeState(params.before);
  return {
    version: 1,
    factStableId: params.factStableId,
    orderStableId: params.before.orderStableId,
    storeStableId: params.before.storeId,
    occurredAt: params.occurredAt,
    kind: 'REVERSAL',
    action: params.action,
    occurrenceEvidence: params.occurrenceEvidence,
    channel: toOrderFinancialChangeChannel(params.before.channel),
    currency: 'CAD',
    before,
    after: zeroOrderFinancialChangeState(before.paymentMethod),
    settlement: buildOrderFinancialChangeSettlement({
      previousOrderPaymentMethod: params.before.paymentMethod,
      resultingOrderPaymentMethod: params.before.paymentMethod,
      declaredSettlementPaymentMethod: params.declaredPaymentMethod,
      refundGrossCents: params.refundGrossCents,
      redeemReturnCents: 0,
      additionalChargeCents: 0,
    }),
  };
};

export const orderFinancialAdjustmentFactIdempotencyKey = (
  factStableId: string,
): string => `order-financial-adjustment:${factStableId}:v1`;

export const orderFinancialReversalFactIdempotencyKey = (
  factStableId: string,
): string => `order-financial-reversal:${factStableId}:v1`;

export const serializeOrderFinancialChangeFactV1 = (
  fact: OrderFinancialChangeFactV1,
): PersistedOrderFinancialChangeFactV1 => ({
  ...fact,
  occurredAt: fact.occurredAt.toISOString(),
});

const parseState = (value: unknown): OrderFinancialChangeStateV1 | null => {
  const state = asRecord(value);
  if (!state || !isPaymentMethod(state.paymentMethod)) return null;
  const itemQuantity = asNonNegativeInteger(state.itemQuantity);
  const nominalSubtotalCents = asNullableNonNegativeInteger(
    state.nominalSubtotalCents,
  );
  const effectiveSubtotalCents = asNonNegativeInteger(
    state.effectiveSubtotalCents,
  );
  const salesDiscountCents = asNullableNonNegativeInteger(
    state.salesDiscountCents,
  );
  const subtotalAfterDiscountCents = asNonNegativeInteger(
    state.subtotalAfterDiscountCents,
  );
  const taxCents = asNonNegativeInteger(state.taxCents);
  const deliveryRevenueCents = asNonNegativeInteger(
    state.deliveryRevenueCents,
  );
  const cardSurchargeCents = asNonNegativeInteger(state.cardSurchargeCents);
  const orderTotalCents = asNonNegativeInteger(state.orderTotalCents);
  const paymentTotalCents = asNonNegativeInteger(state.paymentTotalCents);
  if (
    itemQuantity === null ||
    nominalSubtotalCents === undefined ||
    effectiveSubtotalCents === null ||
    salesDiscountCents === undefined ||
    subtotalAfterDiscountCents === null ||
    taxCents === null ||
    deliveryRevenueCents === null ||
    cardSurchargeCents === null ||
    orderTotalCents === null ||
    paymentTotalCents === null
  ) {
    return null;
  }
  return {
    paymentMethod: state.paymentMethod,
    itemQuantity,
    nominalSubtotalCents,
    effectiveSubtotalCents,
    salesDiscountCents,
    subtotalAfterDiscountCents,
    taxCents,
    deliveryRevenueCents,
    cardSurchargeCents,
    orderTotalCents,
    paymentTotalCents,
  };
};

const parseSettlement = (
  value: unknown,
): OrderFinancialChangeSettlementV1 | null => {
  const settlement = asRecord(value);
  if (
    !settlement ||
    !isPaymentMethod(settlement.previousOrderPaymentMethod) ||
    !isPaymentMethod(settlement.resultingOrderPaymentMethod) ||
    (settlement.declaredSettlementPaymentMethod !== null &&
      !isPaymentMethod(settlement.declaredSettlementPaymentMethod))
  ) {
    return null;
  }
  const refundGrossCents = asNonNegativeInteger(settlement.refundGrossCents);
  const redeemReturnCents = asNonNegativeInteger(settlement.redeemReturnCents);
  const additionalChargeCents = asNonNegativeInteger(
    settlement.additionalChargeCents,
  );
  if (
    refundGrossCents === null ||
    redeemReturnCents === null ||
    redeemReturnCents > refundGrossCents ||
    additionalChargeCents === null
  ) {
    return null;
  }
  const tenderRefundCents = refundGrossCents - redeemReturnCents;
  if (
    (tenderRefundCents > 0 || additionalChargeCents > 0) &&
    settlement.declaredSettlementPaymentMethod === null
  ) {
    return null;
  }
  return {
    previousOrderPaymentMethod: settlement.previousOrderPaymentMethod,
    resultingOrderPaymentMethod: settlement.resultingOrderPaymentMethod,
    declaredSettlementPaymentMethod: settlement.declaredSettlementPaymentMethod,
    refundGrossCents,
    redeemReturnCents,
    additionalChargeCents,
  };
};

export const parseOrderFinancialChangeFactV1 = (
  payload: unknown,
): OrderFinancialChangeFactV1 | null => {
  const value = asRecord(payload);
  if (!value || value.version !== 1) return null;
  const factStableId = asNonEmptyString(value.factStableId);
  const orderStableId = asNonEmptyString(value.orderStableId);
  const storeStableId =
    value.storeStableId === null ? null : asNonEmptyString(value.storeStableId);
  const occurredAt = asDate(value.occurredAt);
  const before = parseState(value.before);
  const after = parseState(value.after);
  const settlement = parseSettlement(value.settlement);
  if (
    !factStableId ||
    !orderStableId ||
    (value.storeStableId !== null && !storeStableId) ||
    !occurredAt ||
    (value.kind !== 'ADJUSTMENT' && value.kind !== 'REVERSAL') ||
    !isAction(value.action) ||
    !isActionValidForKind(value.kind, value.action) ||
    !isOccurrenceEvidence(value.occurrenceEvidence) ||
    !isChannel(value.channel) ||
    value.currency !== 'CAD' ||
    !before ||
    !after ||
    !settlement
  ) {
    return null;
  }
  return {
    version: 1,
    factStableId,
    orderStableId,
    storeStableId,
    occurredAt,
    kind: value.kind,
    action: value.action,
    occurrenceEvidence: value.occurrenceEvidence,
    channel: value.channel,
    currency: 'CAD',
    before,
    after,
    settlement,
  };
};

export const appendOrderFinancialChangeFact = async (
  tx: Prisma.TransactionClient,
  fact: OrderFinancialChangeFactV1,
): Promise<void> => {
  const eventName =
    fact.kind === 'ADJUSTMENT'
      ? ORDER_FINANCIAL_ADJUSTMENT_FACT_EVENT
      : ORDER_FINANCIAL_REVERSAL_FACT_EVENT;
  const idempotencyKey =
    fact.kind === 'ADJUSTMENT'
      ? orderFinancialAdjustmentFactIdempotencyKey(fact.factStableId)
      : orderFinancialReversalFactIdempotencyKey(fact.factStableId);
  await tx.opsEvent.createMany({
    data: {
      idempotencyKey,
      eventName,
      source: ORDER_FINANCIAL_CHANGE_FACT_SOURCE,
      payload: serializeOrderFinancialChangeFactV1(fact) as Prisma.InputJsonValue,
      occurredAt: fact.occurredAt,
    },
    skipDuplicates: true,
  });
};
