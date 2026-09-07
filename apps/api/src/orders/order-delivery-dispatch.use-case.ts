import { Inject, Injectable, Logger } from '@nestjs/common';
import { DeliveryProvider, FulfillmentType, Prisma } from '@prisma/client';
import {
  OPERATIONS_ALERT_RECIPIENTS,
  type OperationsAlertRecipientPort,
} from '../auth/public-api';
import {
  UBER_DIRECT_DELIVERY_DISPATCHER,
  type UberDirectDeliveryDispatcherPort,
  type UberDirectDropoffDetails,
} from '../deliveries/public-api';
import {
  DELIVERY_DISPATCH_FAILURE_NOTIFICATION,
  type DeliveryDispatchFailureNotificationPort,
} from '../notifications/public-api';
import { PrismaService } from './orders-prisma';

export type OrderPaidDeliveryDispatchInput = {
  orderId: string;
  pickupTime?: string;
};

@Injectable()
export class OrderDeliveryDispatchUseCase {
  private readonly logger = new Logger('FulfillmentProcessor');

  constructor(
    private readonly prisma: PrismaService,
    @Inject(UBER_DIRECT_DELIVERY_DISPATCHER)
    private readonly uberDirectDispatcher: UberDirectDeliveryDispatcherPort,
    @Inject(OPERATIONS_ALERT_RECIPIENTS)
    private readonly operationsAlertRecipients: OperationsAlertRecipientPort,
    @Inject(DELIVERY_DISPATCH_FAILURE_NOTIFICATION)
    private readonly deliveryDispatchFailureNotification: DeliveryDispatchFailureNotificationPort,
  ) {}

  async handle(payload: OrderPaidDeliveryDispatchInput): Promise<void> {
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

    let providerDeliveryCreated = false;
    try {
      const destination = this.extractDropoff(
        checkoutIntent?.metadataJson ?? null,
        order,
      );
      if (!destination) {
        throw new Error('DELIVERY_DESTINATION_REQUIRED');
      }
      const response = await this.uberDirectDispatcher.createDelivery({
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
      providerDeliveryCreated = true;

      await this.prisma.order.update({
        where: { id: order.id },
        data: { externalDeliveryId: response.deliveryId },
      });

      this.logger.log(`[Fulfillment] Uber dispatched: ${payload.orderId}`);
    } catch (error) {
      const errorMessage =
        error instanceof Error ? error.message : String(error);
      if (providerDeliveryCreated) {
        this.logger.error({
          event: 'uber_direct_delivery_created_persistence_failed',
          orderId: order.id,
          orderStableId: order.orderStableId,
          reason: errorMessage,
        });
        return;
      }
      this.logger.error(
        `[Fulfillment] Uber dispatch failed for ${payload.orderId}: ${errorMessage}`,
      );
      await this.notifyDeliveryDispatchFailure({
        orderStableId: order.orderStableId,
        orderNumber: order.clientRequestId ?? order.orderStableId,
        deliveryProvider: 'Uber Direct',
        errorMessage,
      });
    }
  }

  private async notifyDeliveryDispatchFailure(params: {
    orderStableId: string;
    orderNumber: string;
    deliveryProvider: string;
    errorMessage: string;
  }): Promise<void> {
    try {
      const recipients =
        await this.operationsAlertRecipients.listActiveAdminRecipients();
      if (recipients.length === 0) {
        this.logger.warn({
          event: 'delivery_dispatch_failure_alert_skipped',
          orderStableId: params.orderStableId,
          reason: 'NO_ACTIVE_ADMIN_CONTACT',
        });
        return;
      }

      const publicBaseUrl = (
        process.env.PUBLIC_BASE_URL ?? 'https://sanq.ca'
      ).replace(/\/$/, '');
      const result =
        await this.deliveryDispatchFailureNotification.notifyDeliveryDispatchFailed(
          {
            recipients: recipients.map((recipient) => ({
              userStableId: recipient.userStableId,
              email: recipient.email,
              phone: recipient.phone,
              locale: recipient.language === 'ZH' ? 'zh' : 'en',
            })),
            orderNumber: params.orderNumber,
            deliveryProvider: params.deliveryProvider,
            errorMessage: params.errorMessage
              .replace(/\s+/g, ' ')
              .slice(0, 240),
            orderDetailUrl: `${publicBaseUrl}/zh/order/${params.orderStableId}`,
          },
        );

      if (!result.ok) {
        this.logger.warn({
          event: 'delivery_dispatch_failure_alert_failed',
          orderStableId: params.orderStableId,
          sentCount: result.sentCount ?? 0,
          failedCount: result.failedCount ?? recipients.length,
          reason: result.reason ?? 'DELIVERY_FAILED',
        });
      }
    } catch (alertError) {
      this.logger.error({
        event: 'delivery_dispatch_failure_alert_exception',
        orderStableId: params.orderStableId,
        errorType:
          alertError instanceof Error ? alertError.name : 'UnknownError',
      });
    }
  }

  private extractDropoff(
    metadata: Prisma.JsonValue | null,
    order: { contactPhone: string | null; contactName: string | null },
  ): UberDirectDropoffDetails | null {
    const root = this.asRecord(metadata);
    const customer = this.asRecord(root?.customer);
    const deliveryDestination = this.asRecord(root?.deliveryDestination);
    if (!customer) return null;

    const addressLine1 =
      this.asString(deliveryDestination?.addressLine1) ??
      this.asString(customer.addressLine1);
    const city =
      this.asString(deliveryDestination?.city) ?? this.asString(customer.city);
    const province =
      this.asString(deliveryDestination?.province) ??
      this.asString(customer.province);
    const postalCode =
      this.asString(deliveryDestination?.postalCode) ??
      this.asString(customer.postalCode);
    const phone =
      this.asString(deliveryDestination?.phone) ??
      this.asString(customer.phone) ??
      order.contactPhone;

    if (!phone) {
      throw new Error(
        'DELIVERY_PHONE_REQUIRED: Uber Direct dropoff requires a phone',
      );
    }
    if (!addressLine1 || !city || !province || !postalCode) return null;

    const firstName = this.asString(customer.firstName) ?? '';
    const lastName = this.asString(customer.lastName) ?? '';
    return {
      name:
        [firstName, lastName].filter(Boolean).join(' ') ||
        order.contactName ||
        'Customer',
      phone,
      addressLine1,
      addressLine2:
        this.asString(deliveryDestination?.addressLine2) ??
        this.asString(customer.addressLine2),
      city,
      province,
      postalCode,
      country:
        this.asString(deliveryDestination?.country) ??
        this.asString(customer.country) ??
        'Canada',
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
    return Number.isNaN(parsed.getTime()) ? undefined : parsed;
  }
}
