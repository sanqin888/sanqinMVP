import {
  Channel,
  DeliveryProvider,
  FulfillmentType,
  PaymentMethod,
  Prisma,
} from '@prisma/client';
import {
  Injectable,
  Logger,
  OnModuleDestroy,
  OnModuleInit,
} from '@nestjs/common';
import { OnEvent } from '@nestjs/event-emitter';
import { OrderEventsBus } from '../../messaging/order-events.bus';
import { PosGateway } from '../../pos/pos.gateway';
import { PrismaService } from '../../prisma/prisma.service';
import {
  UberDirectDropoffDetails,
  UberDirectService,
} from '../../deliveries/uber-direct.service';
import type { PrintPosPayloadDto } from '../../pos/dto/print-pos-payload.dto';
import type { OrderItemOptionsSnapshot } from '../order-item-options';
import { PrintPosPayloadService } from '../print-pos-payload.service';

@Injectable()
export class FulfillmentProcessor implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(FulfillmentProcessor.name);

  private readonly onPaid = async (payload: {
    orderId: string;
    pickupTime?: string;
  }) => {
    const order = await this.prisma.order.findUnique({
      where: { id: payload.orderId },
      include: { items: true },
    });

    if (!order) {
      this.logger.warn(`[Fulfillment] Order not found: ${payload.orderId}`);
      return;
    }

    if (
      order.fulfillmentType !== FulfillmentType.delivery ||
      order.deliveryProvider !== DeliveryProvider.UBER
    ) {
      return;
    }

    if (order.externalDeliveryId) {
      this.logger.log(
        `[Fulfillment] Skip Uber dispatch, already dispatched: ${payload.orderId}`,
      );
      return;
    }

    const checkoutIntent = await this.prisma.checkoutIntent.findFirst({
      where: { orderId: order.id },
      orderBy: { createdAt: 'desc' },
      select: { metadataJson: true },
    });

    const destination = this.extractDropoff(
      checkoutIntent?.metadataJson ?? null,
      order,
    );
    if (!destination) {
      this.logger.warn(
        `[Fulfillment] Skip Uber dispatch, missing dropoff: ${payload.orderId}`,
      );
      return;
    }

    try {
      const response = await this.uberDirect.createDelivery({
        orderRef: order.clientRequestId ?? order.orderStableId,
        pickupCode: order.pickupCode ?? undefined,
        reference: order.clientRequestId ?? order.orderStableId,
        totalCents: order.totalCents ?? 0,
        items: order.items.map((item) => ({
          name: item.displayName || item.productStableId,
          quantity: item.qty,
          priceCents: item.unitPriceCents ?? undefined,
        })),
        destination,
        pickupReadyAt: this.parsePickupTime(payload.pickupTime),
      });

      await this.prisma.order.update({
        where: { id: order.id },
        data: { externalDeliveryId: response.deliveryId },
      });

      this.logger.log(`[Fulfillment] Uber dispatched: ${payload.orderId}`);
    } catch (error) {
      this.logger.error(
        `[Fulfillment] Uber dispatch failed for ${payload.orderId}: ${
          error instanceof Error ? error.message : String(error)
        }`,
      );
    }
  };

  private readonly onAccepted = async (payload: { orderId: string }) => {
    this.logger.log(
      `[Fulfillment] Order accepted: ${payload.orderId}. Triggering POS print.`,
    );

    const order = await this.prisma.order.findUnique({
      where: { id: payload.orderId },
      select: {
        orderStableId: true,
        channel: true,
      },
    });

    if (!order) {
      this.logger.warn(`[Fulfillment] Order not found: ${payload.orderId}`);
      return;
    }

    if (order.channel === Channel.in_store) {
      this.logger.log(
        `[Fulfillment] Skip accepted auto print for in_store order: ${payload.orderId}`,
      );
      return;
    }

    const printPayload = await this.printPosPayloadService.getByStableId(
      order.orderStableId,
      'zh',
    );

    const storeId = process.env.STORE_ID || 'default_store';
    this.posGateway.sendPrintJob(storeId, printPayload);
  };

  constructor(
    private readonly events: OrderEventsBus,
    private readonly prisma: PrismaService,
    private readonly uberDirect: UberDirectService,
    private readonly posGateway: PosGateway,
    private readonly printPosPayloadService: PrintPosPayloadService,
  ) {}

  onModuleInit() {
    this.events.onOrderPaidVerified(this.onPaid);
    this.events.onOrderAccepted(this.onAccepted);
  }

  onModuleDestroy() {
    this.events.offOrderPaidVerified(this.onPaid);
    this.events.offOrderAccepted(this.onAccepted);
  }

  @OnEvent('order.reprint')
  async handleOrderReprint(payload: {
    orderStableId: string;
    targets?: { customer?: boolean; kitchen?: boolean };
    cashReceivedCents?: number;
    cashChangeCents?: number;
  }) {
    this.logger.log(
      `[Fulfillment] Order reprint requested: ${payload.orderStableId}. Triggering POS print.`,
    );

    const printPayload = await this.printPosPayloadService.getByStableId(
      payload.orderStableId,
      'zh',
    );

    const storeId = process.env.STORE_ID || 'default_store';
    this.posGateway.sendPrintJob(storeId, {
      ...printPayload,
      ...(payload.targets ? { targets: payload.targets } : {}),
      ...(typeof payload.cashReceivedCents === 'number'
        ? { cashReceivedCents: payload.cashReceivedCents }
        : {}),
      ...(typeof payload.cashChangeCents === 'number'
        ? { cashChangeCents: payload.cashChangeCents }
        : {}),
    });
  }

  private extractDropoff(
    metadata: Prisma.JsonValue | null,
    order: {
      contactPhone: string | null;
      contactName: string | null;
    },
  ): UberDirectDropoffDetails | null {
    const root = this.asRecord(metadata);
    const customer = this.asRecord(root?.customer);
    if (!customer) return null;

    const addressLine1 = this.asString(customer.addressLine1);
    const city = this.asString(customer.city);
    const province = this.asString(customer.province);
    const postalCode = this.asString(customer.postalCode);
    const phone = this.asString(customer.phone) ?? order.contactPhone ?? '';

    if (!addressLine1 || !city || !province || !postalCode || !phone) {
      return null;
    }

    const firstName = this.asString(customer.firstName) ?? '';
    const lastName = this.asString(customer.lastName) ?? '';

    return {
      name:
        [firstName, lastName].filter(Boolean).join(' ') ||
        order.contactName ||
        'Customer',
      phone,
      addressLine1,
      addressLine2: this.asString(customer.addressLine2),
      city,
      province,
      postalCode,
      country: this.asString(customer.country) ?? 'Canada',
      instructions: this.asString(customer.notes),
    };
  }

  private asRecord(value: unknown): Record<string, unknown> | undefined {
    return value && typeof value === 'object' && !Array.isArray(value)
      ? (value as Record<string, unknown>)
      : undefined;
  }

  private asString(value: unknown): string | undefined {
    if (typeof value !== 'string') return undefined;
    const trimmed = value.trim();
    return trimmed.length > 0 ? trimmed : undefined;
  }

  private parsePickupTime(pickupTime?: string): Date | undefined {
    if (!pickupTime) return undefined;
    const parsed = new Date(pickupTime);
    if (Number.isNaN(parsed.getTime())) return undefined;
    return parsed;
  }

  private parseOrderItemOptions(
    optionsJson: Prisma.JsonValue | null,
  ): OrderItemOptionsSnapshot | null {
    return Array.isArray(optionsJson)
      ? (optionsJson as OrderItemOptionsSnapshot)
      : null;
  }

  private toPrintPosPayload(order: {
    orderStableId: string;
    clientRequestId: string | null;
    pickupCode: string | null;
    fulfillmentType: FulfillmentType;
    paymentMethod: PaymentMethod;
    channel: Channel;
    subtotalCents: number | null;
    taxCents: number | null;
    totalCents: number | null;
    subtotalAfterDiscountCents: number | null;
    couponDiscountCents: number | null;
    loyaltyRedeemCents: number | null;
    deliveryFeeCents: number | null;
    deliveryCostCents: number | null;
    deliverySubsidyCents: number | null;
    items: Array<{
      productStableId: string;
      nameZh: string | null;
      nameEn: string | null;
      displayName: string | null;
      qty: number;
      unitPriceCents: number | null;
      optionsJson: Prisma.JsonValue | null;
    }>;
  }): PrintPosPayloadDto {
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

    const deliveryFeeCents = order.deliveryFeeCents ?? 0;
    const deliveryCostCents = order.deliveryCostCents ?? 0;
    const deliverySubsidyCentsRaw = order.deliverySubsidyCents;
    const deliverySubsidyCents =
      typeof deliverySubsidyCentsRaw === 'number' &&
      Number.isFinite(deliverySubsidyCentsRaw)
        ? Math.max(0, Math.round(deliverySubsidyCentsRaw))
        : Math.max(0, deliveryCostCents - deliveryFeeCents);

    return {
      locale: 'zh',
      orderNumber: order.clientRequestId ?? order.orderStableId,
      pickupCode: order.pickupCode,
      fulfillment: order.fulfillmentType,
      paymentMethod,
      snapshot: {
        items: order.items.map((item) => ({
          productStableId: item.productStableId,
          nameZh: item.nameZh,
          nameEn: item.nameEn,
          displayName: item.displayName,
          quantity: item.qty,
          lineTotalCents: (item.unitPriceCents ?? 0) * item.qty,
          options: this.parseOrderItemOptions(item.optionsJson),
        })),
        subtotalCents: order.subtotalCents ?? 0,
        taxCents: order.taxCents ?? 0,
        totalCents: order.totalCents ?? 0,
        creditCardSurchargeCents: 0,
        discountCents: Math.max(
          0,
          (order.subtotalCents ?? 0) -
            (order.subtotalAfterDiscountCents ?? order.subtotalCents ?? 0),
        ),
        deliveryFeeCents,
        deliveryCostCents,
        deliverySubsidyCents,
      },
    };
  }
}
