import { Inject, Injectable, Logger } from '@nestjs/common';
import { Channel, FulfillmentType } from '@prisma/client';

import {
  CUSTOMER_ORDER_CONTEXT_READER,
  type CustomerOrderContextReaderPort,
} from '../membership/public-api';
import {
  ORDER_READY_NOTIFICATION,
  type OrderReadyNotificationPort,
  type OrderReadyNotificationResult,
} from '../notifications/public-api';
import { normalizeOrderEmail } from './order-contact-normalization';
import { PrismaService } from './orders-prisma';

type OrderReadyNotificationOrder = {
  id: string;
  orderStableId: string | null;
  clientRequestId: string | null;
  contactEmail: string | null;
  contactPhone: string | null;
  contactName: string | null;
  userStableId: string | null;
  fulfillmentType: FulfillmentType;
  channel: Channel;
};

@Injectable()
export class OrderReadyNotificationUseCase {
  private readonly logger = new Logger('OrdersService');

  constructor(
    private readonly prisma: PrismaService,
    @Inject(CUSTOMER_ORDER_CONTEXT_READER)
    private readonly customerOrderContext: CustomerOrderContextReaderPort,
    @Inject(ORDER_READY_NOTIFICATION)
    private readonly orderReadyNotification: OrderReadyNotificationPort,
  ) {}

  handle(order: OrderReadyNotificationOrder): Promise<void> {
    return this.notifyOrderReady(order)
      .then((result) => {
        this.logOrderReadyNotificationResult(order, result);
      })
      .catch((error: unknown) => {
        this.logOrderReadyNotificationResult(order, {
          ok: false,
          finalChannel: null,
          attemptedChannels: [],
          reason: this.sanitizeNotificationFailure(error),
        });
      });
  }

  private async notifyOrderReady(
    order: OrderReadyNotificationOrder,
  ): Promise<OrderReadyNotificationResult> {
    if (order.fulfillmentType === FulfillmentType.delivery) {
      return {
        ok: false,
        finalChannel: null,
        attemptedChannels: [],
        reason: 'delivery_order',
      };
    }

    const orderNumber = order.clientRequestId ?? order.orderStableId;
    if (!orderNumber) {
      return {
        ok: false,
        finalChannel: null,
        attemptedChannels: [],
        reason: 'missing_order_number',
      };
    }

    const member = order.userStableId
      ? await this.customerOrderContext.getOrderCustomerContext(
          order.userStableId,
        )
      : null;
    const locale = await this.resolveOrderReadyLocale(
      order,
      member?.language ?? null,
    );
    const checkoutIntent = await this.prisma.checkoutIntent.findFirst({
      where: { orderId: order.id },
      orderBy: { createdAt: 'desc' },
      select: { metadataJson: true },
    });
    const metadata = this.asRecord(checkoutIntent?.metadataJson);
    const verifiedContacts = this.asRecord(metadata?.verifiedContacts);
    const verifiedEmail = normalizeOrderEmail(
      typeof verifiedContacts?.email === 'string'
        ? verifiedContacts.email
        : null,
    );
    const verifiedPhone =
      typeof verifiedContacts?.phone === 'string'
        ? verifiedContacts.phone.trim() || null
        : null;

    const memberEmail = member?.verifiedEmail ?? null;
    const memberPhone = member?.verifiedPhone ?? null;

    const allowExternalContacts = order.channel === Channel.ubereats;
    const email =
      verifiedEmail ??
      memberEmail ??
      (allowExternalContacts ? normalizeOrderEmail(order.contactEmail) : null);
    const phone =
      verifiedPhone ??
      memberPhone ??
      (allowExternalContacts ? order.contactPhone?.trim() || null : null);

    if (!email && !phone) {
      return {
        ok: false,
        finalChannel: null,
        attemptedChannels: [],
        reason: 'no_trusted_contact',
      };
    }

    return this.orderReadyNotification.notifyOrderReady({
      email,
      phone,
      orderNumber,
      name: order.contactName ?? null,
      locale,
      userStableId: order.userStableId ?? null,
    });
  }

  private async resolveOrderReadyLocale(
    order: Pick<OrderReadyNotificationOrder, 'id'>,
    memberLanguage: 'ZH' | 'EN' | null,
  ): Promise<'zh' | 'en'> {
    if (memberLanguage === 'ZH') {
      return 'zh';
    }

    if (memberLanguage === 'EN') {
      return 'en';
    }

    const checkoutIntent = await this.prisma.checkoutIntent.findFirst({
      where: {
        orderId: order.id,
        locale: { not: null },
      },
      select: { locale: true },
      orderBy: { createdAt: 'desc' },
    });

    if (checkoutIntent?.locale?.toLowerCase().startsWith('zh')) {
      return 'zh';
    }

    return 'en';
  }

  private logOrderReadyNotificationResult(
    order: Pick<OrderReadyNotificationOrder, 'id' | 'orderStableId'>,
    result: OrderReadyNotificationResult,
  ): void {
    const failureReason =
      result.reason ?? result.error ?? result.fallbackReason;
    const fields = {
      event: 'order_ready_notification_completed',
      orderId: order.id,
      orderStableId: order.orderStableId ?? null,
      finalChannel: result.finalChannel,
      attemptedChannels: [...result.attemptedChannels],
      ok: result.ok,
      ...(failureReason
        ? {
            failureReason: this.sanitizeNotificationFailure(failureReason),
          }
        : {}),
    };

    if (result.ok) this.logger.log(fields);
    else this.logger.warn(fields);
  }

  private sanitizeNotificationFailure(reason: unknown): string {
    const raw =
      reason instanceof Error
        ? reason.message
        : typeof reason === 'string'
          ? reason
          : 'notification_failed';

    return raw
      .replace(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/gi, '[redacted-email]')
      .replace(/(?:\+?\d[\d\s().-]{7,}\d)/g, '[redacted-phone]')
      .replace(/\s+/g, ' ')
      .slice(0, 200);
  }

  private asRecord(value: unknown): Record<string, unknown> | undefined {
    return value && typeof value === 'object' && !Array.isArray(value)
      ? (value as Record<string, unknown>)
      : undefined;
  }
}
