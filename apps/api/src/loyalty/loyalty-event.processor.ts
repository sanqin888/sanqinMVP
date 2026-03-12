import {
  Injectable,
  Logger,
  OnModuleDestroy,
  OnModuleInit,
} from '@nestjs/common';
import { LoyaltyService } from './loyalty.service';
import { PrismaService } from '../prisma/prisma.service';
import { OrderEventsBus } from '../messaging/order-events.bus';

@Injectable()
export class LoyaltyEventProcessor implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(LoyaltyEventProcessor.name);

  constructor(
    private readonly loyaltyService: LoyaltyService,
    private readonly prisma: PrismaService,
    private readonly orderEventsBus: OrderEventsBus,
  ) {}

  onModuleInit() {
    this.orderEventsBus.onOrderPaidVerified(this.handleOrderPaid);
  }

  onModuleDestroy() {
    this.orderEventsBus.offOrderPaidVerified(this.handleOrderPaid);
  }

  private readonly handleOrderPaid = async (payload: {
    orderId: string;
    userId?: string;
    amountCents?: number;
    redeemValueCents?: number;
    source?: string;
  }) => {
    const { orderId, userId, amountCents, redeemValueCents, source } = payload;

    this.logger.log(`[Loyalty] Processing ORDER_PAID for order=${orderId}`);

    const order = await this.prisma.order.findUnique({
      where: { id: orderId },
      select: {
        id: true,
        userId: true,
        subtotalCents: true,
        couponDiscountCents: true,
        loyaltyRedeemCents: true,
      },
    });

    if (!order) {
      this.logger.warn(`[Loyalty] Order not found: ${orderId}`);
      return;
    }

    const resolvedUserId = userId ?? order.userId ?? undefined;
    if (!resolvedUserId) {
      this.logger.debug(
        `[Loyalty] Skip settle for order=${orderId}: no userId linked`,
      );
      return;
    }

    const subtotalForRewards = Math.max(
      0,
      typeof amountCents === 'number'
        ? Math.round(amountCents)
        : (order.subtotalCents ?? 0) - (order.couponDiscountCents ?? 0),
    );

    const resolvedRedeemValueCents =
      typeof redeemValueCents === 'number'
        ? Math.max(0, Math.round(redeemValueCents))
        : (order.loyaltyRedeemCents ?? 0);

    try {
      await this.loyaltyService.settleOnPaid({
        orderId,
        userId: resolvedUserId,
        subtotalCents: subtotalForRewards,
        redeemValueCents: resolvedRedeemValueCents,
      });

      this.logger.log(
        `[Loyalty] Settled points for order=${orderId}, user=${resolvedUserId}, source=${source ?? 'order-events-bus'}`,
      );
    } catch (error) {
      this.logger.error(
        `[Loyalty] Failed to settle points for order=${orderId}`,
        error instanceof Error ? error.stack : String(error),
      );
    }
  };
}
