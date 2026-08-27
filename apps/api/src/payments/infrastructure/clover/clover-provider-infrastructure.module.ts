import { Module } from '@nestjs/common';

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
  ],
  exports: [
    CloverEcommerceTransport,
    CloverPaymentProviderAdapter,
    CloverPaymentWebhookIngressAdapter,
  ],
})
export class CloverProviderInfrastructureModule {}
