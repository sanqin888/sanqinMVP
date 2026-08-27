import { Module } from '@nestjs/common';

import { AuthModule } from '../auth/auth.module';
import { LoyaltyModule } from '../loyalty/loyalty.module';
import { MembershipModule } from '../membership/membership.module';
import { OrdersModule } from '../orders/orders.module';
import { PaymentsModule } from '../payments/payments.module';
import { PosDeviceModule } from '../pos/pos-device.module';
import { PosModule } from '../pos/pos.module';
import { PaymentCheckoutAttemptService } from './payment-checkout-attempt.service';
import { PaymentProviderWebhookController } from './payment-provider-webhook.controller';
import { PaymentReverseSyncOrchestrationService } from './payment-reverse-sync-orchestration.service';
import { PosCardPaymentController } from './pos-card-payment.controller';
import { PosCardPaymentOrchestrationService } from './pos-card-payment-orchestration.service';
import { PosCardRefundController } from './pos-card-refund.controller';
import { PosCardRefundOrchestrationService } from './pos-card-refund-orchestration.service';
import { PosFullRefundController } from './pos-full-refund.controller';
import { PosFullRefundOrchestrationService } from './pos-full-refund-orchestration.service';

/**
 * Explicit composition layer for the Unified Payment Core's first consumer.
 *
 * Phase D allows this layer to coordinate provider-neutral checkout preparation,
 * Payments, Orders, Loyalty/Membership reservations and POS realtime/printing.
 * Phase F also composes provider-neutral reverse-sync results into checkout/order
 * side effects. Raw Clover webhook contracts remain behind Payments infrastructure;
 * Web production checkout is intentionally not routed through this module yet.
 */
@Module({
  imports: [
    AuthModule,
    PaymentsModule,
    OrdersModule,
    LoyaltyModule,
    MembershipModule,
    PosDeviceModule,
    PosModule,
  ],
  controllers: [
    PosCardPaymentController,
    PosCardRefundController,
    PosFullRefundController,
    PaymentProviderWebhookController,
  ],
  providers: [
    PaymentCheckoutAttemptService,
    PaymentReverseSyncOrchestrationService,
    PosCardPaymentOrchestrationService,
    PosCardRefundOrchestrationService,
    PosFullRefundOrchestrationService,
  ],
})
export class PosCardPaymentOrchestrationModule {}
