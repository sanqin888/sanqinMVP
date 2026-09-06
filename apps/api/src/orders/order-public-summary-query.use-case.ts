import {
  BadRequestException,
  Inject,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import type { Prisma } from '@prisma/client';
import {
  LOYALTY_ORDER_USAGE_READER,
  type LoyaltyOrderUsageReaderPort,
} from '../loyalty/public-api';
import type { OrderSummaryDto } from './dto/order-summary.dto';
import type { OrderItemOptionsSnapshot } from './order-item-options';
import {
  buildOrderItemComponentDisplaySnapshots,
  buildOrderItemParentDisplayOptions,
} from './order-item-components';
import { buildOrderPricingDisplay } from './order-pricing-display';
import { PrismaService } from './orders-prisma';

type OrderWithItems = Prisma.OrderGetPayload<{ include: { items: true } }>;

@Injectable()
export class OrderPublicSummaryQueryUseCase {
  constructor(
    private readonly prisma: PrismaService,
    @Inject(LOYALTY_ORDER_USAGE_READER)
    private readonly loyaltyOrderUsageReader: LoyaltyOrderUsageReaderPort,
  ) {}

  async getByStableId(orderStableId: string): Promise<OrderSummaryDto> {
    const value = (orderStableId ?? '').trim();
    if (!value) throw new NotFoundException('order not found');
    if (value.includes('-')) throw new BadRequestException('stableId only');

    const order = (await this.prisma.order.findUnique({
      where: { orderStableId: value },
      include: { items: true },
    })) as OrderWithItems | null;

    if (!order) throw new NotFoundException('order not found');
    if (!order.orderStableId) {
      throw new BadRequestException('orderStableId missing');
    }

    const subtotalCents = order.subtotalCents ?? 0;
    const taxCents = order.taxCents ?? 0;
    const deliveryFeeCents = order.deliveryFeeCents ?? 0;
    const discountCents = this.getTotalDiscountCents(order);
    const paymentMeta = await this.getCheckoutIntentPaymentMeta(order);
    const creditCardSurcharge = this.resolveOrderCreditCardSurcharge(
      order,
      paymentMeta,
    );
    const creditCardSurchargeCents = creditCardSurcharge?.cents ?? 0;
    const paymentTotalCents =
      typeof order.paymentTotalCents === 'number' &&
      Number.isFinite(order.paymentTotalCents) &&
      order.paymentTotalCents > 0
        ? Math.round(order.paymentTotalCents)
        : (order.totalCents ?? 0) + creditCardSurchargeCents;

    let itemCount = 0;
    const lineItems = order.items.map((item) => {
      const optionsSnapshot = Array.isArray(item.optionsJson)
        ? (item.optionsJson as OrderItemOptionsSnapshot)
        : null;

      const unitPriceCents = item.unitPriceCents ?? 0;
      const quantity = item.qty;
      const totalPriceCents = unitPriceCents * quantity;
      itemCount += quantity;

      const display =
        item.displayName || item.nameEn || item.nameZh || item.productStableId;
      const components = buildOrderItemComponentDisplaySnapshots(
        item.componentsJson,
        quantity,
        item.optionsJson,
      );

      return {
        productStableId: item.productStableId,
        name: display,
        nameEn: item.nameEn ?? null,
        nameZh: item.nameZh ?? null,
        quantity,
        unitPriceCents,
        totalPriceCents,
        optionsJson: optionsSnapshot,
        ...(components.length > 0
          ? {
              displayOptions: buildOrderItemParentDisplayOptions(
                item.optionsJson,
                components,
              ),
              components,
            }
          : {}),
      };
    });

    const pricingDisplay = buildOrderPricingDisplay({
      effectiveSubtotalCents: subtotalCents,
      promotionSnapshot: order.promotionSnapshot,
      items: order.items,
      couponTitleSnapshot: order.couponTitleSnapshot ?? null,
      couponDiscountCents: order.couponDiscountCents ?? 0,
      loyaltyRedeemCents: order.loyaltyRedeemCents ?? 0,
      subtotalAfterDiscountCents:
        order.subtotalAfterDiscountCents ?? subtotalCents,
    });
    const loyaltyUsage = await this.loyaltyOrderUsageReader.getOrderUsage({
      orderStableId: order.orderStableId,
    });
    const orderTotalCents = order.totalCents ?? 0;
    const externalPaidCents = Math.max(
      0,
      orderTotalCents - loyaltyUsage.balancePaidCents,
    );
    const orderNumber = order.clientRequestId ?? order.orderStableId;

    return {
      orderStableId: order.orderStableId,
      orderNumber,
      status: order.status,
      createdAt: order.createdAt.toISOString(),
      fulfillmentType: order.fulfillmentType,
      itemCount,
      currency: 'CAD',
      subtotalCents,
      displaySubtotalCents: pricingDisplay.displaySubtotalCents,
      appliedDiscounts: pricingDisplay.discounts,
      taxCents,
      deliveryFeeCents,
      discountCents,
      totalCents: paymentTotalCents,
      orderTotalCents,
      paymentTotalCents,
      externalPaidCents,
      loyaltyRedeemCents: order.loyaltyRedeemCents ?? 0,
      couponDiscountCents: order.couponDiscountCents ?? 0,
      creditCardSurchargeCents,
      creditCardSurchargeRate: creditCardSurcharge?.rate,
      chargeStatusUnverified: paymentMeta?.chargeStatusUnverified === true,
      chargeStatusUnverifiedReason:
        typeof paymentMeta?.chargeStatusUnverifiedReason === 'string'
          ? paymentMeta.chargeStatusUnverifiedReason
          : undefined,
      subtotalAfterDiscountCents:
        order.subtotalAfterDiscountCents ?? subtotalCents,
      ...loyaltyUsage,
      lineItems,
    };
  }

  private getTotalDiscountCents(order: {
    subtotalCents?: number | null;
    subtotalAfterDiscountCents?: number | null;
    couponDiscountCents?: number | null;
    loyaltyRedeemCents?: number | null;
  }): number {
    const subtotalCents = order.subtotalCents ?? 0;
    const subtotalAfterDiscountCents = order.subtotalAfterDiscountCents;
    if (
      typeof subtotalAfterDiscountCents === 'number' &&
      Number.isFinite(subtotalAfterDiscountCents)
    ) {
      return Math.max(0, subtotalCents - subtotalAfterDiscountCents);
    }
    return Math.max(
      0,
      (order.couponDiscountCents ?? 0) + (order.loyaltyRedeemCents ?? 0),
    );
  }

  private async getCheckoutIntentPaymentMeta(order: {
    clientRequestId?: string | null;
  }): Promise<Record<string, unknown> | null> {
    if (!order.clientRequestId) return null;

    const intent = await this.prisma.checkoutIntent.findFirst({
      where: { referenceId: order.clientRequestId },
      orderBy: { createdAt: 'desc' },
      select: { metadataJson: true },
    });

    return intent?.metadataJson && typeof intent.metadataJson === 'object'
      ? (intent.metadataJson as Record<string, unknown>)
      : null;
  }

  private resolveOrderCreditCardSurcharge(
    order: { creditCardSurchargeCents?: number | null },
    metadata: Record<string, unknown> | null,
  ): { cents: number; rate?: number } | null {
    const persistedSurcharge =
      typeof order.creditCardSurchargeCents === 'number' &&
      Number.isFinite(order.creditCardSurchargeCents)
        ? Math.max(0, Math.round(order.creditCardSurchargeCents))
        : 0;

    if (!metadata) {
      return persistedSurcharge > 0 ? { cents: persistedSurcharge } : null;
    }

    const centsRaw = metadata.creditCardSurchargeCents;
    const rateRaw = metadata.creditCardSurchargeRate;
    const cents =
      typeof centsRaw === 'number' && Number.isFinite(centsRaw)
        ? Math.max(0, Math.round(centsRaw))
        : 0;
    const rate =
      typeof rateRaw === 'number' && Number.isFinite(rateRaw) && rateRaw >= 0
        ? Math.round(rateRaw * 10) / 10
        : undefined;

    const finalCents = cents > 0 ? cents : persistedSurcharge;
    if (finalCents <= 0) return null;
    return { cents: finalCents, rate };
  }
}
