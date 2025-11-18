import { Module } from '@nestjs/common';
import { CloverHcoWebhookController } from './clover-webhooks.controller';
import { CheckoutIntentsModule } from './checkout-intents.module';
import { OrdersModule } from '../orders/orders.module';
import { CloverModule } from './clover.module';

@Module({
  imports: [CheckoutIntentsModule, OrdersModule, CloverModule],
  controllers: [CloverHcoWebhookController],
})
export class CloverWebhooksModule {}
