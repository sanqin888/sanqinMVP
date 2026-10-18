import { Module } from '@nestjs/common';

import { AuthModule } from '../auth/auth.module';
import { PaymentBenefitsReservationModule } from '../benefits/public-api/payment-benefits-reservation.module';
import { OrdersModule } from '../orders/public-api';
import { PaymentsModule } from '../payments/payments.module';
import { PosDeviceModule } from '../pos/public-api';
import { PosModule } from '../pos/pos.module';
import { PaymentBenefitsReleaseRecoveryProcessor } from './payment-benefits-release-recovery.processor';
import { PaymentCheckoutAttemptService } from './payment-checkout-attempt.service';
import { PaymentProviderWebhookController } from './payment-provider-webhook.controller';
import { PaymentReverseSyncOrchestrationService } from './payment-reverse-sync-orchestration.service';
import { PosCardPaymentController } from './pos-card-payment.controller';
import { PosCardPaymentOrchestrationService } from './pos-card-payment-orchestration.service';
import { PaymentExceptionOrchestrationService } from './payment-exception-orchestration.service';
import { PosPaymentExceptionController } from './pos-payment-exception.controller';
import { AdminPaymentExceptionController } from './admin-payment-exception.controller';
import { PosCardRefundController } from './pos-card-refund.controller';
import { PosCardRefundOrchestrationService } from './pos-card-refund-orchestration.service';
import { PosFullRefundController } from './pos-full-refund.controller';
import { PosFullRefundOrchestrationService } from './pos-full-refund-orchestration.service';

/**
 * Explicit composition layer for the Unified Payment Core's first consumer.
 *
 * Phase D allows this layer to coordinate provider-neutral checkout preparation,
 * Payments, Orders, Benefits reservations, durable Orders lifecycle and POS realtime delivery.
 * Phase F also composes provider-neutral reverse-sync results into checkout/order
 * side effects. Raw Clover webhook contracts remain behind Payments infrastructure;
 * Web production checkout is intentionally not routed through this module yet.
 */
@Module({
  imports: [
    AuthModule,
    PaymentsModule,
    OrdersModule,
    PaymentBenefitsReservationModule,
    PosDeviceModule,
    PosModule,
  ],
  controllers: [
    PosCardPaymentController,
    PosPaymentExceptionController,
    AdminPaymentExceptionController,
    PosCardRefundController,
    PosFullRefundController,
    PaymentProviderWebhookController,
  ],
  providers: [
    PaymentCheckoutAttemptService,
    PaymentBenefitsReleaseRecoveryProcessor,
    PaymentReverseSyncOrchestrationService,
    PosCardPaymentOrchestrationService,
    PaymentExceptionOrchestrationService,
    PosCardRefundOrchestrationService,
    PosFullRefundOrchestrationService,
  ],
})
export class PosCardPaymentOrchestrationModule {}
