import { BadRequestException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import type { OrderDto, OrderItemDto } from './dto/order.dto';
import {
  buildOrderItemComponentDisplaySnapshots,
  buildOrderItemParentDisplayOptions,
} from './order-item-components';
import { buildOrderPricingDisplay } from './order-pricing-display';

export type OrderWithItems = Prisma.OrderGetPayload<{
  include: { items: true };
}>;

type OrderItemSnapshot = Prisma.OrderItemGetPayload<{
  select: {
    productStableId: true;
    qty: true;
    displayName: true;
    nameEn: true;
    nameZh: true;
    unitPriceCents: true;
    externalSpecialInstructions: true;
    optionsJson: true;
    componentsJson: true;
  };
}>;

export const orderDetailSelect = {
  orderStableId: true,
  clientRequestId: true,
  status: true,
  channel: true,
  fulfillmentType: true,
  paymentMethod: true,
  pickupCode: true,
  externalOrderNotes: true,
  contactName: true,
  contactEmail: true,
  contactPhone: true,
  deliveryType: true,
  deliveryProvider: true,
  deliveryEtaMinMinutes: true,
  deliveryEtaMaxMinutes: true,
  subtotalCents: true,
  taxCents: true,
  deliveryFeeCents: true,
  deliveryCostCents: true,
  deliverySubsidyCents: true,
  totalCents: true,
  paymentTotalCents: true,
  creditCardSurchargeCents: true,
  couponCodeSnapshot: true,
  couponTitleSnapshot: true,
  couponDiscountCents: true,
  loyaltyRedeemCents: true,
  subtotalAfterDiscountCents: true,
  promotionSnapshot: true,
  createdAt: true,
  paidAt: true,
  userStableId: true,
  items: {
    select: {
      productStableId: true,
      qty: true,
      displayName: true,
      nameEn: true,
      nameZh: true,
      unitPriceCents: true,
      externalSpecialInstructions: true,
      optionsJson: true,
      componentsJson: true,
    },
  },
} satisfies Prisma.OrderSelect;

export type OrderDetail = Prisma.OrderGetPayload<{
  select: typeof orderDetailSelect;
}>;

export function buildTrustedStoreOrderWhere(
  storeStableId: string,
): Prisma.OrderWhereInput {
  const normalizedStoreStableId = storeStableId.trim();
  if (!normalizedStoreStableId) {
    throw new BadRequestException('storeStableId is required');
  }

  return { storeId: normalizedStoreStableId };
}

export function toOrderDto(order: OrderWithItems | OrderDetail): OrderDto {
  const orderStableId = order.orderStableId;
  const deliveryFeeCents = order.deliveryFeeCents ?? 0;
  const deliveryCostCents = order.deliveryCostCents ?? 0;

  if (!orderStableId) {
    throw new BadRequestException('orderStableId missing');
  }

  const orderNumber = order.clientRequestId ?? orderStableId;
  const deliverySubsidyCentsRaw = order.deliverySubsidyCents;
  const deliverySubsidyCents =
    typeof deliverySubsidyCentsRaw === 'number' &&
    Number.isFinite(deliverySubsidyCentsRaw)
      ? Math.max(0, Math.round(deliverySubsidyCentsRaw))
      : Math.max(0, deliveryCostCents - deliveryFeeCents);

  const rawItems: OrderItemSnapshot[] = Array.isArray(order.items)
    ? (order.items as OrderItemSnapshot[])
    : [];
  const items: OrderItemDto[] = rawItems.map((it) => {
    const components = buildOrderItemComponentDisplaySnapshots(
      it.componentsJson,
      it.qty,
      it.optionsJson,
    );
    return {
      productStableId: it.productStableId,
      qty: it.qty,
      displayName:
        it.displayName || it.nameEn || it.nameZh || it.productStableId,
      nameEn: it.nameEn ?? null,
      nameZh: it.nameZh ?? null,
      unitPriceCents: it.unitPriceCents ?? 0,
      specialInstructions: it.externalSpecialInstructions?.trim() || null,
      optionsJson: it.optionsJson ?? undefined,
      componentsJson: it.componentsJson ?? undefined,
      ...(components.length > 0
        ? {
            displayOptions: buildOrderItemParentDisplayOptions(
              it.optionsJson,
              components,
            ),
            components,
          }
        : {}),
    };
  });
  const subtotalCents = order.subtotalCents ?? 0;
  const loyaltyRedeemCents = order.loyaltyRedeemCents ?? 0;
  const subtotalAfterDiscountCents =
    order.subtotalAfterDiscountCents ??
    Math.max(
      0,
      subtotalCents - (order.couponDiscountCents ?? 0) - loyaltyRedeemCents,
    );
  const pricingDisplay = buildOrderPricingDisplay({
    effectiveSubtotalCents: subtotalCents,
    promotionSnapshot: order.promotionSnapshot,
    items: rawItems,
    couponTitleSnapshot: order.couponTitleSnapshot ?? null,
    couponDiscountCents: order.couponDiscountCents ?? 0,
    loyaltyRedeemCents,
    subtotalAfterDiscountCents,
  });
  const creditCardSurchargeCents = Math.max(
    0,
    order.creditCardSurchargeCents ?? 0,
  );
  const paymentTotalCents =
    typeof order.paymentTotalCents === 'number' &&
    Number.isFinite(order.paymentTotalCents) &&
    order.paymentTotalCents > 0
      ? Math.round(order.paymentTotalCents)
      : (order.totalCents ?? 0) + creditCardSurchargeCents;

  return {
    orderStableId,
    orderNumber,
    clientRequestId: order.clientRequestId ?? null,
    status: order.status,
    channel: order.channel,
    fulfillmentType: order.fulfillmentType,
    paymentMethod: order.paymentMethod ?? null,
    pickupCode: order.pickupCode ?? null,
    orderNotes: order.externalOrderNotes?.trim() || null,
    contactName: order.contactName ?? null,
    contactEmail: order.contactEmail ?? null,
    contactPhone: order.contactPhone ?? null,
    deliveryType: order.deliveryType ?? null,
    deliveryProvider: order.deliveryProvider ?? null,
    deliveryEtaMinMinutes: order.deliveryEtaMinMinutes ?? null,
    deliveryEtaMaxMinutes: order.deliveryEtaMaxMinutes ?? null,
    subtotalCents,
    displaySubtotalCents: pricingDisplay.displaySubtotalCents,
    appliedDiscounts: pricingDisplay.discounts,
    subtotalAfterDiscountCents,
    taxCents: order.taxCents ?? 0,
    deliveryFeeCents: order.deliveryFeeCents ?? 0,
    deliveryCostCents,
    deliverySubsidyCents,
    totalCents: order.totalCents ?? 0,
    paymentTotalCents,
    creditCardSurchargeCents,
    couponCodeSnapshot: order.couponCodeSnapshot ?? null,
    couponTitleSnapshot: order.couponTitleSnapshot ?? null,
    couponDiscountCents: order.couponDiscountCents ?? 0,
    loyaltyRedeemCents: order.loyaltyRedeemCents ?? 0,
    createdAt: order.createdAt.toISOString(),
    paidAt: order.paidAt ? order.paidAt.toISOString() : null,
    items,
  };
}
