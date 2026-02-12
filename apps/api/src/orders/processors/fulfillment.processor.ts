import { DeliveryProvider, FulfillmentType, Prisma } from '@prisma/client';
import {
  Injectable,
  Logger,
  OnModuleDestroy,
  OnModuleInit,
} from '@nestjs/common';
import { OrderEventsBus } from '../../messaging/order-events.bus';
import { PrismaService } from '../../prisma/prisma.service';
import {
  UberDirectDropoffDetails,
  UberDirectService,
} from '../../deliveries/uber-direct.service';

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
      select: { metadata: true },
    });

    const destination = this.extractDropoff(checkoutIntent?.metadata, order);
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

  private readonly onAccepted = (payload: { orderId: string }) => {
    this.logger.log(
      `[Fulfillment] Order accepted: ${payload.orderId}. (Printing pending Phase 2)`,
    );
  };

  constructor(
    private readonly events: OrderEventsBus,
    private readonly prisma: PrismaService,
    private readonly uberDirect: UberDirectService,
  ) {}

  onModuleInit() {
    this.events.onOrderPaidVerified(this.onPaid);
    this.events.onOrderAccepted(this.onAccepted);
  }

  onModuleDestroy() {
    this.events.offOrderPaidVerified(this.onPaid);
    this.events.offOrderAccepted(this.onAccepted);
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
}
