import { Module } from '@nestjs/common';
import { CloverHcoWebhookController } from './clover-webhooks.controller';
import { CheckoutIntentsModule } from './checkout-intents.module';
import { OrdersModule } from '../orders/orders.module';
import { CloverModule } from './clover.module';
import { CloverWebhookProcessor } from './clover-webhook.processor';

@Module({
  imports: [CheckoutIntentsModule, OrdersModule, CloverModule],
  controllers: [CloverHcoWebhookController],
  providers: [CloverWebhookProcessor],
})
export class CloverWebhooksModule {}
