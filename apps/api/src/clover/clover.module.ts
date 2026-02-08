import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { CloverService } from './clover.service';
import { CloverController } from './clover.controller';
import { CloverPayController } from './clover-pay.controller';
import { CloverWebhookController } from './clover-webhook.controller';
import { CloverWebhookService } from './clover-webhook.service';
import { OrdersModule } from '../orders/orders.module';
import { CheckoutIntentsModule } from './checkout-intents.module';

@Module({
  imports: [ConfigModule, OrdersModule, CheckoutIntentsModule],
  providers: [CloverService, CloverWebhookService],
  controllers: [CloverController, CloverPayController, CloverWebhookController],
  exports: [CloverService],
})
export class CloverModule {}
