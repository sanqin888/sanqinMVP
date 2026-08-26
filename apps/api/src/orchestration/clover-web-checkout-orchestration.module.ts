import { Module } from '@nestjs/common';

import { CheckoutIntentsModule } from '../clover/checkout-intents.module';
import { CloverPayController } from '../clover/clover-pay.controller';
import { CloverModule } from '../clover/clover.module';
import { PricingTokenService } from '../clover/pricing-token.service';
import { EmailModule } from '../email/email.module';
import { OrdersModule } from '../orders/orders.module';
import { PhoneVerificationModule } from '../phone-verification/phone-verification.module';

/**
 * Explicit composition layer for the legacy Web checkout flow.
 *
 * It is intentionally the place that may depend on both Clover provider
 * capabilities and Orders while the Web checkout path is normalized in a
 * later phase. Clover provider infrastructure itself must not depend on Orders.
 */
@Module({
  imports: [
    CloverModule,
    OrdersModule,
    CheckoutIntentsModule,
    EmailModule,
    PhoneVerificationModule,
  ],
  providers: [PricingTokenService],
  controllers: [CloverPayController],
})
export class CloverWebCheckoutOrchestrationModule {}
