import { Module } from '@nestjs/common';

import { PAYMENT_PROVIDER_WEBHOOK_INGRESS } from '../../application/payment-provider-webhook.port';
import {
  CloverPaymentProviderAdapter,
  CloverPlatformPaymentsGateway,
} from './clover-payment-provider.adapter';
import { CloverProviderConfig } from './clover-provider.config';
import { CloverEcommerceTransport } from './ecommerce/clover-ecommerce.transport';
import { CloverTerminalTransport } from './terminal/clover-terminal.transport';
import { CloverPaymentWebhookIngressAdapter } from './webhook/clover-payment-webhook-ingress.adapter';

@Module({
  providers: [
    CloverProviderConfig,
    CloverEcommerceTransport,
    CloverTerminalTransport,
    CloverPlatformPaymentsGateway,
    CloverPaymentProviderAdapter,
    CloverPaymentWebhookIngressAdapter,
    {
      provide: PAYMENT_PROVIDER_WEBHOOK_INGRESS,
      useExisting: CloverPaymentWebhookIngressAdapter,
    },
  ],
  exports: [
    CloverEcommerceTransport,
    CloverPaymentProviderAdapter,
    PAYMENT_PROVIDER_WEBHOOK_INGRESS,
  ],
})
export class CloverProviderInfrastructureModule {}
