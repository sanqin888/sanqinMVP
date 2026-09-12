import { Channel, PaymentMethod, type Prisma } from '@prisma/client';

import { buildOrderPricingDisplay } from './order-pricing-display';
import type {
  OrderFinancialChannelV1,
  OrderFinancialDiscountsV1,
  OrderFinancialFactSourceEvidenceV1,
  OrderFinancialFactV1,
  OrderFinancialPaymentMethodV1,
  OrderFinancialPricingEvidenceV1,
} from './order-financial-facts-reader.contract';

export const ORDER_FINANCIAL_SALE_FACT_SOURCE = 'orders.financial';
export const ORDER_FINANCIAL_SALE_FACT_EVENT = 'order.financial_sale.v1';

export const orderFinancialSaleFactIdempotencyKey = (
  orderStableId: string,
): string => `order-financial-sale:${orderStableId}:v1`;

export const ORDER_FINANCIAL_FACT_SELECT = {
  orderStableId: true,
  storeId: true,
  paidAt: true,
  updatedAt: true,
  channel: true,
  paymentMethod: true,
  subtotalCents: true,
  subtotalAfterDiscountCents: true,
  couponDiscountCents: true,
  loyaltyRedeemCents: true,
  taxCents: true,
  deliveryFeeCents: true,
  creditCardSurchargeCents: true,
  totalCents: true,
  paymentTotalCents: true,
  couponTitleSnapshot: true,
  promotionSnapshot: true,
  items: {
    select: {
      id: true,
      productStableId: true,
      displayName: true,
      nameZh: true,
      nameEn: true,
      qty: true,
      unitPriceCents: true,
      baseUnitPriceCents: true,
      optionsUnitPriceCents: true,
      isDailySpecialApplied: true,
      dailySpecialStableId: true,
    },
  },
} satisfies Prisma.OrderSelect;

export type OrderFinancialSnapshot = Prisma.OrderGetPayload<{
  select: typeof ORDER_FINANCIAL_FACT_SELECT;
}>;

type DailySpecialPricingResolution = {
  evidence: OrderFinancialPricingEvidenceV1;
  discountCents: number | null;
  nominalSubtotalCents: number | null;
};

type PersistedOrderFinancialFactV1 = Omit<
  OrderFinancialFactV1,
  'occurredAt' | 'sourceUpdatedAt'
> & {
  occurredAt: string;
  sourceUpdatedAt: string;
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

const asPositiveInteger = (value: unknown): number | null => {
  const parsed = asNonNegativeInteger(value);
  return parsed !== null && parsed > 0 ? parsed : null;
};

const asDate = (value: unknown): Date | null => {
  if (typeof value !== 'string') return null;
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
};

const sumDiscountSource = (
  discounts: ReturnType<typeof buildOrderPricingDisplay>['discounts'],
  source:
    | 'DAILY_SPECIAL'
    | 'COUPON'
    | 'AUTOMATIC_PROMOTION'
    | 'POS_MANUAL_DISCOUNT'
    | 'OTHER',
): number =>
  discounts
    .filter((entry) => entry.source === source)
    .reduce((sum, entry) => sum + entry.discountCents, 0);

const effectiveBaseUnitCents = (
  item: OrderFinancialSnapshot['items'][number],
): number | null => {
  if (
    typeof item.baseUnitPriceCents === 'number' &&
    Number.isSafeInteger(item.baseUnitPriceCents) &&
    item.baseUnitPriceCents >= 0
  ) {
    return item.baseUnitPriceCents;
  }
  if (
    typeof item.unitPriceCents !== 'number' ||
    !Number.isSafeInteger(item.unitPriceCents) ||
    item.unitPriceCents < 0
  ) {
    return null;
  }
  const options =
    typeof item.optionsUnitPriceCents === 'number' &&
    Number.isSafeInteger(item.optionsUnitPriceCents) &&
    item.optionsUnitPriceCents >= 0
      ? item.optionsUnitPriceCents
      : 0;
  return Math.max(0, item.unitPriceCents - options);
};

const resolveDailySpecialPricing = (
  row: OrderFinancialSnapshot,
  pricingDisplay: ReturnType<typeof buildOrderPricingDisplay>,
): DailySpecialPricingResolution => {
  const snapshotDiscountCents = sumDiscountSource(
    pricingDisplay.discounts,
    'DAILY_SPECIAL',
  );
  if (snapshotDiscountCents > 0) {
    return {
      evidence: 'COMPLETE',
      discountCents: snapshotDiscountCents,
      nominalSubtotalCents: row.subtotalCents + snapshotDiscountCents,
    };
  }

  const specialItems = row.items.filter(
    (item) => item.isDailySpecialApplied && item.dailySpecialStableId,
  );
  if (specialItems.length === 0) {
    return {
      evidence: 'COMPLETE',
      discountCents: 0,
      nominalSubtotalCents: row.subtotalCents,
    };
  }

  const snapshot = asRecord(row.promotionSnapshot);
  if (snapshot?.version !== 1 || !Array.isArray(snapshot.adjustments)) {
    return {
      evidence: 'DAILY_SPECIAL_NOMINAL_UNKNOWN',
      discountCents: null,
      nominalSubtotalCents: null,
    };
  }

  const dailyAdjustments = snapshot.adjustments.flatMap((rawAdjustment) => {
    const adjustment = asRecord(rawAdjustment);
    if (!adjustment || adjustment.source !== 'DAILY_SPECIAL') return [];
    const promotionStableId = asNonEmptyString(adjustment.promotionStableId);
    const productStableId = asNonEmptyString(adjustment.productStableId);
    const quantity = asPositiveInteger(adjustment.quantity);
    const originalBaseUnitCents = asNonNegativeInteger(
      adjustment.baseUnitPriceCents,
    );
    const snapshotDetails = asRecord(adjustment.snapshot);
    const overrideBaseUnitCents = asNonNegativeInteger(
      snapshotDetails?.overridePriceCents,
    );
    const recordedDiscountCents = asNonNegativeInteger(
      adjustment.discountCents,
    );
    if (
      !promotionStableId ||
      !productStableId ||
      quantity === null ||
      originalBaseUnitCents === null
    ) {
      return [];
    }
    return [
      {
        promotionStableId,
        productStableId,
        quantity,
        originalBaseUnitCents,
        overrideBaseUnitCents,
        recordedDiscountCents,
      },
    ];
  });

  let reconstructedDiscountCents = 0;
  const processedKeys = new Set<string>();
  for (const item of specialItems) {
    const promotionStableId = item.dailySpecialStableId;
    if (!promotionStableId) continue;
    const key = `${promotionStableId}\u0000${item.productStableId}`;
    if (processedKeys.has(key)) continue;
    processedKeys.add(key);

    const matchingItems = specialItems.filter(
      (candidate) =>
        candidate.dailySpecialStableId === promotionStableId &&
        candidate.productStableId === item.productStableId,
    );
    const matchingAdjustments = dailyAdjustments.filter(
      (adjustment) =>
        adjustment.promotionStableId === promotionStableId &&
        adjustment.productStableId === item.productStableId,
    );
    if (matchingAdjustments.length === 0) {
      return {
        evidence: 'DAILY_SPECIAL_NOMINAL_UNKNOWN',
        discountCents: null,
        nominalSubtotalCents: null,
      };
    }

    const itemQuantity = matchingItems.reduce(
      (sum, candidate) => sum + candidate.qty,
      0,
    );
    const adjustmentQuantity = matchingAdjustments.reduce(
      (sum, adjustment) => sum + adjustment.quantity,
      0,
    );
    if (itemQuantity !== adjustmentQuantity) {
      return {
        evidence: 'DAILY_SPECIAL_NOMINAL_UNKNOWN',
        discountCents: null,
        nominalSubtotalCents: null,
      };
    }

    let persistedEffectiveBaseSubtotal = 0;
    for (const candidate of matchingItems) {
      const baseUnitCents = effectiveBaseUnitCents(candidate);
      if (baseUnitCents === null) {
        return {
          evidence: 'DAILY_SPECIAL_NOMINAL_UNKNOWN',
          discountCents: null,
          nominalSubtotalCents: null,
        };
      }
      persistedEffectiveBaseSubtotal += baseUnitCents * candidate.qty;
    }

    let originalBaseSubtotal = 0;
    let expectedEffectiveBaseSubtotal = 0;
    for (const adjustment of matchingAdjustments) {
      const originalLineSubtotal =
        adjustment.originalBaseUnitCents * adjustment.quantity;
      originalBaseSubtotal += originalLineSubtotal;
      if (
        adjustment.recordedDiscountCents !== null &&
        adjustment.recordedDiscountCents > 0
      ) {
        expectedEffectiveBaseSubtotal += Math.max(
          0,
          originalLineSubtotal - adjustment.recordedDiscountCents,
        );
        continue;
      }
      if (adjustment.overrideBaseUnitCents === null) {
        return {
          evidence: 'DAILY_SPECIAL_NOMINAL_UNKNOWN',
          discountCents: null,
          nominalSubtotalCents: null,
        };
      }
      expectedEffectiveBaseSubtotal +=
        adjustment.overrideBaseUnitCents * adjustment.quantity;
    }

    if (persistedEffectiveBaseSubtotal !== expectedEffectiveBaseSubtotal) {
      return {
        evidence: 'DAILY_SPECIAL_NOMINAL_UNKNOWN',
        discountCents: null,
        nominalSubtotalCents: null,
      };
    }
    reconstructedDiscountCents += Math.max(
      0,
      originalBaseSubtotal - persistedEffectiveBaseSubtotal,
    );
  }

  return {
    evidence: 'COMPLETE',
    discountCents: reconstructedDiscountCents,
    nominalSubtotalCents: row.subtotalCents + reconstructedDiscountCents,
  };
};

const toChannel = (channel: Channel): OrderFinancialChannelV1 => {
  switch (channel) {
    case Channel.web:
      return 'web';
    case Channel.in_store:
      return 'in_store';
    case Channel.ubereats:
      return 'ubereats';
    default:
      throw new Error(
        `Unsupported order financial channel: ${String(channel)}`,
      );
  }
};

const toPaymentMethod = (
  paymentMethod: PaymentMethod,
): OrderFinancialPaymentMethodV1 => {
  switch (paymentMethod) {
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
        `Unsupported order financial payment method: ${String(paymentMethod)}`,
      );
  }
};

export const buildOrderFinancialFactV1 = (
  row: OrderFinancialSnapshot,
  sourceEvidence: OrderFinancialFactSourceEvidenceV1,
): OrderFinancialFactV1 => {
  const pricingDisplay = buildOrderPricingDisplay({
    effectiveSubtotalCents: row.subtotalCents,
    promotionSnapshot: row.promotionSnapshot,
    items: row.items,
    couponTitleSnapshot: row.couponTitleSnapshot,
    couponDiscountCents: row.couponDiscountCents,
    loyaltyRedeemCents: row.loyaltyRedeemCents,
    subtotalAfterDiscountCents: row.subtotalAfterDiscountCents,
  });

  const dailySpecialPricing = resolveDailySpecialPricing(row, pricingDisplay);
  const discounts: OrderFinancialDiscountsV1 = {
    dailySpecialCents: dailySpecialPricing.discountCents,
    couponCents: sumDiscountSource(pricingDisplay.discounts, 'COUPON'),
    automaticPromotionCents: sumDiscountSource(
      pricingDisplay.discounts,
      'AUTOMATIC_PROMOTION',
    ),
    posManualCents: sumDiscountSource(
      pricingDisplay.discounts,
      'POS_MANUAL_DISCOUNT',
    ),
    pointsRedemptionCents: Math.max(0, row.loyaltyRedeemCents),
    unattributedLegacyCents: sumDiscountSource(
      pricingDisplay.discounts,
      'OTHER',
    ),
    totalCents: null,
  };
  if (discounts.dailySpecialCents !== null) {
    discounts.totalCents =
      discounts.dailySpecialCents +
      discounts.couponCents +
      discounts.automaticPromotionCents +
      discounts.posManualCents +
      discounts.pointsRedemptionCents +
      discounts.unattributedLegacyCents;
  }

  return {
    version: 1,
    factStableId: row.orderStableId,
    orderStableId: row.orderStableId,
    storeStableId: row.storeId,
    occurredAt: row.paidAt,
    sourceUpdatedAt: row.updatedAt,
    sourceEvidence,
    channel: toChannel(row.channel),
    paymentMethod: toPaymentMethod(row.paymentMethod),
    itemQuantity: row.items.reduce((sum, item) => sum + item.qty, 0),
    currency: 'CAD',
    pricingEvidence: dailySpecialPricing.evidence,
    nominalSubtotalCents: dailySpecialPricing.nominalSubtotalCents,
    effectiveSubtotalCents: row.subtotalCents,
    discounts,
    subtotalAfterDiscountCents: row.subtotalAfterDiscountCents,
    taxCents: row.taxCents,
    deliveryRevenueCents: row.deliveryFeeCents,
    cardSurchargeCents: row.creditCardSurchargeCents,
    orderTotalCents: row.totalCents,
    paymentTotalCents: row.paymentTotalCents,
  };
};

export const serializeOrderFinancialFactV1 = (
  fact: OrderFinancialFactV1,
): PersistedOrderFinancialFactV1 => ({
  ...fact,
  occurredAt: fact.occurredAt.toISOString(),
  sourceUpdatedAt: fact.sourceUpdatedAt.toISOString(),
});

export const parseOrderFinancialFactV1 = (
  payload: unknown,
): OrderFinancialFactV1 | null => {
  const value = asRecord(payload);
  if (!value || value.version !== 1) return null;
  const occurredAt = asDate(value.occurredAt);
  const sourceUpdatedAt = asDate(value.sourceUpdatedAt);
  const factStableId = asNonEmptyString(value.factStableId);
  const orderStableId = asNonEmptyString(value.orderStableId);
  const storeStableId =
    value.storeStableId === null ? null : asNonEmptyString(value.storeStableId);
  const sourceEvidence = value.sourceEvidence;
  const channel = value.channel;
  const paymentMethod = value.paymentMethod;
  const itemQuantity = asNonNegativeInteger(value.itemQuantity);
  const pricingEvidence = value.pricingEvidence;
  const nominalSubtotalCents = asNullableNonNegativeInteger(
    value.nominalSubtotalCents,
  );
  const effectiveSubtotalCents = asNonNegativeInteger(
    value.effectiveSubtotalCents,
  );
  const subtotalAfterDiscountCents = asNonNegativeInteger(
    value.subtotalAfterDiscountCents,
  );
  const taxCents = asNonNegativeInteger(value.taxCents);
  const deliveryRevenueCents = asNonNegativeInteger(value.deliveryRevenueCents);
  const cardSurchargeCents = asNonNegativeInteger(value.cardSurchargeCents);
  const orderTotalCents = asNonNegativeInteger(value.orderTotalCents);
  const paymentTotalCents = asNonNegativeInteger(value.paymentTotalCents);
  const discountsRaw = asRecord(value.discounts);
  if (
    !occurredAt ||
    !sourceUpdatedAt ||
    !factStableId ||
    !orderStableId ||
    (value.storeStableId !== null && !storeStableId) ||
    sourceEvidence !== 'IMMUTABLE_SALE_SNAPSHOT' ||
    (channel !== 'web' && channel !== 'in_store' && channel !== 'ubereats') ||
    (paymentMethod !== 'CASH' &&
      paymentMethod !== 'CARD' &&
      paymentMethod !== 'WECHAT_ALIPAY' &&
      paymentMethod !== 'STORE_BALANCE' &&
      paymentMethod !== 'UBEREATS') ||
    itemQuantity === null ||
    value.currency !== 'CAD' ||
    (pricingEvidence !== 'COMPLETE' &&
      pricingEvidence !== 'DAILY_SPECIAL_NOMINAL_UNKNOWN') ||
    nominalSubtotalCents === undefined ||
    effectiveSubtotalCents === null ||
    subtotalAfterDiscountCents === null ||
    taxCents === null ||
    deliveryRevenueCents === null ||
    cardSurchargeCents === null ||
    orderTotalCents === null ||
    paymentTotalCents === null ||
    !discountsRaw
  ) {
    return null;
  }

  const dailySpecialCents = asNullableNonNegativeInteger(
    discountsRaw.dailySpecialCents,
  );
  const couponCents = asNonNegativeInteger(discountsRaw.couponCents);
  const automaticPromotionCents = asNonNegativeInteger(
    discountsRaw.automaticPromotionCents,
  );
  const posManualCents = asNonNegativeInteger(discountsRaw.posManualCents);
  const pointsRedemptionCents = asNonNegativeInteger(
    discountsRaw.pointsRedemptionCents,
  );
  const unattributedLegacyCents = asNonNegativeInteger(
    discountsRaw.unattributedLegacyCents,
  );
  const totalDiscountCents = asNullableNonNegativeInteger(
    discountsRaw.totalCents,
  );
  if (
    dailySpecialCents === undefined ||
    couponCents === null ||
    automaticPromotionCents === null ||
    posManualCents === null ||
    pointsRedemptionCents === null ||
    unattributedLegacyCents === null ||
    totalDiscountCents === undefined
  ) {
    return null;
  }

  return {
    version: 1,
    factStableId,
    orderStableId,
    storeStableId,
    occurredAt,
    sourceUpdatedAt,
    sourceEvidence: 'IMMUTABLE_SALE_SNAPSHOT',
    channel,
    paymentMethod,
    itemQuantity,
    currency: 'CAD',
    pricingEvidence,
    nominalSubtotalCents,
    effectiveSubtotalCents,
    discounts: {
      dailySpecialCents,
      couponCents,
      automaticPromotionCents,
      posManualCents,
      pointsRedemptionCents,
      unattributedLegacyCents,
      totalCents: totalDiscountCents,
    },
    subtotalAfterDiscountCents,
    taxCents,
    deliveryRevenueCents,
    cardSurchargeCents,
    orderTotalCents,
    paymentTotalCents,
  };
};

export const appendOrderFinancialSaleFact = async (
  tx: Prisma.TransactionClient,
  snapshot: OrderFinancialSnapshot,
): Promise<void> => {
  const fact = buildOrderFinancialFactV1(snapshot, 'IMMUTABLE_SALE_SNAPSHOT');
  await tx.opsEvent.createMany({
    data: {
      idempotencyKey: orderFinancialSaleFactIdempotencyKey(
        snapshot.orderStableId,
      ),
      eventName: ORDER_FINANCIAL_SALE_FACT_EVENT,
      source: ORDER_FINANCIAL_SALE_FACT_SOURCE,
      payload: serializeOrderFinancialFactV1(fact) as Prisma.InputJsonValue,
      occurredAt: snapshot.paidAt,
    },
    skipDuplicates: true,
  });
};

export const ensureOrderFinancialSaleFact = async (
  tx: Prisma.TransactionClient,
  orderId: string,
): Promise<void> => {
  const snapshot = await tx.order.findUnique({
    where: { id: orderId },
    select: ORDER_FINANCIAL_FACT_SELECT,
  });
  if (!snapshot) throw new Error('Order financial snapshot not found');
  await appendOrderFinancialSaleFact(tx, snapshot);
};
