import {
  Injectable,
  Logger,
  OnModuleDestroy,
  OnModuleInit,
} from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { OrderEventsBus } from '../../messaging/order-events.bus';
import { OrdersService } from '../orders.service';
import { normalizeEmail } from '../../common/utils/email';

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
        userId: true,
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
      await this.ordersService.sendInvoice({
        orderStableId: order.orderStableId,
        email,
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
    private readonly ordersService: OrdersService,
  ) {}

  onModuleInit() {
    this.events.onOrderPaidVerified(this.onPaid);
  }

  onModuleDestroy() {
    this.events.offOrderPaidVerified(this.onPaid);
  }
}
