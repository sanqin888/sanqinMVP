import { Module } from '@nestjs/common';

import { AuthModule } from '../auth/auth.module';
import { LoyaltyModule } from '../loyalty/loyalty.module';
import { MembershipModule } from '../membership/membership.module';
import { OrdersModule } from '../orders/orders.module';
import { PaymentsModule } from '../payments/payments.module';
import { PosDeviceModule } from '../pos/pos-device.module';
import { PaymentCheckoutAttemptService } from './payment-checkout-attempt.service';
import { PosCardPaymentController } from './pos-card-payment.controller';
import { PosCardPaymentOrchestrationService } from './pos-card-payment-orchestration.service';

/**
 * Explicit composition layer for the Unified Payment Core's first consumer.
 *
 * Phase D allows this layer to coordinate provider-neutral checkout preparation,
 * Payments, Orders, Loyalty/Membership reservations and POS realtime/printing.
 * Provider infrastructure remains behind Payments; Web production checkout is
 * intentionally not routed through this module yet.
 */
@Module({
  imports: [
    AuthModule,
    PaymentsModule,
    OrdersModule,
    LoyaltyModule,
    MembershipModule,
    PosDeviceModule,
  ],
  controllers: [PosCardPaymentController],
  providers: [
    PaymentCheckoutAttemptService,
    PosCardPaymentOrchestrationService,
  ],
})
export class PosCardPaymentOrchestrationModule {}
