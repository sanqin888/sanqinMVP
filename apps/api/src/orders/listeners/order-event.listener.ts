import {
  Injectable,
  Logger,
  OnModuleDestroy,
  OnModuleInit,
} from '@nestjs/common';
import {
  OrderEventsBus,
  type OrderPaidVerifiedPayload,
} from '../../messaging/order-events.bus';
import { OrdersService } from '../orders.service';

@Injectable()
export class OrderEventListener implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(OrderEventListener.name);
  private readonly handler = async (payload: OrderPaidVerifiedPayload) => {
    try {
      await this.ordersService.processOrderPaidVerified(payload);
    } catch (error) {
      this.logger.error(
        `Failed to process order.paid.verified for order ${payload.orderId}: ${
          error instanceof Error ? error.message : String(error)
        }`,
      );
    }
  };

  constructor(
    private readonly orderEventsBus: OrderEventsBus,
    private readonly ordersService: OrdersService,
  ) {}

  onModuleInit() {
    this.orderEventsBus.onOrderPaidVerified(this.handler);
  }

  onModuleDestroy() {
    this.orderEventsBus.offOrderPaidVerified(this.handler);
  }
}
