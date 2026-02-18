import { Channel, PaymentMethod, Prisma } from '@prisma/client';
import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import type { PrintPosPayloadDto } from '../pos/dto/print-pos-payload.dto';
import { OrderItemOptionsSnapshot } from './order-item-options';

type OrderWithItems = Prisma.OrderGetPayload<{ include: { items: true } }>;

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
    const surcharge = await this.getOrderCreditCardSurcharge(order);
    const creditCardSurchargeCents = surcharge?.cents ?? 0;

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
      snapshot: {
        items,
        subtotalCents: order.subtotalCents ?? 0,
        taxCents: order.taxCents ?? 0,
        totalCents: (order.totalCents ?? 0) + creditCardSurchargeCents,
        creditCardSurchargeCents,
        discountCents,
        deliveryFeeCents,
        deliveryCostCents,
        deliverySubsidyCents,
      },
    };
  }

  private async getOrderCreditCardSurcharge(order: {
    clientRequestId?: string | null;
    paymentMethod?: PaymentMethod | null;
  }): Promise<{ cents: number } | null> {
    if (!order.clientRequestId) {
      return null;
    }

    const intent = await this.prisma.checkoutIntent.findFirst({
      where: { referenceId: order.clientRequestId },
      orderBy: { createdAt: 'desc' },
      select: { metadataJson: true },
    });

    const metadata =
      intent?.metadataJson && typeof intent.metadataJson === 'object'
        ? (intent.metadataJson as Record<string, unknown>)
        : null;

    const raw = metadata?.creditCardSurchargeCents;
    const cents =
      typeof raw === 'number' && Number.isFinite(raw)
        ? Math.max(0, Math.round(raw))
        : 0;

    return cents > 0 ? { cents } : null;
  }
}
