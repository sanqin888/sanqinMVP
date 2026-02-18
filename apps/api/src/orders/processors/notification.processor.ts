import {
  Injectable,
  Logger,
  OnModuleDestroy,
  OnModuleInit,
} from '@nestjs/common';
import { Channel, PaymentMethod } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { OrderEventsBus } from '../../messaging/order-events.bus';
import { normalizeEmail } from '../../common/utils/email';
import { EmailService } from '../../email/email.service';
import type { OrderItemOptionsSnapshot } from '../order-item-options';
import type { PrintPosPayloadDto } from '../../pos/dto/print-pos-payload.dto';

@Injectable()
export class NotificationProcessor implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(NotificationProcessor.name);
  private readonly onPaid = async (payload: {
    orderId: string;
    userId?: string;
  }) => {
    const order = await this.prisma.order.findUnique({
      where: { id: payload.orderId },
      select: {
        id: true,
        orderStableId: true,
        clientRequestId: true,
        userId: true,
        paymentMethod: true,
        channel: true,
        fulfillmentType: true,
        pickupCode: true,
        subtotalCents: true,
        taxCents: true,
        totalCents: true,
        subtotalAfterDiscountCents: true,
        couponDiscountCents: true,
        loyaltyRedeemCents: true,
        deliveryFeeCents: true,
        deliveryCostCents: true,
        deliverySubsidyCents: true,
        items: {
          select: {
            productStableId: true,
            nameZh: true,
            nameEn: true,
            displayName: true,
            qty: true,
            unitPriceCents: true,
            optionsJson: true,
          },
        },
      },
    });

    if (!order?.orderStableId) {
      this.logger.warn(`[Notification] Order not found: ${payload.orderId}`);
      return;
    }

    const userEmail = order.userId
      ? (
          await this.prisma.user.findUnique({
            where: { id: order.userId },
            select: { email: true },
          })
        )?.email
      : undefined;

    const email = normalizeEmail(userEmail);
    if (!email) {
      this.logger.warn(
        `[Notification] Skip email: no user email for order ${payload.orderId}`,
      );
      return;
    }

    try {
      const discountCents = Math.max(
        0,
        (order.subtotalCents ?? 0) -
          (order.subtotalAfterDiscountCents ?? order.subtotalCents ?? 0),
      );
      const orderNumber = order.clientRequestId ?? order.orderStableId;
      const printPayload: PrintPosPayloadDto = {
        locale: 'zh',
        orderNumber,
        pickupCode: order.pickupCode,
        fulfillment: order.fulfillmentType,
        paymentMethod:
          order.paymentMethod === PaymentMethod.CASH
            ? 'cash'
            : order.paymentMethod === PaymentMethod.CARD
              ? 'card'
              : order.paymentMethod === PaymentMethod.WECHAT_ALIPAY
                ? 'wechat_alipay'
                : order.paymentMethod === PaymentMethod.STORE_BALANCE
                  ? 'store_balance'
                  : order.channel === Channel.in_store
                    ? 'cash'
                    : 'card',
        snapshot: {
          items: order.items.map((item) => ({
            productStableId: item.productStableId,
            nameZh: item.nameZh,
            nameEn: item.nameEn,
            displayName: item.displayName,
            quantity: item.qty,
            lineTotalCents: (item.unitPriceCents ?? 0) * item.qty,
            options: Array.isArray(item.optionsJson)
              ? (item.optionsJson as OrderItemOptionsSnapshot)
              : null,
          })),
          subtotalCents: order.subtotalCents ?? 0,
          taxCents: order.taxCents ?? 0,
          totalCents: order.totalCents ?? 0,
          creditCardSurchargeCents: 0,
          discountCents,
          deliveryFeeCents: order.deliveryFeeCents ?? 0,
          deliveryCostCents: order.deliveryCostCents ?? 0,
          deliverySubsidyCents: order.deliverySubsidyCents ?? 0,
        },
      };

      await this.emailService.sendOrderInvoice({
        to: email,
        payload: printPayload,
      });
      this.logger.log(`[Notification] Invoice email sent: ${payload.orderId}`);
    } catch (error) {
      this.logger.error(
        `[Notification] Email failed for ${payload.orderId}: ${
          error instanceof Error ? error.message : String(error)
        }`,
      );
    }
  };

  constructor(
    private readonly events: OrderEventsBus,
    private readonly prisma: PrismaService,
    private readonly emailService: EmailService,
  ) {}

  onModuleInit() {
    this.events.onOrderPaidVerified(this.onPaid);
  }

  onModuleDestroy() {
    this.events.offOrderPaidVerified(this.onPaid);
  }
}
