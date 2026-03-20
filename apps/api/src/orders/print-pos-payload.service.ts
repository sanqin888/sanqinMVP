import { Channel, PaymentMethod, Prisma } from '@prisma/client';
import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import type { PrintPosPayloadDto } from '../pos/dto/print-pos-payload.dto';
import { OrderItemOptionsSnapshot } from './order-item-options';

type OrderWithItems = Prisma.OrderGetPayload<{ include: { items: true } }>;

type CheckoutMetadataRecord = Record<string, unknown>;

@Injectable()
export class PrintPosPayloadService {
  constructor(private readonly prisma: PrismaService) {}

  async getByStableId(
    orderStableId: string,
    locale?: string,
  ): Promise<PrintPosPayloadDto> {
    const order = (await this.prisma.order.findUnique({
      where: { orderStableId: orderStableId.trim() },
      include: { items: true },
    })) as OrderWithItems | null;

    if (!order) throw new NotFoundException('order not found');

    const orderNumber = order.clientRequestId ?? order.orderStableId;
    const deliveryFeeCents = order.deliveryFeeCents ?? 0;
    const deliveryCostCents = order.deliveryCostCents ?? 0;
    const deliverySubsidyCentsRaw = order.deliverySubsidyCents;
    const deliverySubsidyCents =
      typeof deliverySubsidyCentsRaw === 'number' &&
      Number.isFinite(deliverySubsidyCentsRaw)
        ? Math.max(0, Math.round(deliverySubsidyCentsRaw))
        : Math.max(0, deliveryCostCents - deliveryFeeCents);

    const items = order.items.map((item) => {
      const options = Array.isArray(item.optionsJson)
        ? (item.optionsJson as OrderItemOptionsSnapshot)
        : null;
      const unitPriceCents = item.unitPriceCents ?? 0;

      return {
        productStableId: item.productStableId,
        nameZh: item.nameZh ?? null,
        nameEn: item.nameEn ?? null,
        displayName: item.displayName ?? null,
        quantity: item.qty,
        lineTotalCents: unitPriceCents * item.qty,
        options,
      };
    });

    const discountCents = Math.max(
      0,
      (order.subtotalCents ?? 0) -
        (order.subtotalAfterDiscountCents ?? order.subtotalCents ?? 0),
    );
    const intentMetadata = await this.getCheckoutIntentMetadata(orderNumber);
    const surcharge = this.getOrderCreditCardSurcharge(order, intentMetadata);
    const creditCardSurchargeCents = surcharge?.cents ?? 0;
    const paymentTotalCents =
      typeof order.paymentTotalCents === 'number' &&
      Number.isFinite(order.paymentTotalCents) &&
      order.paymentTotalCents > 0
        ? Math.round(order.paymentTotalCents)
        : (order.totalCents ?? 0) + creditCardSurchargeCents;

    const paymentMethod = (() => {
      switch (order.paymentMethod) {
        case PaymentMethod.CASH:
          return 'cash';
        case PaymentMethod.CARD:
          return 'card';
        case PaymentMethod.WECHAT_ALIPAY:
          return 'wechat_alipay';
        case PaymentMethod.STORE_BALANCE:
          return 'store_balance';
        case PaymentMethod.UBEREATS:
          return 'ubereats';
        default:
          return order.channel === Channel.in_store ? 'cash' : 'card';
      }
    })();

    return {
      locale: locale ?? 'zh',
      orderNumber,
      pickupCode: order.pickupCode ?? null,
      fulfillment: order.fulfillmentType,
      paymentMethod,
      orderNotes: this.extractOrderNotes(intentMetadata),
      utensils: this.extractUtensils(intentMetadata),
      snapshot: {
        items,
        subtotalCents: order.subtotalCents ?? 0,
        taxCents: order.taxCents ?? 0,
        totalCents: paymentTotalCents,
        creditCardSurchargeCents,
        discountCents,
        deliveryFeeCents,
        deliveryCostCents,
        deliverySubsidyCents,
      },
    };
  }

  private async getCheckoutIntentMetadata(
    referenceId: string,
  ): Promise<CheckoutMetadataRecord | null> {
    const intent = await this.prisma.checkoutIntent.findFirst({
      where: { referenceId },
      orderBy: { createdAt: 'desc' },
      select: { metadataJson: true },
    });

    return intent?.metadataJson && typeof intent.metadataJson === 'object'
      ? (intent.metadataJson as CheckoutMetadataRecord)
      : null;
  }

  private getOrderCreditCardSurcharge(
    order: {
      paymentMethod?: PaymentMethod | null;
      creditCardSurchargeCents?: number | null;
    },
    metadata: CheckoutMetadataRecord | null,
  ): { cents: number } | null {
    const persistedSurcharge =
      typeof order.creditCardSurchargeCents === 'number' &&
      Number.isFinite(order.creditCardSurchargeCents)
        ? Math.max(0, Math.round(order.creditCardSurchargeCents))
        : 0;

    const raw = metadata?.creditCardSurchargeCents;
    const cents =
      typeof raw === 'number' && Number.isFinite(raw)
        ? Math.max(0, Math.round(raw))
        : 0;

    const finalCents = cents > 0 ? cents : persistedSurcharge;
    return finalCents > 0 ? { cents: finalCents } : null;
  }

  private extractOrderNotes(
    metadata: CheckoutMetadataRecord | null,
  ): string | null {
    const customer = this.asRecord(metadata?.customer);
    const deliveryDestination = this.asRecord(metadata?.deliveryDestination);

    return (
      this.asString(customer?.notes) ??
      this.asString(deliveryDestination?.instructions) ??
      this.asString(deliveryDestination?.notes) ??
      null
    );
  }

  private extractUtensils(
    metadata: CheckoutMetadataRecord | null,
  ): PrintPosPayloadDto['utensils'] {
    const utensils = this.asRecord(metadata?.utensils);
    if (!utensils) return null;

    const neededRaw = utensils.needed;
    const needed =
      typeof neededRaw === 'boolean'
        ? neededRaw
        : typeof neededRaw === 'number'
          ? neededRaw > 0
          : this.asString(neededRaw)?.toLowerCase() === 'true';

    const type = this.asString(utensils.type) ?? null;
    const quantity = this.asFiniteInteger(utensils.quantity);

    const summary = needed
      ? this.buildUtensilsSummary(type, quantity)
      : '无需餐具';

    return {
      needed,
      type,
      quantity,
      summary,
    };
  }

  private buildUtensilsSummary(
    type: string | null,
    quantity: number | null,
  ): string {
    const typeLabel =
      type === 'chopsticks' ? '筷子' : type === 'fork' ? '叉子' : '餐具';

    if (quantity && quantity > 0) {
      return `${typeLabel}${quantity}份`;
    }

    return `需要${typeLabel}`;
  }

  private asRecord(value: unknown): Record<string, unknown> | null {
    return value && typeof value === 'object' && !Array.isArray(value)
      ? (value as Record<string, unknown>)
      : null;
  }

  private asString(value: unknown): string | null {
    if (typeof value !== 'string') return null;
    const trimmed = value.trim();
    return trimmed.length > 0 ? trimmed : null;
  }

  private asFiniteInteger(value: unknown): number | null {
    if (typeof value === 'number' && Number.isFinite(value)) {
      return Math.max(0, Math.round(value));
    }
    if (typeof value === 'string' && value.trim().length > 0) {
      const parsed = Number(value);
      if (Number.isFinite(parsed)) {
        return Math.max(0, Math.round(parsed));
      }
    }
    return null;
  }
}
