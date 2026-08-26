import { Module } from '@nestjs/common';

import { CloverPaymentProviderAdapter } from './clover-payment-provider.adapter';
import { CloverProviderConfig } from './clover-provider.config';
import { CloverEcommerceTransport } from './ecommerce/clover-ecommerce.transport';
import { CloverTerminalTransport } from './terminal/clover-terminal.transport';

@Module({
  providers: [
    CloverProviderConfig,
    CloverEcommerceTransport,
    CloverTerminalTransport,
    CloverPaymentProviderAdapter,
  ],
  exports: [CloverEcommerceTransport, CloverPaymentProviderAdapter],
})
export class CloverProviderInfrastructureModule {}
