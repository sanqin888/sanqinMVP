import {
  Injectable,
  Logger,
  OnModuleDestroy,
  OnModuleInit,
} from '@nestjs/common';
import { OrderEventsBus } from '../../messaging/order-events.bus';

@Injectable()
export class OrderEventListener implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(OrderEventListener.name);

  private readonly onPaid = (payload: { orderId: string }) => {
    this.logger.log(
      `[OrderEventListener] Deprecated listener received order.paid.verified for ${payload.orderId}`,
    );
  };

  constructor(private readonly events: OrderEventsBus) {}

  onModuleInit() {
    this.events.onOrderPaidVerified(this.onPaid);
  }

  onModuleDestroy() {
    this.events.offOrderPaidVerified(this.onPaid);
  }
}
