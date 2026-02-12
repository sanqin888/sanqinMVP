import {
  Injectable,
  Logger,
  OnModuleDestroy,
  OnModuleInit,
} from '@nestjs/common';
import { OrderEventsBus } from '../../messaging/order-events.bus';
import { LoyaltyService } from '../../loyalty/loyalty.service';

@Injectable()
export class LoyaltyProcessor implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(LoyaltyProcessor.name);

  private readonly onPaid = async (payload: {
    orderId: string;
    userId?: string;
    amountCents?: number;
    redeemValueCents?: number;
  }) => {
    try {
      await this.loyaltyService.settleOnPaid({
        orderId: payload.orderId,
        userId: payload.userId,
        subtotalCents: payload.amountCents ?? 0,
        redeemValueCents: payload.redeemValueCents ?? 0,
      });
      this.logger.log(`[Loyalty] Settled order: ${payload.orderId}`);
    } catch (error) {
      this.logger.error(
        `[Loyalty] Settle failed for ${payload.orderId}: ${
          error instanceof Error ? error.message : String(error)
        }`,
      );
    }
  };

  constructor(
    private readonly events: OrderEventsBus,
    private readonly loyaltyService: LoyaltyService,
  ) {}

  onModuleInit() {
    this.events.onOrderPaidVerified(this.onPaid);
  }

  onModuleDestroy() {
    this.events.offOrderPaidVerified(this.onPaid);
  }
}
