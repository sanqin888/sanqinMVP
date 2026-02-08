import { Module } from '@nestjs/common';
import { CloverService } from './clover.service';
import { CloverController } from './clover.controller';
import { CloverPayController } from './clover-pay.controller';
import { OrdersModule } from '../orders/orders.module';
import { CheckoutIntentsModule } from './checkout-intents.module';

@Module({
  imports: [OrdersModule, CheckoutIntentsModule],
  providers: [CloverService],
  controllers: [CloverController, CloverPayController],
  exports: [CloverService],
})
export class CloverModule {}
